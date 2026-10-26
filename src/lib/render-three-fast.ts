import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import sharp from "sharp";
import { getThreeImageMotion } from "../remotion/three-image-motion";
import { getSourceDimensions } from "./video-config";
import { prepareRenderImage } from "./render-assets";
import type { ClaimedThreeImageMotionItem } from "./jobs";
import type { RenderClaimedItemOptions, RenderMetrics } from "./render-video";

export async function renderThreeImageFast(
  item: ClaimedThreeImageMotionItem,
  outputPath: string,
  options: Pick<
    RenderClaimedItemOptions,
    "preset" | "cancelSignal" | "onProgress" | "onStage"
  >,
): Promise<RenderMetrics> {
  const started = performance.now();
  let canceled = false;
  options.cancelSignal?.(() => {
    canceled = true;
  });
  const { width, height } = getSourceDimensions(
    item.image.width,
    item.image.height,
    item.request.resolution,
  );
  const scale = getThreeImageMotion(
    0,
    item.request.motionSpeed,
    item.request.motionAmplitude,
    width,
    height,
    item.seed,
  ).scale;
  const expandedWidth = Math.ceil(width * scale),
    expandedHeight = Math.ceil(height * scale);
  options.onStage?.("preparing");
  const prepared = await Promise.all(
    item.images.map(async (image) => {
      const paths = await prepareRenderImage(
        image.file_path,
        width,
        height,
        1.5,
        1.18,
      );
      const foreground = await sharp(paths.foreground)
        .resize(expandedWidth, expandedHeight, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .ensureAlpha()
        .raw()
        .toBuffer();
      const background = await sharp(paths.background)
        .removeAlpha()
        .raw()
        .toBuffer();
      return { foreground, background };
    }),
  );
  if (canceled) throw new Error("渲染已取消");
  const preparationMs = Math.round(performance.now() - started);
  const require = createRequire(import.meta.url);
  const executable = path.join(
    path.dirname(
      require.resolve("@remotion/compositor-win32-x64-msvc/package.json"),
    ),
    "ffmpeg.exe",
  );
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "image2pipe",
    "-vcodec",
    "png",
    "-r",
    "30",
    "-i",
    "pipe:0",
  ];
  if (item.music_path) args.push("-stream_loop", "-1", "-i", item.music_path);
  args.push(
    "-map",
    "0:v",
    "-c:v",
    "libx264",
    "-preset",
    options.preset,
    "-crf",
    item.request.resolution === "1080p" ? "18" : "20",
    "-pix_fmt",
    "yuv420p",
    "-threads",
    "2",
  );
  if (item.music_path)
    args.push(
      "-map",
      "1:a",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-af",
      "volume=0.35",
    );
  else args.push("-an");
  args.push("-t", "15", "-movflags", "+faststart", outputPath);
  const child = spawn(executable, args, {
    windowsHide: true,
    stdio: ["pipe", "ignore", "pipe"],
    cwd: path.dirname(executable),
  });
  let stderr = "",
    processError: Error | null = null;
  child.stderr.on("data", (data) => {
    stderr = (stderr + data).slice(-4000);
  });
  child.on("error", (error) => {
    processError = error;
  });
  child.stdin.on("error", (error) => {
    processError = error;
  });
  const exited = new Promise<number | null>((resolve) => {
    child.once("close", resolve);
    child.once("error", () => resolve(-1));
  });
  options.cancelSignal?.(() => {
    canceled = true;
    child.kill();
  });
  options.onStage?.("rendering");
  const frameStart = performance.now();
  try {
    for (let frame = 0; frame < 450; frame++) {
      if (canceled) throw new Error("渲染已取消");
      if (processError) throw processError;
      const motion = getThreeImageMotion(
        frame,
        item.request.motionSpeed,
        item.request.motionAmplitude,
        width,
        height,
        item.seed,
      );
      const source = prepared[motion.imageIndex];
      const left = Math.max(
        0,
        Math.min(
          expandedWidth - width,
          Math.round((expandedWidth - width) / 2 - motion.translateX),
        ),
      );
      const top = Math.max(
        0,
        Math.min(
          expandedHeight - height,
          Math.round((expandedHeight - height) / 2 - motion.translateY),
        ),
      );
      const overlay = await sharp(source.foreground, {
        raw: { width: expandedWidth, height: expandedHeight, channels: 4 },
      })
        .extract({ left, top, width, height })
        .raw()
        .toBuffer();
      const pixels = await sharp(source.background, {
        raw: { width, height, channels: 3 },
      })
        .composite([{ input: overlay, raw: { width, height, channels: 4 } }])
        .removeAlpha()
        .png({ compressionLevel: 0 })
        .toBuffer();
      if (!child.stdin.write(pixels)) await once(child.stdin, "drain");
      options.onProgress?.(((frame + 1) / 450) * 0.97);
    }
    const renderedMs = Math.round(performance.now() - frameStart);
    options.onStage?.("encoding");
    child.stdin.end();
    const encodeStart = performance.now();
    const code = await exited;
    if (canceled) throw new Error("渲染已取消");
    if (code !== 0) throw new Error(`三图编码失败 ${processError ?? stderr}`);
    options.onProgress?.(1);
    return {
      engine: "sharp",
      totalMs: Math.round(performance.now() - started),
      preparationMs,
      initializationMs: 0,
      renderedMs,
      encodedMs: Math.round(performance.now() - encodeStart),
      resolvedConcurrency: 1,
    };
  } catch (error) {
    child.kill();
    await exited;
    await fs.rm(outputPath, { force: true }).catch(() => {});
    throw new Error(
      `${error instanceof Error ? error.message : String(error)} ${stderr}`,
    );
  }
}
