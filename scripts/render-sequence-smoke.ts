import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {getVideoMetadata} from '@remotion/renderer';
import {closeRenderBrowser, createRenderBrowser, renderClaimedItem} from '../src/lib/render-video';
import {dataRoot, ensureStorage} from '../src/lib/storage';
import {listMusicTracks} from '../src/lib/music';
import type {ClaimedThreeImageMotionItem, ImageRow} from '../src/lib/jobs';

ensureStorage();
const sources = [
  {width: 640, height: 360, background: '#ef4444'},
  {width: 360, height: 640, background: '#22c55e'},
  {width: 500, height: 500, background: '#3b82f6'},
];
const imageRows: ImageRow[] = [];
for (let index = 0; index < sources.length; index++) {
  const filePath = path.join(dataRoot, `sequence-smoke-${index + 1}.png`);
  await sharp({create: {...sources[index], channels: 3 as const}}).png().toFile(filePath);
  imageRows.push({
    id: `sequence-smoke-${index + 1}`, owner_id: 'smoke', original_name: `sequence-${index + 1}.png`,
    stored_name: `sequence-${index + 1}.png`, file_path: filePath, mime_type: 'image/png',
    width: sources[index].width, height: sources[index].height, size_bytes: 1, created_at: new Date().toISOString(),
  });
}

const music = listMusicTracks()[0];
if (!music) throw new Error('音乐库中没有可用于真实渲染测试的音乐');
const outputPath = path.join(dataRoot, 'sequence-smoke-output.mp4');
const item: ClaimedThreeImageMotionItem = {
  id: 'sequence-smoke', job_id: 'sequence-smoke-job', image_id: imageRows[0].id,
  effect_id: 'three_image_motion', effect_name: '三图缓慢移动', effect_snapshot_json: '{}',
  seed: 42, params_json: '{}', status: 'rendering', progress: 0, position: 0,
  music_name: music.name, music_path: music.filePath, output_path: null, error_message: null,
  created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  toolType: 'three_image_motion', image: imageRows[0], images: imageRows as [ImageRow, ImageRow, ImageRow],
  request: {
    toolType: 'three_image_motion', imageIds: imageRows.map((image) => image.id), ratio: 'source',
    durationSec: 15, secondsPerImage: 5, transition: 'cut', motionPath: 'smooth_loop', edgeMode: 'auto_zoom',
    motionSpeed: .8, motionAmplitude: .025, enableMusic: true, resolution: '720p',
  },
  effect: null,
  params: {motionSpeed: .8, motionAmplitude: .025, enableMusic: true},
};

await fs.rm(outputPath, {force: true});
const browser = await createRenderBrowser();
try {
  await renderClaimedItem(item, outputPath, {
    browser, concurrency: 4, preset: 'veryfast',
    onProgress: (progress) => process.stdout.write(`\r三图真实渲染进度 ${Math.round(progress * 100)}%`),
  });
  const metadata = await getVideoMetadata(outputPath);
  console.log('\n三图渲染完成', metadata);
  if (metadata.width !== 1280 || metadata.height !== 720 || metadata.codec !== 'h264' || metadata.audioCodec !== 'aac' || Math.abs((metadata.durationInSeconds ?? 0) - 15) > .1) {
    throw new Error('三图输出视频规格不符合验收要求');
  }

  const silentOutputPath = path.join(dataRoot, 'sequence-smoke-silent-output.mp4');
  await fs.rm(silentOutputPath, {force: true});
  await renderClaimedItem({...item, music_name: null, music_path: null, request: {...item.request, enableMusic: false}}, silentOutputPath, {
    browser, concurrency: 4, preset: 'veryfast',
  });
  const silentMetadata = await getVideoMetadata(silentOutputPath);
  if (silentMetadata.audioCodec || silentMetadata.codec !== 'h264' || Math.abs((silentMetadata.durationInSeconds ?? 0) - 15) > .1) {
    throw new Error('关闭配乐后的三图视频规格不符合验收要求');
  }
  console.log('静音三图渲染完成', silentMetadata);
} finally {
  await closeRenderBrowser(browser);
}
