import React from 'react';
import {AbsoluteFill, Img, interpolate, useCurrentFrame} from 'remotion';
import {DURATION_IN_FRAMES} from '@/lib/video-config';
import {atomValue} from './animation';
import type {ImageIntroVideoProps} from './types';

export const ImageIntroVideo: React.FC<ImageIntroVideoProps> = (props) => {
  const frame = useCurrentFrame();
  const {effect, introFrames, intensity, randomParams} = props;
  const value = (type: Parameters<typeof atomValue>[1], fallback: number) =>
    atomValue(effect.atoms, type, frame, effect.durationFrames, introFrames, fallback, intensity, randomParams);
  const scale = value('scale', 1);
  const translateX = value('translateX', 0);
  const translateY = value('translateY', 0);
  const rotate = value('rotate', 0);
  const opacity = value('opacity', 1);
  const blur = value('blur', 0);
  const mask = value('maskReveal', 0);
  const flash = value('flash', 0);
  const shake = value('shake', 0);
  const rgbShift = value('rgbShift', 0);
  const perspective = value('perspective', 0);
  const glow = value('glow', 0);
  const motionBlur = value('motionBlur', 0);
  const shakeX = shake * Math.sin(frame * 2.45);
  const shakeY = shake * .55 * Math.cos(frame * 2.1);
  const holdProgress = interpolate(frame, [introFrames, DURATION_IN_FRAMES - 1], [0, Math.PI * 2], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const breathing = props.enableBreathing && frame >= introFrames ? 1 + Math.sin(holdProgress) * .012 : 1;
  const transform = `perspective(1200px) translate3d(${translateX + shakeX}px, ${translateY + shakeY}px, 0) rotate(${rotate}deg) rotateY(${perspective}deg) scale(${scale * breathing})`;
  const imageStyle: React.CSSProperties = {
    width: '100%', height: '100%', objectFit: 'contain', transform, opacity,
    filter: `blur(${blur}px) drop-shadow(0 0 ${glow}px rgba(96,165,250,.85))`,
    clipPath: `inset(0 ${Math.max(0, mask)}% 0 ${Math.max(0, mask)}%)`,
    backfaceVisibility: 'hidden', willChange: 'transform, filter, opacity, clip-path',
  };

  return (
    <AbsoluteFill style={{backgroundColor: '#081426', overflow: 'hidden'}}>
      <Img src={props.imageSrc} style={{width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(44px) brightness(.58) saturate(1.1)', transform: 'scale(1.16)'}} />
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
      <AbsoluteFill><Img src={props.imageSrc} style={imageStyle} /></AbsoluteFill>
      {effect.id === 'combo_light_sweep_zoom' && frame <= introFrames && (
        <AbsoluteFill style={{background: 'linear-gradient(105deg, transparent 35%, rgba(255,255,255,.7) 50%, transparent 65%)', transform: `translateX(${interpolate(frame, [0, introFrames], [-props.width, props.width], {extrapolateRight: 'clamp'})}px)`, mixBlendMode: 'screen'}} />
      )}
      <AbsoluteFill style={{backgroundColor: 'white', opacity: Math.max(0, Math.min(1, flash)), pointerEvents: 'none'}} />
    </AbsoluteFill>
  );
};

