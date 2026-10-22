import type {EffectPreset, Intensity} from '@/lib/schema';

export type RandomizedParams = {
  scaleMultiplier: number;
  translateMultiplier: number;
  rotateMultiplier: number;
  blurMultiplier: number;
};

export type ImageIntroVideoProps = {
  imageSrc: string;
  backgroundMusicSrc: string | null;
  effect: EffectPreset;
  width: number;
  height: number;
  introFrames: number;
  intensity: Intensity;
  enableBreathing: boolean;
  randomParams: RandomizedParams;
};

export type ThreeImageMotionVideoProps = {
  imageSrcs: [string, string, string];
  backgroundMusicSrc: string | null;
  width: number;
  height: number;
  motionSpeed: number;
  motionAmplitude: number;
  motionSeed: number;
};

export const defaultVideoProps: ImageIntroVideoProps = {
  imageSrc: '/preview-placeholder.png',
  backgroundMusicSrc: null,
  effect: {
    id: 'preview', name: '中心放大进入', type: 'basic', category: 'basic', description: '', durationFrames: 24,
    atoms: [{type: 'scale', from: .75, to: 1, startFrame: 0, endFrame: 24, easing: 'easeOutCubic'}], enabled: true,
  },
  width: 1080,
  height: 1920,
  introFrames: 36,
  intensity: 'medium',
  enableBreathing: true,
  randomParams: {scaleMultiplier: 1, translateMultiplier: 1, rotateMultiplier: 1, blurMultiplier: 1},
};

export const defaultThreeImageMotionProps: ThreeImageMotionVideoProps = {
  imageSrcs: ['/preview-placeholder.png', '/preview-placeholder.png', '/preview-placeholder.png'],
  backgroundMusicSrc: null,
  width: 1080,
  height: 1920,
  motionSpeed: 0.8,
  motionAmplitude: 0.025,
  motionSeed: 1,
};
