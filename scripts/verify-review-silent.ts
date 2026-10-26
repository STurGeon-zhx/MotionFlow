import fs from "node:fs/promises";
import path from "node:path";
import { getVideoMetadata } from "@remotion/renderer";
const root = path.resolve(".data/review");
const runtime = JSON.parse(
  await fs.readFile(path.join(root, "desktop/runtime.json"), "utf8"),
);
const cookie = "motion_device_id=device_" + "c".repeat(32);
async function api(route: string, options: RequestInit = {}) {
  const response = await fetch(runtime.appUrl + route, {
    ...options,
    headers: { cookie, ...options.headers },
  });
  const data = await response.json();
  if (!response.ok) throw Error(route + " " + JSON.stringify(data));
  return data;
}
const form = new FormData();
form.append("workspaceType", "three_image_motion");
// Upload the existing diagnostic PNGs, not private user media.
for (let index = 0; index < 3; index++) {
  const image = await fs.readFile(
    path.join(root, "benchmark", `fixture-${index}.png`),
  );
  form.append(
    "files",
    new Blob([image], { type: "image/png" }),
    `静音验证${index}.png`,
  );
}
await api("/api/images?workspaceType=three_image_motion", { method: "DELETE" });
const images = (await api("/api/images", { method: "POST", body: form }))
  .images;
const created = await api("/api/video-jobs", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    toolType: "three_image_motion",
    imageIds: images.map((image: { id: string }) => image.id),
    ratio: "source",
    durationSec: 15,
    secondsPerImage: 5,
    transition: "cut",
    motionPath: "smooth_loop",
    edgeMode: "auto_zoom",
    motionSpeed: 0.3,
    motionAmplitude: 0.15,
    enableMusic: false,
    resolution: "720p",
  }),
});
let job;
const start = Date.now();
do {
  job = (await api("/api/video-jobs/" + created.jobId)).job;
  if (["failed", "partial_failed"].includes(job.status))
    throw Error(JSON.stringify(job));
  if (job.status === "completed") break;
  await new Promise((resolve) => setTimeout(resolve, 200));
} while (Date.now() - start < 30000);
if (job.status !== "completed") throw Error("静音验证超时");
const metadata = await getVideoMetadata(
  path.join(root, "desktop/data/outputs", job.items[0].id + ".mp4"),
);
if (
  metadata.audioCodec !== null ||
  metadata.codec !== "h264" ||
  Math.abs((metadata.durationInSeconds ?? 0) - 15) > 0.1
)
  throw Error("静音视频规格不正确 " + JSON.stringify(metadata));
const report = {
  passed: true,
  tool: "three_image_motion",
  motionSpeed: 0.3,
  motionAmplitude: 0.15,
  audioCodec: metadata.audioCodec,
  codec: metadata.codec,
  duration: metadata.durationInSeconds,
  width: metadata.width,
  height: metadata.height,
};
await fs.writeFile(
  path.join(root, "silent-render-report.json"),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
