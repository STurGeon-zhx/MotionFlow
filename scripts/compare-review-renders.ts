import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
const require = createRequire(import.meta.url);
const bin = path.dirname(
  require.resolve("@remotion/compositor-win32-x64-msvc/package.json"),
);
const root = path.resolve(".data/review/benchmark");
const extract = (file: string, frame: number) =>
  execFileSync(
    path.join(bin, "ffmpeg.exe"),
    [
      "-v",
      "error",
      "-ss",
      (frame / 30).toFixed(8),
      "-i",
      file,
      "-frames:v",
      "1",
      "-f",
      "image2pipe",
      "-c:v",
      "png",
      "pipe:1",
    ],
    { windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  );
const records = [];
for (const id of [
  "bench0",
  "bench1",
  "bench2",
  "bench3",
  "bench4",
  "bench5",
  "sequence0",
  "sequence1",
]) {
  const frames = id.startsWith("sequence")
    ? [0, 1, 149, 150, 151, 299, 300, 301, 449]
    : [0, 1, 15, 30, 60, 100, 149];
  const output = path.join(root, `optimized4-2-${id}.mp4`);
  const streams = JSON.parse(
    execFileSync(
      path.join(bin, "ffprobe.exe"),
      ["-v", "error", "-show_streams", "-of", "json", output],
      { encoding: "utf8", windowsHide: true },
    ),
  ).streams;
  const video = streams.find(
    (s: { codec_type: string }) => s.codec_type === "video",
  );
  if (
    video.codec_name !== "h264" ||
    video.r_frame_rate !== "30/1" ||
    Number(video.nb_frames) !== (id.startsWith("sequence") ? 450 : 150)
  )
    throw Error("视频规格异常 " + id);
  for (const frame of frames) {
    const baseline = await sharp(
      extract(path.join(root, `baseline-2-${id}.mp4`), frame),
    )
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const optimized = await sharp(extract(output, frame))
      .removeAlpha()
      .raw()
      .toBuffer();
    let sum = 0,
      large = 0,
      nonBlack = 0;
    for (let i = 0; i < optimized.length; i++) {
      const delta = Math.abs(optimized[i] - baseline.data[i]);
      sum += delta;
      if (delta > 24) large++;
      if (optimized[i] > 24) nonBlack++;
    }
    const record = {
      id,
      frame,
      meanAbsoluteError: Math.round((sum / optimized.length) * 100) / 100,
      changedChannelsPercent:
        Math.round((large / optimized.length) * 1000) / 10,
      nonBlackPercent: Math.round((nonBlack / optimized.length) * 1000) / 10,
    };
    records.push(record);
    if (nonBlack / optimized.length < 0.02)
      throw Error("检测到黑帧 " + id + " " + frame);
  }
}
await fs.writeFile(
  path.join(root, "visual-comparison.json"),
  JSON.stringify(records, null, 2),
);
console.log(JSON.stringify(records, null, 2));
