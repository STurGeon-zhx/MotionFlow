import {isParticleVisual} from '@/lib/particle-effects';
import {ParticleLightVisual} from './ParticleLightVisual';
import {isReferenceCreativeVisual, ReferenceCreativeVisual} from './ReferenceCreativeVisual';
import React from 'react';
import {AbsoluteFill, Img} from 'remotion';
import type {CreativeVisual as CreativeVisualKind} from '@/lib/schema';
import {AdvancedCreativeVisual, advancedCreativeVisuals} from './AdvancedCreativeVisual';

type Props = {
  visual: CreativeVisualKind;
  progress: number;
  imageSrc: string;
  imageStyle: React.CSSProperties;
  isExiting: boolean;
};

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const range = (count: number) => Array.from({length: count}, (_, index) => index);

export const CreativeVisual: React.FC<Props> = ({visual, progress, imageSrc, imageStyle, isExiting}) => {
  const p = clamp(progress);
  const revealOpacity = (value: number) => isExiting ? 1 : value;
  const image = (key = 'image', style: React.CSSProperties = {}) => (
    <AbsoluteFill key={key} style={style}><Img src={imageSrc} style={imageStyle} /></AbsoluteFill>
  );
  const piece = (key: string, clipPath: string, style: React.CSSProperties = {}) => image(key, {clipPath, ...style});

  if (isParticleVisual(visual)) {
    return <ParticleLightVisual visual={visual} imageSrc={imageSrc} imageStyle={imageStyle}/>;
  }

  if (isReferenceCreativeVisual(visual)) {
    return <ReferenceCreativeVisual visual={visual} progress={p} imageSrc={imageSrc} imageStyle={imageStyle} />;
  }

  if (advancedCreativeVisuals.has(visual)) {
    return <AdvancedCreativeVisual visual={visual} progress={p} imageSrc={imageSrc} imageStyle={imageStyle} isExiting={isExiting} />;
  }

  if (visual === 'diamond') {
    const radius = p * 105;
    return image('diamond', {clipPath: `polygon(50% ${50 - radius}%, ${50 + radius}% 50%, 50% ${50 + radius}%, ${50 - radius}% 50%)`});
  }
  if (visual === 'clockWipe') {
    const mask = `conic-gradient(from -90deg, #000 0deg ${p * 360}deg, transparent ${p * 360}deg 360deg)`;
    return image('clock', {maskImage: mask, WebkitMaskImage: mask});
  }
  if (visual === 'venetian') {
    return <AbsoluteFill style={{perspective: 1200}}>{range(10).map((index) => {
      const left = index * 10;
      const direction = index % 2 ? -1 : 1;
      return piece(`slat-${index}`, `inset(0 ${90 - left}% 0 ${left}%)`, {
        transform: `rotateY(${direction * (1 - p) * 88}deg)`, transformOrigin: `${left + 5}% 50%`, opacity: revealOpacity(p),
      });
    })}</AbsoluteFill>;
  }
  if (visual === 'mosaic' || visual === 'flipGrid') {
    const columns = visual === 'mosaic' ? 4 : 3;
    const rows = 3;
    return <AbsoluteFill style={{perspective: 1200}}>{range(columns * rows).map((index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const left = column * 100 / columns;
      const right = 100 - (column + 1) * 100 / columns;
      const top = row * 100 / rows;
      const bottom = 100 - (row + 1) * 100 / rows;
      const local = clamp((p - index * .018) / .72);
      const transform = visual === 'mosaic'
        ? `translate(${(column - (columns - 1) / 2) * (1 - local) * 55}%, ${(row - 1) * (1 - local) * 55}%) scale(${.15 + local * .85}) rotate(${(index % 2 ? -1 : 1) * (1 - local) * 24}deg)`
        : `rotateX(${(1 - local) * 82}deg) rotateY(${(index % 2 ? -1 : 1) * (1 - local) * 72}deg)`;
      return piece(`tile-${index}`, `inset(${top}% ${right}% ${bottom}% ${left}%)`, {transform, opacity: revealOpacity(local)});
    })}</AbsoluteFill>;
  }
  if (visual === 'curtain3d') {
    return <AbsoluteFill style={{perspective: 1200}}>
      {piece('curtain-left', 'inset(0 50% 0 0)', {transform: `rotateY(${(1 - p) * 105}deg)`, transformOrigin: '0 50%'})}
      {piece('curtain-right', 'inset(0 0 0 50%)', {transform: `rotateY(${(1 - p) * -105}deg)`, transformOrigin: '100% 50%'})}
    </AbsoluteFill>;
  }
  if (visual === 'filmBurn') {
    return <AbsoluteFill>
      {image('burn-image')}
      <AbsoluteFill style={{opacity: (1 - p) * .94, mixBlendMode: 'screen', background: 'radial-gradient(circle at 72% 35%, #fff7b0 0 8%, #ff8a1f 22%, #e11d48 45%, transparent 72%)', filter: `blur(${(1 - p) * 18}px)`, transform: `scale(${1.35 - p * .35})`}} />
    </AbsoluteFill>;
  }
  if (visual === 'scanline') {
    return <AbsoluteFill>
      {image('scan-image', {clipPath: `inset(${(1 - p) * 48}% 0 ${(1 - p) * 48}% 0)`})}
      <AbsoluteFill style={{opacity: (1 - p) * .8, background: 'repeating-linear-gradient(0deg, rgba(70,255,220,.75) 0 2px, transparent 2px 8px)', mixBlendMode: 'screen', transform: `translateY(${(1 - p) * 24}px)`}} />
    </AbsoluteFill>;
  }
  if (visual === 'prism') {
    return <AbsoluteFill>
      {image('prism-base', {opacity: p})}
      {['#ff285d', '#32e6ff', '#ffe04b'].map((color, index) => image(`prism-${index}`, {
        clipPath: `inset(0 ${66 - index * 33}% 0 ${index * 33}%)`,
        transform: `translateX(${(index - 1) * (1 - p) * 90}px) skewX(${(index - 1) * (1 - p) * 14}deg)`,
        mixBlendMode: 'screen', opacity: 1 - p * .35, backgroundColor: color,
      }))}
    </AbsoluteFill>;
  }
  if (visual === 'letterbox') {
    const bar = (1 - p) * 50;
    return <AbsoluteFill>
      {image('letterbox-image')}
      <AbsoluteFill style={{bottom: 'auto', height: `${bar}%`, background: '#020617', boxShadow: '0 12px 28px rgba(0,0,0,.45)'}} />
      <AbsoluteFill style={{top: 'auto', height: `${bar}%`, background: '#020617', boxShadow: '0 -12px 28px rgba(0,0,0,.45)'}} />
    </AbsoluteFill>;
  }
  if (visual === 'zoomEcho') {
    return <AbsoluteFill>
      {range(4).map((index) => image(`echo-${index}`, {
        transform: `scale(${1 + (1 - p) * (index + 1) * .16})`,
        opacity: index === 0 ? 1 : (1 - p) * (.32 - index * .055), mixBlendMode: index ? 'screen' : 'normal',
      }))}
    </AbsoluteFill>;
  }
  if (visual === 'shards') {
    const shards = [
      'polygon(0 0, 46% 0, 24% 52%)', 'polygon(46% 0, 100% 0, 70% 45%)',
      'polygon(0 0, 24% 52%, 0 100%)', 'polygon(24% 52%, 70% 45%, 52% 100%)',
      'polygon(70% 45%, 100% 0, 100% 100%)', 'polygon(0 100%, 52% 100%, 24% 52%)',
      'polygon(52% 100%, 100% 100%, 70% 45%)',
    ];
    return <AbsoluteFill>{shards.map((clip, index) => {
      const angle = index / shards.length * Math.PI * 2;
      return piece(`shard-${index}`, clip, {transform: `translate(${Math.cos(angle) * (1 - p) * 55}%, ${Math.sin(angle) * (1 - p) * 55}%) rotate(${(index - 3) * (1 - p) * 14}deg)`, opacity: revealOpacity(p)});
    })}</AbsoluteFill>;
  }
  if (visual === 'waveBands') {
    return <AbsoluteFill>{range(9).map((index) => {
      const top = index * 100 / 9;
      const bottom = 100 - (index + 1) * 100 / 9;
      return piece(`wave-${index}`, `inset(${top}% 0 ${bottom}% 0)`, {transform: `translateX(${Math.sin(index * 1.8) * (1 - p) * 48}%)`, opacity: revealOpacity(p)});
    })}</AbsoluteFill>;
  }
  if (visual === 'photoStack') {
    return <AbsoluteFill>
      {[-1, 1].map((direction, index) => image(`photo-back-${index}`, {transform: `translate(${direction * (1 - p) * 13}%, ${(1 - p) * 9}%) rotate(${direction * (1 - p) * 11}deg) scale(.88)`, opacity: (1 - p) * .65, filter: 'brightness(.7)'}))}
      {image('photo-front', {transform: `scale(${.78 + p * .22}) rotate(${(1 - p) * -4}deg)`, boxShadow: '0 20px 55px rgba(0,0,0,.38)'})}
    </AbsoluteFill>;
  }
  if (visual === 'dataScramble') {
    return <AbsoluteFill>
      {range(10).map((index) => {
        const top = index * 10;
        const offset = ((index * 37) % 9 - 4) * (1 - p) * 9;
        return piece(`data-${index}`, `inset(${top}% 0 ${90 - top}% 0)`, {transform: `translateX(${offset}%)`, opacity: revealOpacity(.35 + p * .65), filter: `hue-rotate(${offset * 2}deg)`});
      })}
    </AbsoluteFill>;
  }
  if (visual === 'inkDrops') {
    const radius = p * 82;
    const mask = `radial-gradient(circle at 22% 30%, #000 0 ${radius}%, transparent ${radius + 2}%), radial-gradient(circle at 72% 38%, #000 0 ${radius * .82}%, transparent ${radius * .82 + 2}%), radial-gradient(circle at 48% 76%, #000 0 ${radius * .7}%, transparent ${radius * .7 + 2}%)`;
    return image('ink', {maskImage: mask, WebkitMaskImage: mask});
  }
  if (visual === 'aperture') {
    const radius = p * 112;
    return image('aperture', {clipPath: `polygon(50% ${50 - radius}%, ${93 + radius * .12}% ${25 - radius * .25}%, ${93 + radius * .12}% ${75 + radius * .25}%, 50% ${50 + radius}%, ${7 - radius * .12}% ${75 + radius * .25}%, ${7 - radius * .12}% ${25 - radius * .25}%)`, filter: `${imageStyle.filter ?? ''} brightness(${.55 + p * .45})`});
  }
  if (visual === 'pagePeel') {
    return <AbsoluteFill style={{perspective: 1000}}>{image('page', {transform: `rotateY(${(1 - p) * -112}deg) translateX(${(1 - p) * -18}%)`, transformOrigin: '0 50%', boxShadow: `${(1 - p) * 28}px 8px 44px rgba(0,0,0,.45)`})}</AbsoluteFill>;
  }
  if (visual === 'paperTear') {
    const edge = p * 118;
    return image('tear', {clipPath: `polygon(0 0, ${edge}% 0, ${edge - 7}% 13%, ${edge + 2}% 27%, ${edge - 8}% 43%, ${edge + 1}% 58%, ${edge - 6}% 74%, ${edge + 3}% 88%, ${edge}% 100%, 0 100%)`});
  }
  if (visual === 'kaleidoscope') {
    const clips = ['inset(0 50% 50% 0)', 'inset(0 0 50% 50%)', 'inset(50% 50% 0 0)', 'inset(50% 0 0 50%)'];
    return <AbsoluteFill>
      {image('kaleido-base', {opacity: p})}
      {clips.map((clip, index) => piece(`kaleido-${index}`, clip, {transform: `scale(${1.35 - p * .35}) rotate(${(index % 2 ? -1 : 1) * (1 - p) * 18}deg)`, filter: `hue-rotate(${index * (1 - p) * 70}deg)`, opacity: 1 - p * .45}))}
    </AbsoluteFill>;
  }
  if (visual === 'barcode') {
    return <AbsoluteFill>{range(16).map((index) => {
      const width = 100 / 16;
      const left = index * width;
      const local = clamp((p - (index % 4) * .045) / .82);
      return piece(`bar-${index}`, `inset(0 ${100 - left - width}% 0 ${left}%)`, {transform: `translateY(${(index % 2 ? 1 : -1) * (1 - local) * 100}%)`, opacity: revealOpacity(local)});
    })}</AbsoluteFill>;
  }
  if (visual === 'colorWash') {
    return <AbsoluteFill>
      {image('wash-image', {filter: `${imageStyle.filter ?? ''} saturate(${.1 + p * .9}) hue-rotate(${(1 - p) * 110}deg)`})}
      <AbsoluteFill style={{opacity: (1 - p) * .72, mixBlendMode: 'color', background: 'linear-gradient(125deg, #7c3aed, #06b6d4 48%, #f59e0b)'}} />
    </AbsoluteFill>;
  }
  if (visual === 'crtPower') {
    const vertical = (1 - p) * 49.5;
    const horizontal = (1 - p) * 46;
    return <AbsoluteFill>
      {image('crt', {clipPath: `inset(${vertical}% ${horizontal}% ${vertical}% ${horizontal}%)`, filter: `${imageStyle.filter ?? ''} brightness(${1 + (1 - p) * 2})`})}
      <AbsoluteFill style={{opacity: (1 - p) * .7, background: 'repeating-linear-gradient(0deg, transparent 0 4px, rgba(255,255,255,.18) 4px 5px)', mixBlendMode: 'screen'}} />
    </AbsoluteFill>;
  }
  if (visual === 'paintSwipe') {
    const stop = p * 125;
    const mask = `linear-gradient(105deg, #000 0 ${stop - 20}%, rgba(0,0,0,.85) ${stop - 10}%, transparent ${stop}%)`;
    return image('paint', {maskImage: mask, WebkitMaskImage: mask, filter: `${imageStyle.filter ?? ''} saturate(${.6 + p * .4})`});
  }
  if (visual === 'rippleRings') {
    return <AbsoluteFill>
      {range(5).map((index) => {
        const local = clamp((p - index * .055) / .78);
        return image(`ripple-${index}`, {clipPath: `circle(${local * (28 + index * 20)}% at 50% 50%)`, transform: `scale(${1 + (1 - local) * (5 - index) * .025})`, opacity: index === 4 ? 1 : .22 + local * .18});
      })}
    </AbsoluteFill>;
  }
  return image();
};
