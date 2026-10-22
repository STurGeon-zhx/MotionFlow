import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {getVideoMetadata, type HeadlessBrowser, type X264Preset} from '@remotion/renderer';
import {effects} from '../src/lib/effects';
import type {ClaimedRenderItem, ClaimedThreeImageMotionItem, ImageRow} from '../src/lib/jobs';
import {listMusicTracks} from '../src/lib/music';
import {closeRenderBrowser, createRenderBrowser, renderClaimedItem} from '../src/lib/render-video';
import {dataRoot, ensureStorage} from '../src/lib/storage';
import {runWorkerSlots} from '../src/lib/worker-runtime';

type Profile = {name: string; slots: number; concurrency: number; preset: X264Preset};
const wait = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

ensureStorage();
const benchmarkDir = path.join(dataRoot, 'render-benchmark');
await fs.rm(benchmarkDir, {recursive: true, force: true});
await fs.mkdir(benchmarkDir, {recursive: true});
const music = listMusicTracks()[0];
if (!music) throw new Error('音乐库中没有可用于渲染基准的音乐');

const imageRows: ImageRow[] = [];
for (let index = 0; index < 6; index++) {
  const filePath = path.join(benchmarkDir, `source-${index + 1}.jpg`);
  await sharp({create: {width: 1920, height: 1080, channels: 3, background: {r: 35 + index * 25, g: 90 + index * 16, b: 190 - index * 18}}})
    .jpeg({quality: 92})
    .toFile(filePath);
  imageRows.push({
    id: `benchmark-image-${index + 1}`, owner_id: 'benchmark', original_name: `source-${index + 1}.jpg`, stored_name: `source-${index + 1}.jpg`,
    file_path: filePath, mime_type: 'image/jpeg', width: 1920, height: 1080, size_bytes: 1, created_at: new Date().toISOString(),
  });
}

const selectedEffects = effects.filter((effect) => effect.enabled).slice(0, 6);
if (selectedEffects.length < 6) throw new Error('可用特效不足 6 个，无法执行基准');
const now = new Date().toISOString();
const singleItems = selectedEffects.map((effect, index) => ({
  id: `benchmark-single-${index + 1}`, job_id: 'benchmark-single-job', image_id: imageRows[index].id,
  effect_id: effect.id, effect_name: effect.name, effect_snapshot_json: JSON.stringify(effect), seed: 100 + index,
  params_json: '{}', status: 'rendering', progress: 0, music_name: music.name, music_path: music.filePath, position: index,
  output_path: null, error_message: null, created_at: now, updated_at: now, toolType: 'single_intro',
  image: imageRows[index], images: [imageRows[index]],
  request: {toolType: 'single_intro', imageIds: [imageRows[index].id], ratio: 'source', durationSec: 5, countPerImage: 1, effectMode: 'all_random', selectedCategories: [], selectedEffectIds: [], allowDuplicate: false, introDurationSec: 1.2, intensity: 'medium', enableBreathing: true, resolution: '1080p'},
  effect, params: {scaleMultiplier: 1, translateMultiplier: 1, rotateMultiplier: 1, blurMultiplier: 1},
})) as ClaimedRenderItem[];

const sequenceItems = [0, 1].map((index) => ({
  id: `benchmark-sequence-${index + 1}`, job_id: 'benchmark-sequence-job', image_id: imageRows[index * 3].id,
  effect_id: 'three_image_motion', effect_name: '三图缓慢移动', effect_snapshot_json: '{}', seed: 200 + index,
  params_json: '{}', status: 'rendering', progress: 0, music_name: music.name, music_path: music.filePath, position: index,
  output_path: null, error_message: null, created_at: now, updated_at: now, toolType: 'three_image_motion',
  image: imageRows[index * 3], images: imageRows.slice(index * 3, index * 3 + 3) as [ImageRow, ImageRow, ImageRow],
  request: {toolType: 'three_image_motion', imageIds: imageRows.slice(index * 3, index * 3 + 3).map((image) => image.id), ratio: 'source', durationSec: 15, secondsPerImage: 5, transition: 'cut', motionPath: 'smooth_loop', edgeMode: 'auto_zoom', motionSpeed: .8, motionAmplitude: .025, enableMusic: true, resolution: '1080p'},
  effect: null, params: {motionSpeed: .8, motionAmplitude: .025, enableMusic: true},
})) as ClaimedThreeImageMotionItem[];
const benchmarkItems: ClaimedRenderItem[] = [...singleItems, ...sequenceItems];

async function validateOutput(outputPath: string, item: ClaimedRenderItem) {
  const metadata = await getVideoMetadata(outputPath);
  const duration = item.toolType === 'three_image_motion' ? 15 : 5;
  if (metadata.width !== 1920 || metadata.height !== 1080 || metadata.codec !== 'h264' || metadata.audioCodec !== 'aac' || Math.abs((metadata.durationInSeconds ?? 0) - duration) > .1) {
    throw new Error(`${path.basename(outputPath)} 输出规格不正确`);
  }
}

async function runProfile(profile: Profile, round: number) {
  const queue = [...benchmarkItems];
  const browsers: Array<HeadlessBrowser | null> = Array.from({length: profile.slots}, () => null);
  const failures: Error[] = [];
  let completed = 0;
  let activeSequenceRenders = 0;
  let peakUsedMemory = os.totalmem() - os.freemem();
  const monitor = setInterval(() => { peakUsedMemory = Math.max(peakUsedMemory, os.totalmem() - os.freemem()); }, 250);
  const startedAt = performance.now();
  try {
    await runWorkerSlots({
      slots: profile.slots,
      shouldStop: () => completed + failures.length === benchmarkItems.length,
      claim: () => {
        const nextIndex = queue.findIndex((item) => activeSequenceRenders === 0 || item.toolType !== 'three_image_motion');
        return nextIndex === -1 ? null : queue.splice(nextIndex, 1)[0];
      },
      handle: async (item, slotId) => {
        const outputPath = path.join(benchmarkDir, `${profile.name}-${round}-${item.id}.mp4`);
        const sequence = item.toolType === 'three_image_motion';
        if (sequence) activeSequenceRenders++;
        try {
          if (!browsers[slotId - 1]) browsers[slotId - 1] = await createRenderBrowser();
          await renderClaimedItem(item, outputPath, {browser: browsers[slotId - 1]!, concurrency: profile.concurrency, preset: profile.preset});
          await validateOutput(outputPath, item);
          completed++;
          console.log(`[benchmark:${profile.name}:${round}] ${completed}/${benchmarkItems.length} ${item.id}`);
        } catch (error) {
          failures.push(error instanceof Error ? error : new Error(String(error)));
        } finally {
          if (sequence) activeSequenceRenders--;
        }
      },
      idleWait: () => wait(300),
    });
  } finally {
    clearInterval(monitor);
    await Promise.all(browsers.map((browser) => closeRenderBrowser(browser)));
  }
  if (failures.length) throw new AggregateError(failures, `${profile.name} 第 ${round} 轮有 ${failures.length} 条失败`);
  return {elapsedMs: Math.round(performance.now() - startedAt), peakUsedMemory};
}

const warmupOutput = path.join(benchmarkDir, 'warmup.mp4');
const warmupBrowser = await createRenderBrowser();
try {
  await renderClaimedItem(singleItems[0], warmupOutput, {browser: warmupBrowser, concurrency: 2, preset: 'medium'});
} finally {
  await closeRenderBrowser(warmupBrowser);
}

const baseline = await runProfile({name: 'baseline', slots: 1, concurrency: 2, preset: 'medium'}, 1);
const optimizedRounds = [
  await runProfile({name: 'optimized', slots: 2, concurrency: 4, preset: 'veryfast'}, 1),
  await runProfile({name: 'optimized', slots: 2, concurrency: 4, preset: 'veryfast'}, 2),
];
const optimizedAverage = optimizedRounds.reduce((sum, round) => sum + round.elapsedMs, 0) / optimizedRounds.length;
const improvement = 1 - optimizedAverage / baseline.elapsedMs;
const peakMemory = Math.max(baseline.peakUsedMemory, ...optimizedRounds.map((round) => round.peakUsedMemory));
console.log(JSON.stringify({
  baselineSeconds: baseline.elapsedMs / 1000,
  optimizedSeconds: optimizedRounds.map((round) => round.elapsedMs / 1000),
  improvementPercent: Math.round(improvement * 1000) / 10,
  peakSystemMemoryGB: Math.round(peakMemory / 1024 / 1024 / 1024 * 10) / 10,
}, null, 2));
if (improvement < .4) throw new Error(`整批加速仅 ${(improvement * 100).toFixed(1)}%，未达到 40%`);
if (peakMemory > 26 * 1024 ** 3) throw new Error('系统内存峰值超过 26GB');
