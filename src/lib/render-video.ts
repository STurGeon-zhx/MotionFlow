import fs from 'node:fs/promises';
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {openBrowser, renderMedia, selectComposition, type CancelSignal, type HeadlessBrowser, type X264Preset} from '@remotion/renderer';
import {getSourceDimensions} from './video-config';
import {dataRoot, ensureStorage} from './storage';
import type {ClaimedRenderItem} from './jobs';
import type {ImageIntroVideoProps, ThreeImageMotionVideoProps} from '@/remotion/types';
import {getMusicMimeType} from './music';
import {renderThreeImageFast} from './render-three-fast';
import {createAssetGrant, prepareRenderImage} from './render-assets';

let serveUrlPromise: Promise<string> | null = null;

async function getServeUrl() {
  ensureStorage();
  if (!serveUrlPromise) {
    const prebuilt = path.resolve(process.env.MOTION_REMOTION_BUNDLE ?? 'remotion-bundle');
    if (await fs.stat(path.join(prebuilt, 'index.html')).catch(() => null)) return prebuilt;
    serveUrlPromise = bundle({
      entryPoint: path.resolve('src/remotion/index.ts'),
      outDir: path.join(dataRoot, 'remotion-bundle'),
      webpackOverride: (configuration) => {
        const aliases = Array.isArray(configuration.resolve?.alias) ? {} : configuration.resolve?.alias;
        return {...configuration, resolve: {...configuration.resolve, alias: {...aliases, '@': path.resolve('src')}}};
      },
    }).catch(error => {serveUrlPromise = null; throw error;});
  }
  return serveUrlPromise;
}

export async function createRenderBrowser(softwareRendering = false) {
  return openBrowser('chrome', {logLevel: 'warn', chromiumOptions: {gl: !softwareRendering && process.env.MOTION_RENDER_GL !== 'software' ? 'angle' : undefined}});
}

export async function closeRenderBrowser(browser: HeadlessBrowser | null) {
  if (!browser) return;
  try {
    await browser.close({silent: true});
  } catch {
    // Browser crashes are handled by recreating the slot browser on retry.
  }
}

export type RenderMetrics = {totalMs: number; renderedMs: number | null; encodedMs: number | null; resolvedConcurrency: number; preparationMs?: number; initializationMs?: number; engine?: string};
export type RenderClaimedItemOptions = {
  softwareRendering?: boolean;
  onStage?: (stage: string) => void;
  browser: HeadlessBrowser;
  concurrency: number;
  preset: X264Preset;
  timeoutInMilliseconds?: number;
  cancelSignal?: CancelSignal;
  onProgress?: (progress: number) => void;
};

export async function renderClaimedItem(item: ClaimedRenderItem, outputPath: string, options: RenderClaimedItemOptions) {
  if (item.toolType === 'three_image_motion' && process.env.MOTION_SEQUENCE_ENGINE !== 'remotion') {
    try {return await renderThreeImageFast(item,outputPath,options);} catch (error) {
      if (options.cancelSignal) {let canceled=false;options.cancelSignal(()=>{canceled=true;});if(canceled)throw error;}
      console.warn('[render] 三图快速路径失败，回退 Remotion',String(error));
    }
  }
  const totalStart = performance.now();
  options.onStage?.('preparing');
  const music = item.music_path;
  const dimensions = getSourceDimensions(item.image.width, item.image.height, item.request.resolution);
  const grant = await createAssetGrant();
  try {
  const musicSrc = music ? grant.add(music, getMusicMimeType(music)) : null;
  const prepared = await Promise.all(item.images.map(image => prepareRenderImage(image.file_path,dimensions.width,dimensions.height,
    item.toolType === 'single_intro' ? Math.max(1.5,...item.effect.atoms.filter(atom => atom.type === 'scale').map(atom => Math.max(atom.from,atom.to)*1.5)) : 1.5, item.toolType === 'three_image_motion' ? 1.18 : 1.16)));
  const foregrounds = prepared.map(image => grant.add(image.foreground,'image/png'));
  const backgrounds = prepared.map(image => grant.add(image.background,'image/png'));
  const inputProps: ImageIntroVideoProps | ThreeImageMotionVideoProps = item.toolType === 'three_image_motion'
    ? {imageSrcs: foregrounds as [string,string,string], backgroundSrcs: backgrounds as [string,string,string], backgroundMusicSrc: musicSrc,
        ...dimensions, motionSpeed:item.request.motionSpeed,motionAmplitude:item.request.motionAmplitude,motionSeed:item.seed}
    : {imageSrc:foregrounds[0],backgroundSrc:backgrounds[0],backgroundMusicSrc:musicSrc,effect:item.effect,...dimensions,
        introFrames:Math.round(item.request.introDurationSec*30),intensity:item.request.intensity,enableBreathing:item.request.enableBreathing,
        randomParams:item.params as ImageIntroVideoProps['randomParams']};
  const preparationMs = Math.round(performance.now()-totalStart);
  options.onStage?.('initializing');
  const serveUrl = await getServeUrl();
  const compositionId = item.toolType === 'three_image_motion' ? 'ThreeImageMotionVideo' : 'ImageIntroVideo';
  const composition = await selectComposition({serveUrl, id: compositionId, inputProps, puppeteerInstance: options.browser});
  const initializationMs = Math.round(performance.now()-totalStart)-preparationMs;
  options.onStage?.('rendering');
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
    totalMs: Math.round(performance.now() - totalStart), preparationMs, initializationMs, engine: 'remotion',
    renderedMs: renderedDoneIn,
    encodedMs: encodedDoneIn,
    resolvedConcurrency,
  };
  } finally {grant.release();}
}
