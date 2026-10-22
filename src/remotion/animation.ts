import {entryStartFrames} from './entry-offsets';
import {Easing, interpolate} from 'remotion';
import type {Atom, Intensity} from '@/lib/schema';
import type {RandomizedParams} from './types';

const easingMap = {
  linear: Easing.linear,
  easeOut: Easing.out(Easing.quad),
  easeOutCubic: Easing.out(Easing.cubic),
  easeOutBack: Easing.out(Easing.back(1.35)),
  easeInOut: Easing.inOut(Easing.cubic),
};

export function resolveAnimationFrame(
  frame: number,
  introFrames: number,
  totalFrames: number,
  linkedExit: boolean,
) {
  const exitStartFrame = totalFrames - introFrames;
  if (!linkedExit || frame < exitStartFrame) return {animationFrame: frame, isExiting: false};
  return {
    animationFrame: interpolate(frame, [exitStartFrame, totalFrames - 1], [introFrames, 0], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    }),
    isExiting: true,
  };
}

export function resolveBreathingScale(frame: number, totalFrames: number, enabled: boolean) {
  if (!enabled) return 1;
  const lastFrame = Math.max(1, totalFrames - 1);
  const clampedFrame = Math.max(0, Math.min(lastFrame, frame));
  const progress = clampedFrame / lastFrame * Math.PI * 2;
  return 1 + (1 - Math.cos(progress)) * .006;
}

export function resolveLoopFrame(frame: number, loopFrames: number) {
  const safeLoopFrames = Math.max(2, Math.round(loopFrames));
  return ((Math.floor(frame) % safeLoopFrames) + safeLoopFrames) % safeLoopFrames;
}

export function atomValue(
  atoms: Atom[], type: Atom['type'], frame: number, presetFrames: number, introFrames: number,
  fallback: number, intensity: Intensity, params: RandomizedParams,
) {
  const matching = atoms.filter((entry) => entry.type === type).sort((a, b) => a.startFrame - b.startFrame);
  if (matching.length === 0) return fallback;
  const scaledFrame = frame * (presetFrames / introFrames);
  const active = matching.find((entry) => scaledFrame >= entry.startFrame && scaledFrame <= entry.endFrame);
  const previous = [...matching].reverse().find((entry) => scaledFrame > entry.endFrame);
  if (!active) return previous ? previous.to : fallback;
  let value = interpolate(scaledFrame, [active.startFrame, active.endFrame], [active.from, active.to], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easingMap[active.easing],
  });
  const intensityFactor = intensity === 'weak' ? .72 : intensity === 'strong' ? 1.28 : 1;
  if (type === 'scale') value = 1 + (value - 1) * intensityFactor * params.scaleMultiplier;
  if (type === 'translateX' || type === 'translateY' || type === 'translateZ' || type === 'shake' || type === 'motionBlur' || type === 'rgbShift') value *= intensityFactor * params.translateMultiplier;
  if (type === 'rotate' || type === 'rotateX' || type === 'perspective' || type === 'skewX' || type === 'skewY') value *= intensityFactor * params.rotateMultiplier;
  if (type === 'blur') value *= intensityFactor * params.blurMultiplier;
  return value;
}

export function resolveVisibleEntryFrame(frame: number, introFrames: number, effectId: string, presetFrames: number) {
  const lead = (entryStartFrames[effectId] ?? 0) * introFrames / Math.max(1, presetFrames);
  return Math.min(introFrames, Math.max(0, frame) + lead);
}
