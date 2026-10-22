import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {getVideoMetadata} from '@remotion/renderer';
import {effects} from '../src/lib/effects';
import {closeRenderBrowser, createRenderBrowser, renderClaimedItem} from '../src/lib/render-video';
import {dataRoot, ensureStorage} from '../src/lib/storage';
import {listMusicTracks} from '../src/lib/music';
import type {ClaimedRenderItem} from '../src/lib/jobs';

ensureStorage();
const samplePath = path.join(dataRoot, 'smoke-source.png');
const outputPath = path.join(dataRoot, 'smoke-output.mp4');
const smokeEffect = effects.find((effect) => effect.id === 'creative_origami_fold') ?? effects[0];
const music = listMusicTracks()[0];
if (!music) throw new Error('音乐库中没有可用于真实渲染测试的音乐');
await sharp({create: {width: 1280, height: 720, channels: 3, background: '#2563eb'}}).png().toFile(samplePath);

const input = {
  id: 'smoke', job_id: 'smoke-job', image_id: 'smoke-image', effect_id: smokeEffect.id, effect_name: smokeEffect.name,
  effect_snapshot_json: JSON.stringify(smokeEffect), seed: 42, params_json: '{}', status: 'rendering', progress: 0,
  music_name: music.name, music_path: music.filePath,
  position: 0,
  output_path: null, error_message: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  toolType: 'single_intro',
  image: {id: 'smoke-image', owner_id: 'smoke', original_name: 'smoke.png', stored_name: 'smoke.png', file_path: samplePath, mime_type: 'image/png', width: 1280, height: 720, size_bytes: 1, created_at: new Date().toISOString()},
  images: [{id: 'smoke-image', owner_id: 'smoke', original_name: 'smoke.png', stored_name: 'smoke.png', file_path: samplePath, mime_type: 'image/png', width: 1280, height: 720, size_bytes: 1, created_at: new Date().toISOString()}],
  request: {toolType: 'single_intro', imageIds: ['smoke-image'], ratio: 'source', durationSec: 5, countPerImage: 1, effectMode: 'all_random', selectedCategories: [], selectedEffectIds: [], allowDuplicate: false, introDurationSec: .8, intensity: 'medium', enableBreathing: true, resolution: '720p'},
  effect: smokeEffect, params: {scaleMultiplier: 1, translateMultiplier: 1, rotateMultiplier: 1, blurMultiplier: 1},
} as ClaimedRenderItem;

await fs.rm(outputPath, {force: true});
const browser = await createRenderBrowser();
try {
  await renderClaimedItem(input, outputPath, {
    browser, concurrency: 4, preset: 'veryfast',
    onProgress: (progress) => process.stdout.write(`\r真实渲染进度 ${Math.round(progress * 100)}%`),
  });
} finally {
  await closeRenderBrowser(browser);
}
const metadata = await getVideoMetadata(outputPath);
console.log('\n渲染完成', metadata);
if (metadata.width !== 1280 || metadata.height !== 720 || metadata.codec !== 'h264' || metadata.audioCodec !== 'aac' || Math.abs((metadata.durationInSeconds ?? 0) - 5) > .1) {
  throw new Error('输出视频规格不符合验收要求');
}
