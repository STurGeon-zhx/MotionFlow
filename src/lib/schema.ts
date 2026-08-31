import {z} from 'zod';
import {MAX_WORKSPACE_IMAGES} from './limits';

export const ratioSchema = z.enum(['source', '9:16', '1:1', '16:9']);
export const resolutionSchema = z.enum(['720p', '1080p']);
export const intensitySchema = z.enum(['weak', 'medium', 'strong']);
export const effectModeSchema = z.enum([
  'all_random',
  'basic_only',
  'combo_only',
  'category_random',
  'specific',
]);

export const atomTypeSchema = z.enum([
  'scale',
  'translateX',
  'translateY',
  'translateZ',
  'rotate',
  'rotateX',
  'skewX',
  'skewY',
  'opacity',
  'blur',
  'maskReveal',
  'clipCircle',
  'wipeX',
  'wipeY',
  'flash',
  'shake',
  'rgbShift',
  'perspective',
  'glow',
  'motionBlur',
  'originX',
  'originY',
  'visualProgress',
]);

export const creativeVisualSchema = z.enum([
  'diamond',
  'clockWipe',
  'venetian',
  'mosaic',
  'curtain3d',
  'filmBurn',
  'scanline',
  'prism',
  'letterbox',
  'zoomEcho',
  'flipGrid',
  'shards',
  'waveBands',
  'photoStack',
  'dataScramble',
  'inkDrops',
  'aperture',
  'pagePeel',
  'paperTear',
  'kaleidoscope',
  'barcode',
  'colorWash',
  'crtPower',
  'paintSwipe',
  'rippleRings',
  'radialFan',
  'checkerReveal',
  'diagonalStrips',
  'spiralMosaic',
  'pixelDissolve',
  'dominoFall',
  'accordionFold',
  'origamiFold',
  'crossSplit',
  'zipperOpen',
  'liquidWave',
  'paintDrips',
  'elasticBands',
  'tunnelFrames',
  'filmStrip',
  'shutterSnap',
  'snakeBlocks',
  'glassPanels',
  'ribbonTwist',
  'paperCutLayers',
  'lightLeak',
  'lensFlare',
  'sunburst',
  'auroraVeil',
  'bokehBurst',
  'laserGrid',
  'lightningFlash',
  'sparkleTrail',
  'neonFrame',
  'rainbowSweep',
  'negativeFlash',
  'thermalReveal',
  'cometStreak',
  'edgeGlow',
  'lightColumns',
  'matrixRain',
  'waveformReveal',
  'frostMelt',
  'chromaBlocks',
  'rollingCylinder',
]);

export const atomSchema = z.object({
  type: atomTypeSchema,
  from: z.number(),
  to: z.number(),
  startFrame: z.number().int().nonnegative(),
  endFrame: z.number().int().positive(),
  easing: z.enum(['linear', 'easeOut', 'easeOutCubic', 'easeOutBack', 'easeInOut']),
});

export const effectPresetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['basic', 'combo']),
  category: z.enum(['basic', 'combo', 'dynamic', 'glitch', 'camera', '3d', 'light']),
  description: z.string(),
  durationFrames: z.number().int().positive(),
  atoms: z.array(atomSchema).min(1),
  visual: creativeVisualSchema.optional(),
  enabled: z.boolean(),
});

export const createJobSchema = z.object({
  imageIds: z.array(z.string().min(1)).min(1).max(MAX_WORKSPACE_IMAGES),
  ratio: ratioSchema,
  durationSec: z.literal(5).default(5),
  countPerImage: z.literal(1),
  effectMode: effectModeSchema,
  selectedCategories: z.array(z.string()).default([]),
  selectedEffectIds: z.array(z.string()).default([]),
  allowDuplicate: z.literal(false),
  introDurationSec: z.union([z.literal(0.5), z.literal(0.8), z.literal(1), z.literal(1.2)]),
  intensity: intensitySchema,
  enableBreathing: z.boolean(),
  resolution: resolutionSchema,
}).superRefine((value, ctx) => {
  if (value.imageIds.length * value.countPerImage > 100) {
    ctx.addIssue({code: 'custom', path: ['countPerImage'], message: '单个任务最多生成 100 条视频'});
  }
  if (value.effectMode === 'category_random' && value.selectedCategories.length === 0) {
    ctx.addIssue({code: 'custom', path: ['selectedCategories'], message: '请至少选择一个特效分类'});
  }
  if (value.effectMode === 'specific' && value.selectedEffectIds.length === 0) {
    ctx.addIssue({code: 'custom', path: ['selectedEffectIds'], message: '请至少选择一个具体特效'});
  }
});

export type Atom = z.infer<typeof atomSchema>;
export type EffectPreset = z.infer<typeof effectPresetSchema>;
export type CreativeVisual = z.infer<typeof creativeVisualSchema>;
export type CreateJobInput = z.infer<typeof createJobSchema>;
export type Ratio = z.infer<typeof ratioSchema>;
export type Resolution = z.infer<typeof resolutionSchema>;
export type Intensity = z.infer<typeof intensitySchema>;

export type ImageRecord = {
  id: string;
  originalName: string;
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
  previewUrl: string;
  createdAt: string;
};

export type JobStatus = 'pending' | 'running' | 'completed' | 'partial_failed' | 'failed';
export type ItemStatus = 'waiting' | 'rendering' | 'completed' | 'failed';
