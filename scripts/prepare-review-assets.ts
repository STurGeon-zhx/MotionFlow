import fs from "node:fs/promises";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import {
  openBrowser,
  renderStill,
  selectComposition,
} from "@remotion/renderer";
import sharp from "sharp";
import { effects } from "../src/lib/effects";
import { defaultVideoProps } from "../src/remotion/types";
const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, ".data/review/remotion-bundle");
const serveUrl = await bundle({
  entryPoint: path.join(root, "src/remotion/index.ts"),
  outDir: out,
  publicDir: path.join(root, "public"),
  webpackOverride: (config) => ({
    ...config,
    resolve: {
      ...config.resolve,
      alias: {
        ...(Array.isArray(config.resolve?.alias) ? {} : config.resolve?.alias),
        "@": path.join(root, "src"),
      },
    },
  }),
});
console.log("Remotion 预构建完成", serveUrl);
if (process.argv.includes("--covers")) {
  const dir = path.join(root, "public/effect-thumbnails");
  await fs.mkdir(dir, { recursive: true });
  const browser = await openBrowser("chrome", {
    chromiumOptions: { gl: "angle" },
    logLevel: "warn",
  });
  const sample =
    "data:image/svg+xml;base64," +
    (await fs.readFile(path.join(root, "public/preview-sample.svg"))).toString(
      "base64",
    );
  const composition = await selectComposition({
    serveUrl,
    id: "ImageIntroVideo",
    inputProps: {
      ...defaultVideoProps,
      width: 1280,
      height: 720,
      imageSrc: sample,
    },
    puppeteerInstance: browser,
  });
  const queue = [...effects.filter((effect) => effect.enabled)];
  let count = 0;
  try {
    await Promise.all(
      [0, 1, 2].map(async () => {
        while (queue.length) {
          const effect = queue.shift()!;
          const output = path.join(dir, `${effect.id}.webp`);
          if (await fs.stat(output).catch(() => null)) {
            count++;
            continue;
          }
          const inputProps = {
            ...defaultVideoProps,
            width: 1280,
            height: 720,
            imageSrc: sample,
            effect,
          };
          const png = await renderStill({
            serveUrl,
            composition: { ...composition, props: inputProps },
            inputProps,
            frame: effect.category === "reference_light" ? 15 : 18,
            imageFormat: "png",
            puppeteerInstance: browser,
            logLevel: "warn",
          });
          if (!png.buffer) throw Error("封面没有输出");
          await sharp(png.buffer)
            .resize(300, 200, { fit: "cover" })
            .webp({ quality: 82 })
            .toFile(output);
          if (++count % 20 === 0) console.log("真实特效封面", count);
        }
      }),
    );
  } finally {
    await browser.close({ silent: true });
  }
  console.log("封面完成", count);
}
