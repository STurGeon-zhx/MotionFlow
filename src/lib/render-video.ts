import fs from 'node:fs/promises';
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {renderMedia, selectComposition} from '@remotion/renderer';
import {getSourceDimensions} from './video-config';
import {dataRoot, ensureStorage} from './storage';
import type {ClaimedRenderItem} from './jobs';
import type {ImageIntroVideoProps} from '@/remotion/types';

let serveUrlPromise: Promise<string> | null = null;

async function getServeUrl() {
  ensureStorage();
  if (!serveUrlPromise) {
    serveUrlPromise = bundle({
      entryPoint: path.resolve('src/remotion/index.ts'),
      outDir: path.join(dataRoot, 'remotion-bundle'),
      webpackOverride: (configuration) => {
        const aliases = Array.isArray(configuration.resolve?.alias) ? {} : configuration.resolve?.alias;
        return {...configuration, resolve: {...configuration.resolve, alias: {...aliases, '@': path.resolve('src')}}};
      },
    });
  }
  return serveUrlPromise;
}

export async function renderClaimedItem(item: ClaimedRenderItem, outputPath: string, onProgress?: (progress: number) => void) {
  const image = await fs.readFile(item.image.file_path);
  const dimensions = getSourceDimensions(item.image.width, item.image.height, item.request.resolution);
  const inputProps: ImageIntroVideoProps = {
    imageSrc: `data:${item.image.mime_type};base64,${image.toString('base64')}`,
    effect: item.effect,
    ...dimensions,
    introFrames: Math.round(item.request.introDurationSec * 30),
    intensity: item.request.intensity,
    enableBreathing: item.request.enableBreathing,
    randomParams: item.params as ImageIntroVideoProps['randomParams'],
  };
  const serveUrl = await getServeUrl();
  const composition = await selectComposition({serveUrl, id: 'ImageIntroVideo', inputProps});
  await renderMedia({
    serveUrl,
    composition,
    inputProps,
    codec: 'h264',
    outputLocation: outputPath,
    pixelFormat: 'yuv420p',
    muted: true,
    concurrency: 2,
    timeoutInMilliseconds: 120_000,
    crf: item.request.resolution === '1080p' ? 18 : 20,
    onProgress: ({progress}) => onProgress?.(progress),
  });
}
