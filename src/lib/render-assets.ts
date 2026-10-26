import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { randomBytes, createHash } from "node:crypto";
import sharp from "sharp";
import { dataRoot } from "./storage";

let serverPromise: Promise<{ origin: string; server: http.Server }> | null =
  null;
const grants = new Map<string, { file: string; mime: string }>();
function startAssetServer() {
  return (serverPromise ??= new Promise<{
    origin: string;
    server: http.Server;
  }>((resolve, reject) => {
    const server = http.createServer(async (request, response) => {
      const asset = grants.get((request.url ?? "").split("?")[0].slice(1));
      if (!asset || !["GET", "HEAD"].includes(request.method ?? "")) {
        response.writeHead(404).end();
        return;
      }
      try {
        const { size } = await fs.promises.stat(asset.file);
        const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range ?? "");
        const start = range ? Number(range[1]) : 0;
        const end = range?.[2]
          ? Math.min(Number(range[2]), size - 1)
          : size - 1;
        if (start > end || start >= size) {
          response.writeHead(416, { "Content-Range": `bytes */${size}` }).end();
          return;
        }
        response.writeHead(range ? 206 : 200, {
          "Content-Type": asset.mime,
          "Content-Length": end - start + 1,
          "Accept-Ranges": "bytes",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "private, max-age=3600",
          ...(range
            ? { "Content-Range": `bytes ${start}-${end}/${size}` }
            : {}),
        });
        if (request.method === "HEAD") {
          response.end();
          return;
        }
        const stream = fs.createReadStream(asset.file, { start, end });
        stream.on("error", () => response.destroy());
        response.on("close", () => stream.destroy());
        stream.pipe(response);
      } catch {
        response.writeHead(404).end();
      }
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.unref();
      resolve({
        origin: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
        server,
      });
    });
  }).catch((error) => {
    serverPromise = null;
    throw error;
  }));
}
export async function createAssetGrant() {
  const { origin } = await startAssetServer();
  const keys: string[] = [];
  return {
    add(file: string, mime: string) {
      const key = randomBytes(32).toString("hex");
      keys.push(key);
      grants.set(key, { file, mime });
      return `${origin}/${key}`;
    },
    release() {
      for (const key of keys) grants.delete(key);
    },
  };
}

export async function prepareRenderImage(
  file: string,
  width: number,
  height: number,
  maxScale = 1.5,
  backgroundScale = 1.16,
) {
  const stat = await fs.promises.stat(file);
  const key = createHash("sha256")
    .update(
      JSON.stringify([
        file,
        stat.size,
        stat.mtimeMs,
        width,
        height,
        maxScale,
        backgroundScale,
        3,
      ]),
    )
    .digest("hex");
  const dir = path.join(dataRoot, "render-cache");
  await fs.promises.mkdir(dir, { recursive: true });
  const foreground = path.join(dir, `${key}-image.png`);
  const background = path.join(dir, `${key}-background.png`);
  if (!fs.existsSync(foreground)) {
    const temp = `${foreground}.${randomBytes(6).toString("hex")}.png`;
    await sharp(file)
      .rotate()
      .resize({
        width: Math.ceil(width * maxScale),
        height: Math.ceil(height * maxScale),
        fit: "inside",
        withoutEnlargement: true,
      })
      .png()
      .toFile(temp);
    await fs.promises.rename(temp, foreground).catch(async (error) => {
      await fs.promises.rm(temp, { force: true });
      if (!fs.existsSync(foreground)) throw error;
    });
  }
  if (!fs.existsSync(background)) {
    const temp = `${background}.${randomBytes(6).toString("hex")}.png`;
    // The CSS background is fixed at blur(44px), brightness(.58), saturate(1.1), then scale(1.16).
    await sharp(file)
      .rotate()
      .resize(width, height, { fit: "cover" })
      .blur(44)
      .recomb([
        [0.625646, -0.04147, -0.004176],
        [-0.012354, 0.59653, -0.004176],
        [-0.012354, -0.04147, 0.633824],
      ])
      .resize(
        Math.ceil(width * backgroundScale),
        Math.ceil(height * backgroundScale),
      )
      .extract({
        left: Math.floor((Math.ceil(width * backgroundScale) - width) / 2),
        top: Math.floor((Math.ceil(height * backgroundScale) - height) / 2),
        width,
        height,
      })
      .png()
      .toFile(temp);
    await fs.promises.rename(temp, background).catch(async (error) => {
      await fs.promises.rm(temp, { force: true });
      if (!fs.existsSync(background)) throw error;
    });
  }
  return { foreground, background };
}

export async function closeRenderAssetServer() {
  if (!serverPromise) return;
  const {server} = await serverPromise;
  server.closeAllConnections();
  await new Promise<void>(resolve=>server.close(()=>resolve()));
  serverPromise = null;
}
