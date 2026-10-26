import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { getVideoMetadata } from "@remotion/renderer";
import { effects } from "../src/lib/effects";
import {
  renderClaimedItem,
  createRenderBrowser,
  closeRenderBrowser,
  type RenderMetrics,
} from "../src/lib/render-video";
import { listMusicTracks } from "../src/lib/music";
import { resolvedRandomParams } from "../src/lib/effect-allocation";
import type { ClaimedRenderItem, ImageRow } from "../src/lib/jobs";
const resultRoot = path.resolve(process.env.MOTION_BENCHMARK_ROOT!);
await fs.mkdir(resultRoot, { recursive: true });
const profile = process.env.MOTION_BENCHMARK_PROFILE ?? "optimized4";
const round = Number(process.env.MOTION_BENCHMARK_ROUND ?? 1);
const concurrency = profile === "optimized3" ? 3 : 4;
const music = listMusicTracks()[0];
if (!music) throw Error("音乐库为空");
const images: ImageRow[] = [];
for (let index = 0; index < 6; index++) {
  const file = path.join(resultRoot, `fixture-${index}.png`);
  const w = index === 5 ? 720 : 1280,
    h = index === 5 ? 1280 : 720;
  if (!(await fs.stat(file).catch(() => null)))
    await sharp(
      path.resolve(
        process.env.MOTION_PROJECT_ROOT!,
        "public/preview-placeholder.png",
      ),
    )
      .resize(w, h, { fit: "cover" })
      .composite([
        {
          input: Buffer.from(
            `<svg width="${w}" height="${h}"><rect x="30" y="30" width="240" height="120" rx="18" fill="hsl(${index * 48},80%,65%)"/><text x="50" y="110" font-size="55" fill="#123">${index + 1}</text></svg>`,
          ),
        },
      ])
      .png()
      .toFile(file);
  images.push({
    id: `bench${index}`,
    owner_id: "benchmark",
    original_name: `fixture-${index}.png`,
    stored_name: `fixture-${index}.png`,
    file_path: file,
    mime_type: "image/png",
    width: w,
    height: h,
    size_bytes: 1,
    created_at: new Date().toISOString(),
  });
}
const candidates = [
  effects.find((e) => e.id === "basic_zoom_in")!,
  effects.find((e) => e.category === "combo")!,
  effects.find((e) => e.category === "3d")!,
  ...effects.filter((e) => e.category === "reference_light").slice(0, 3),
];
const items: ClaimedRenderItem[] = candidates.map((effect, i) => ({
  id: `bench${i}`,
  job_id: "bench",
  image_id: images[i].id,
  effect_id: effect.id,
  effect_name: effect.name,
  effect_snapshot_json: JSON.stringify(effect),
  seed: 500 + i,
  params_json: "{}",
  status: "rendering",
  progress: 0,
  music_name: music.name,
  music_path: music.filePath,
  position: i,
  output_path: null,
  error_message: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  toolType: "single_intro",
  image: images[i],
  images: [images[i]],
  request: {
    toolType: "single_intro",
    imageIds: [images[i].id],
    ratio: "source",
    durationSec: 5,
    countPerImage: 1,
    effectMode: "specific",
    selectedCategories: [],
    selectedEffectIds: [effect.id],
    allowDuplicate: false,
    introDurationSec: 1.2,
    intensity: "medium",
    enableBreathing: true,
    resolution: "720p",
  },
  effect,
  params: resolvedRandomParams(500 + i),
}));
for (let i = 0; i < 2; i++)
  items.push({
    ...items[0],
    id: `sequence${i}`,
    toolType: "three_image_motion",
    image: images[i * 3],
    images: images.slice(i * 3, i * 3 + 3) as [ImageRow, ImageRow, ImageRow],
    effect: null,
    seed: 100 + i,
    params: {},
    request: {
      toolType: "three_image_motion",
      imageIds: images.slice(i * 3, i * 3 + 3).map((x) => x.id),
      ratio: "source",
      durationSec: 15,
      secondsPerImage: 5,
      transition: "cut",
      motionPath: "smooth_loop",
      edgeMode: "auto_zoom",
      motionSpeed: 0.8,
      motionAmplitude: 0.025,
      enableMusic: true,
      resolution: "720p",
    },
  } as ClaimedRenderItem);
const queue = [...items],
  records: Array<{ id: string; metrics: RenderMetrics }> = [];
let activeSequence = 0;
let peakUsed = os.totalmem() - os.freemem();
const monitor = setInterval(() => {
  peakUsed = Math.max(peakUsed, os.totalmem() - os.freemem());
}, 500);
const started = performance.now();
try {
  await Promise.all(
    [0, 1].map(async () => {
      const browser = await createRenderBrowser();
      try {
        while (queue.length) {
          const index = queue.findIndex(
            (x) =>
              profile !== "baseline" ||
              !activeSequence ||
              x.toolType !== "three_image_motion",
          );
          if (index < 0) {
            await new Promise((r) => setTimeout(r, 100));
            continue;
          }
          const item = queue.splice(index, 1)[0];
          if (item.toolType === "three_image_motion") activeSequence++;
          try {
            const output = path.join(
              resultRoot,
              `${profile}-${round}-${item.id}.mp4`,
            );
            const metrics = await renderClaimedItem(item, output, {
              browser,
              concurrency,
              preset: "veryfast",
            });
            const metadata = await getVideoMetadata(output);
            if (
              metadata.codec !== "h264" ||
              metadata.audioCodec !== "aac" ||
              Math.abs(
                (metadata.durationInSeconds ?? 0) -
                  (item.toolType === "single_intro" ? 5 : 15),
              ) > 0.1
            )
              throw Error("成品规格错误");
            records.push({ id: item.id, metrics });
            console.log(profile, round, item.id, JSON.stringify(metrics));
          } finally {
            if (item.toolType === "three_image_motion") activeSequence--;
          }
        }
      } finally {
        await closeRenderBrowser(browser);
      }
    }),
  );
} finally {
  clearInterval(monitor);
}
const result = {
  profile,
  round,
  graphics: process.env.MOTION_RENDER_GL ?? "angle",
  sequenceEngine: process.env.MOTION_SEQUENCE_ENGINE ?? "remotion",
  elapsedMs: Math.round(performance.now() - started),
  peakSystemGB: Math.round((peakUsed / 1024 ** 3) * 10) / 10,
  records,
};
await fs.writeFile(
  path.join(resultRoot, `${profile}-${round}.json`),
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result));
