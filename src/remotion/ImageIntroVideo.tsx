import React from 'react';
import {AbsoluteFill, Audio, Img, interpolate, useCurrentFrame} from 'remotion';
import {DURATION_IN_FRAMES, REFERENCE_LIGHT_LOOP_IN_FRAMES} from '@/lib/video-config';
import {atomValue, resolveAnimationFrame, resolveBreathingScale, resolveLoopFrame, resolveVisibleEntryFrame} from './animation';
import {CreativeVisual} from './CreativeVisual';
import type {ImageIntroVideoProps} from './types';

export const ImageIntroVideo: React.FC<ImageIntroVideoProps> = (props) => {
  const frame = useCurrentFrame();
  const {effect, introFrames, intensity, randomParams} = props;
  const {animationFrame: timelineAnimationFrame, isExiting} = resolveAnimationFrame(
    frame,
    introFrames,
    DURATION_IN_FRAMES,
    effect.type === 'combo' && !['reference_light', 'reference_creative'].includes(effect.category),
  );
  const entryFrame = resolveVisibleEntryFrame(frame, introFrames, effect.id, effect.durationFrames);
  const animationFrame = isExiting ? timelineAnimationFrame : entryFrame;
  const value = (type: Parameters<typeof atomValue>[1], fallback: number) =>
    atomValue(effect.atoms, type, animationFrame, effect.durationFrames, introFrames, fallback, intensity, randomParams);
  const referenceLightLoopFrame = resolveLoopFrame(frame, REFERENCE_LIGHT_LOOP_IN_FRAMES);
  const referenceLightValue = (type: Parameters<typeof atomValue>[1], fallback: number) =>
    atomValue(effect.atoms, type, referenceLightLoopFrame, effect.durationFrames, REFERENCE_LIGHT_LOOP_IN_FRAMES - 1, fallback, intensity, randomParams);
  const lightValue = effect.category === 'reference_light' ? referenceLightValue : value;
  const scale = value('scale', 1);
  const translateX = value('translateX', 0);
  const translateY = value('translateY', 0);
  const translateZ = value('translateZ', 0);
  const rotate = value('rotate', 0);
  const rotateX = value('rotateX', 0);
  const skewX = value('skewX', 0);
  const skewY = value('skewY', 0);
  const opacity = isExiting ? 1 : value('opacity', 1);
  const blur = value('blur', 0);
  const mask = value('maskReveal', 0);
  const clipCircle = value('clipCircle', 100);
  const wipeX = value('wipeX', 0);
  const wipeY = value('wipeY', 0);
  const flash = lightValue('flash', 0);
  const shake = value('shake', 0);
  const rgbShift = value('rgbShift', 0);
  const perspective = value('perspective', 0);
  const glow = lightValue('glow', 0);
  const motionBlur = value('motionBlur', 0);
  const originX = value('originX', 50);
  const originY = value('originY', 50);
  const visualProgress = lightValue('visualProgress', 1);
  const shakeX = shake * Math.sin(frame * 2.45);
  const shakeY = shake * .55 * Math.cos(frame * 2.1);
  const breathing = resolveBreathingScale(frame, DURATION_IN_FRAMES, props.enableBreathing);
  const transform = `perspective(1200px) translate3d(${translateX + shakeX}px, ${translateY + shakeY}px, ${translateZ}px) rotate(${rotate}deg) rotateX(${rotateX}deg) rotateY(${perspective}deg) skew(${skewX}deg, ${skewY}deg) scale(${scale * breathing})`;
  const hasAtom = (type: Parameters<typeof atomValue>[1]) => effect.atoms.some((entry) => entry.type === type);
  const clipPath = hasAtom('clipCircle')
    ? `circle(${Math.max(0, clipCircle)}% at 50% 50%)`
    : hasAtom('wipeX')
      ? `inset(0 ${Math.max(0, wipeX)}% 0 0)`
      : hasAtom('wipeY')
        ? `inset(0 0 ${Math.max(0, wipeY)}% 0)`
        : `inset(0 ${Math.max(0, mask)}% 0 ${Math.max(0, mask)}%)`;
  const imageStyle: React.CSSProperties = {
    width: '100%', height: '100%', objectFit: 'contain', transform, opacity,
    filter: `blur(${blur}px) drop-shadow(0 0 ${glow}px rgba(96,165,250,.85))`,
    clipPath, transformOrigin: `${originX}% ${originY}%`,
    backfaceVisibility: 'hidden', willChange: 'transform, filter, opacity, clip-path',
  };

  return (
    <AbsoluteFill style={{backgroundColor: '#081426', overflow: 'hidden'}}>
      {props.backgroundMusicSrc && (
        <Audio src={props.backgroundMusicSrc} trimBefore={0} trimAfter={DURATION_IN_FRAMES} volume={0.35} />
      )}
      <Img src={props.imageSrc} style={{width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(44px) brightness(.58) saturate(1.1)', transform: 'scale(1.16)', opacity: 1}} />
      {motionBlur > .2 && [3, 2, 1].map((layer) => (
        <AbsoluteFill key={layer} style={{opacity: Math.min(.18, motionBlur / 80), transform: `translateX(${-motionBlur * layer}px)`}}>
          <Img src={props.imageSrc} style={imageStyle} />
        </AbsoluteFill>
      ))}
      {rgbShift > .2 && (
        <>
          <AbsoluteFill style={{mixBlendMode: 'screen', opacity: Math.min(.62, rgbShift / 24), transform: `translateX(${rgbShift}px)`, filter: 'sepia(1) saturate(8) hue-rotate(305deg)'}}><Img src={props.imageSrc} style={imageStyle} /></AbsoluteFill>
          <AbsoluteFill style={{mixBlendMode: 'screen', opacity: Math.min(.55, rgbShift / 26), transform: `translateX(${-rgbShift}px)`, filter: 'sepia(1) saturate(8) hue-rotate(145deg)'}}><Img src={props.imageSrc} style={imageStyle} /></AbsoluteFill>
        </>
      )}
      {effect.visual
        ? <CreativeVisual visual={effect.visual} progress={visualProgress} imageSrc={props.imageSrc} imageStyle={imageStyle} isExiting={isExiting} />
        : <AbsoluteFill><Img src={props.imageSrc} style={imageStyle} /></AbsoluteFill>}
      {effect.id === 'combo_light_sweep_zoom' && (frame <= introFrames || isExiting) && (
        <AbsoluteFill style={{background: 'linear-gradient(105deg, transparent 35%, rgba(255,255,255,.7) 50%, transparent 65%)', transform: `translateX(${interpolate(animationFrame, [0, introFrames], [-props.width, props.width], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}px)`, mixBlendMode: 'screen'}} />
      )}
      <AbsoluteFill style={{backgroundColor: 'white', opacity: Math.max(0, Math.min(1, flash)), pointerEvents: 'none'}} />
    </AbsoluteFill>
  );
};
