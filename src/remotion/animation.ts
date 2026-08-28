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
  if (type === 'translateX' || type === 'translateY' || type === 'shake' || type === 'motionBlur' || type === 'rgbShift') value *= intensityFactor * params.translateMultiplier;
  if (type === 'rotate' || type === 'perspective') value *= intensityFactor * params.rotateMultiplier;
  if (type === 'blur') value *= intensityFactor * params.blurMultiplier;
  return value;
}

