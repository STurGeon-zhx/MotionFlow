import fs from 'node:fs/promises';
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {openBrowser, renderMedia, selectComposition, type CancelSignal, type HeadlessBrowser, type X264Preset} from '@remotion/renderer';
import {getSourceDimensions} from './video-config';
import {dataRoot, ensureStorage} from './storage';
import type {ClaimedRenderItem} from './jobs';
import type {ImageIntroVideoProps, ThreeImageMotionVideoProps} from '@/remotion/types';
import {getMusicMimeType} from './music';

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

export async function createRenderBrowser() {
  return openBrowser('chrome', {logLevel: 'warn'});
}

export async function closeRenderBrowser(browser: HeadlessBrowser | null) {
  if (!browser) return;
  try {
    await browser.close({silent: true});
  } catch {
    // Browser crashes are handled by recreating the slot browser on retry.
  }
}

export type RenderClaimedItemOptions = {
  browser: HeadlessBrowser;
  concurrency: number;
  preset: X264Preset;
  timeoutInMilliseconds?: number;
  cancelSignal?: CancelSignal;
  onProgress?: (progress: number) => void;
};

export async function renderClaimedItem(item: ClaimedRenderItem, outputPath: string, options: RenderClaimedItemOptions) {
  const music = item.music_path ? await fs.readFile(item.music_path) : null;
  const dimensions = getSourceDimensions(item.image.width, item.image.height, item.request.resolution);
  const musicSrc = music ? `data:${getMusicMimeType(item.music_path!)};base64,${music.toString('base64')}` : null;
  const inputProps: ImageIntroVideoProps | ThreeImageMotionVideoProps = item.toolType === 'three_image_motion'
    ? {
        imageSrcs: await Promise.all(item.images.map(async (image) => {
          const contents = await fs.readFile(image.file_path);
          return `data:${image.mime_type};base64,${contents.toString('base64')}`;
        })) as [string, string, string],
        backgroundMusicSrc: musicSrc,
        ...dimensions,
        motionSpeed: item.request.motionSpeed,
        motionAmplitude: item.request.motionAmplitude,
        motionSeed: item.seed,
      }
    : {
        imageSrc: `data:${item.image.mime_type};base64,${(await fs.readFile(item.image.file_path)).toString('base64')}`,
        backgroundMusicSrc: musicSrc,
        effect: item.effect,
        ...dimensions,
        introFrames: Math.round(item.request.introDurationSec * 30),
        intensity: item.request.intensity,
        enableBreathing: item.request.enableBreathing,
        randomParams: item.params as ImageIntroVideoProps['randomParams'],
      };
  const serveUrl = await getServeUrl();
  const compositionId = item.toolType === 'three_image_motion' ? 'ThreeImageMotionVideo' : 'ImageIntroVideo';
  const composition = await selectComposition({serveUrl, id: compositionId, inputProps, puppeteerInstance: options.browser});
  const startedAt = performance.now();
  let resolvedConcurrency = options.concurrency;
  let renderedDoneIn: number | null = null;
  let encodedDoneIn: number | null = null;
  await renderMedia({
    serveUrl,
    composition,
    inputProps,
    puppeteerInstance: options.browser,
    codec: 'h264',
    outputLocation: outputPath,
    pixelFormat: 'yuv420p',
    muted: !music,
    audioCodec: music ? 'aac' : null,
    audioBitrate: music ? '192k' : null,
    concurrency: options.concurrency,
    x264Preset: options.preset,
    cancelSignal: options.cancelSignal,
    timeoutInMilliseconds: options.timeoutInMilliseconds ?? (item.toolType === 'three_image_motion' ? 1_200_000 : 600_000),
    crf: item.request.resolution === '1080p' ? 18 : 20,
    onStart: (data) => { resolvedConcurrency = data.resolvedConcurrency; },
    onProgress: (progress) => {
      renderedDoneIn = progress.renderedDoneIn ?? renderedDoneIn;
      encodedDoneIn = progress.encodedDoneIn ?? encodedDoneIn;
      options.onProgress?.(progress.progress);
    },
  });
  return {
    totalMs: Math.round(performance.now() - startedAt),
    renderedMs: renderedDoneIn,
    encodedMs: encodedDoneIn,
    resolvedConcurrency,
  };
}
