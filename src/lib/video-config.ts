import type {Ratio, Resolution} from './schema';

export function getDimensions(ratio: Ratio, resolution: Resolution) {
  const long = resolution === '1080p' ? 1920 : 1280;
  const short = resolution === '1080p' ? 1080 : 720;
  if (ratio === '9:16') return {width: short, height: long};
  if (ratio === '16:9') return {width: long, height: short};
  return {width: short, height: short};
}

const toEven = (value: number) => Math.max(2, Math.round(value / 2) * 2);

export function getSourceDimensions(sourceWidth: number, sourceHeight: number, resolution: Resolution) {
  if (sourceWidth <= 0 || sourceHeight <= 0) throw new Error('原图尺寸无效');
  const longEdge = resolution === '1080p' ? 1920 : 1280;
  const squareEdge = resolution === '1080p' ? 1080 : 720;
  if (sourceWidth === sourceHeight) return {width: squareEdge, height: squareEdge};
  if (sourceWidth > sourceHeight) {
    return {width: longEdge, height: toEven(longEdge * sourceHeight / sourceWidth)};
  }
  return {width: toEven(longEdge * sourceWidth / sourceHeight), height: longEdge};
}

export const FPS = 30;
export const DURATION_IN_FRAMES = 150;
export const REFERENCE_LIGHT_LOOP_IN_FRAMES = FPS * 2;
export const THREE_IMAGE_DURATION_IN_FRAMES = 450;
export const FRAMES_PER_SEQUENCE_IMAGE = 150;
