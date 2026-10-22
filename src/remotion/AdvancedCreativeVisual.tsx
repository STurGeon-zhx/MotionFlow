import React from 'react';
import {AbsoluteFill, Img} from 'remotion';
import type {CreativeVisual} from '@/lib/schema';

type Props = {
  visual: CreativeVisual;
  progress: number;
  imageSrc: string;
  imageStyle: React.CSSProperties;
  isExiting: boolean;
};

export const advancedCreativeVisuals = new Set<CreativeVisual>([
  'radialFan', 'checkerReveal', 'diagonalStrips', 'spiralMosaic', 'pixelDissolve',
  'dominoFall', 'accordionFold', 'origamiFold', 'crossSplit', 'zipperOpen',
  'liquidWave', 'paintDrips', 'elasticBands', 'tunnelFrames', 'filmStrip',
  'shutterSnap', 'snakeBlocks', 'glassPanels', 'ribbonTwist', 'paperCutLayers',
  'lightLeak', 'lensFlare', 'sunburst', 'auroraVeil', 'bokehBurst',
  'laserGrid', 'lightningFlash', 'sparkleTrail', 'neonFrame', 'rainbowSweep',
  'negativeFlash', 'thermalReveal', 'cometStreak', 'edgeGlow', 'lightColumns',
  'radialClarity', 'fireworkCrown', 'cornerFountains', 'glitterRain', 'starGlints',
  'haloShockwave', 'luminousRibbon', 'flashCluster', 'goldenDust', 'celebrationPyro',
  'prismaticFireworks', 'polaroidSparkPop', 'chromaticStarWash',
  'radialRushFocus', 'splitFocusRush', 'tunnelSnapClarity',
  'matrixRain', 'waveformReveal', 'frostMelt', 'chromaBlocks', 'rollingCylinder',
]);

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const range = (count: number) => Array.from({length: count}, (_, index) => index);
const seeded = (index: number, salt = 0) => ((index * 47 + salt * 31 + 17) % 101) / 100;
const lightSeed = (index: number, salt = 0) => {
  const value = Math.sin((index + 1) * 12.9898 + (salt + 1) * 78.233) * 43758.5453;
  return value - Math.floor(value);
};
const pulse = (progress: number, center: number, width: number) => clamp(1 - Math.abs(progress - center) / width);

export const AdvancedCreativeVisual: React.FC<Props> = ({visual, progress, imageSrc, imageStyle, isExiting}) => {
  const p = clamp(progress);
  const revealOpacity = (value: number) => isExiting ? 1 : value;
  const image = (key = 'image', style: React.CSSProperties = {}) => (
    <AbsoluteFill key={key} style={style}><Img src={imageSrc} style={imageStyle} /></AbsoluteFill>
  );
  const piece = (key: string, clipPath: string, style: React.CSSProperties = {}) => image(key, {clipPath, ...style});
  const tile = (key: string, column: number, row: number, columns: number, rows: number, style: React.CSSProperties = {}) => {
    const left = column * 100 / columns;
    const right = 100 - (column + 1) * 100 / columns;
    const top = row * 100 / rows;
    const bottom = 100 - (row + 1) * 100 / rows;
    return piece(key, `inset(${top}% ${right}% ${bottom}% ${left}%)`, style);
  };
  const lightParticleBurst = (salt: number, count = 84, originX = 50, originY = 50, spread = 1) => (
    <AbsoluteFill style={{mixBlendMode: 'screen', overflow: 'hidden'}}>
      <AbsoluteFill style={{
        opacity: pulse(p, .12, .16) * .72,
        background: `radial-gradient(circle at ${originX}% ${originY}%, rgba(255,255,255,.98) 0 2%, rgba(254,240,138,.68) 7%, rgba(147,197,253,.3) 16%, transparent 38%)`,
      }} />
      <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" style={{position: 'absolute', inset: 0, width: '100%', height: '100%', filter: 'drop-shadow(0 0 9px rgba(255,255,255,.95))'}}>
        {range(count).map((index) => {
          const delay = lightSeed(index, salt) * .18;
          const local = clamp((p - delay) / .82);
          const angle = lightSeed(index, salt + 3) * Math.PI * 2;
          const distance = local * (90 + lightSeed(index, salt + 7) * 520) * spread;
          const x = originX * 10 + Math.cos(angle) * distance;
          const y = originY * 10 + Math.sin(angle) * distance;
          const trail = 18 + lightSeed(index, salt + 13) * 42;
          const size = 2.4 + lightSeed(index, salt + 17) * 7.5;
          const opacity = pulse(local, .46, .54) * (.68 + lightSeed(index, salt + 19) * .32);
          const color = index % 4 === 0 ? '#ffffff' : index % 4 === 1 ? '#fef08a' : index % 4 === 2 ? '#bae6fd' : '#f9a8d4';
          return <g key={`${salt}-${index}`} opacity={opacity}>
            <line x1={x - Math.cos(angle) * trail} y1={y - Math.sin(angle) * trail} x2={x} y2={y} stroke={color} strokeWidth={Math.max(1.5, size * .5)} strokeLinecap="round" />
            <circle cx={x} cy={y} r={size} fill={color} />
          </g>;
        })}
      </svg>
    </AbsoluteFill>
  );

  if (visual === 'radialFan') {
    return <AbsoluteFill>{range(12).map((index) => {
      const start = index / 12 * Math.PI * 2 - Math.PI / 2;
      const end = (index + 1) / 12 * Math.PI * 2 - Math.PI / 2;
      const local = clamp((p - index * .018) / .78);
      const point = (angle: number) => `${50 + Math.cos(angle) * 78}% ${50 + Math.sin(angle) * 78}%`;
      return piece(`fan-${index}`, `polygon(50% 50%, ${point(start)}, ${point(end)})`, {transform: `rotate(${(1 - local) * (index % 2 ? -28 : 28)}deg) scale(${.45 + local * .55})`, opacity: revealOpacity(local), transformOrigin: '50% 50%'});
    })}</AbsoluteFill>;
  }

  if (visual === 'checkerReveal' || visual === 'spiralMosaic' || visual === 'pixelDissolve' || visual === 'snakeBlocks') {
    const columns = visual === 'pixelDissolve' ? 8 : visual === 'spiralMosaic' ? 5 : 6;
    const rows = visual === 'pixelDissolve' ? 5 : 4;
    const centerX = (columns - 1) / 2;
    const centerY = (rows - 1) / 2;
    return <AbsoluteFill>{range(columns * rows).map((index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const checkerOrder = (column + row) % 2 ? .12 : 0;
      const angle = Math.atan2(row - centerY, column - centerX) + Math.PI;
      const spiralOrder = angle / (Math.PI * 2) * .22 + Math.hypot(column - centerX, row - centerY) * .018;
      const snakeIndex = row % 2 ? row * columns + (columns - 1 - column) : row * columns + column;
      const delay = visual === 'checkerReveal' ? checkerOrder : visual === 'spiralMosaic' ? spiralOrder : visual === 'pixelDissolve' ? seeded(index, 4) * .28 : snakeIndex / (columns * rows) * .3;
      const local = clamp((p - delay) / .68);
      const transform = visual === 'spiralMosaic'
        ? `translate(${(column - centerX) * (1 - local) * 24}%, ${(row - centerY) * (1 - local) * 24}%) rotate(${(1 - local) * 90}deg) scale(${.2 + local * .8})`
        : visual === 'pixelDissolve'
          ? `scale(${local}) translateY(${(1 - local) * (seeded(index, 9) - .5) * 80}%)`
          : visual === 'snakeBlocks'
            ? `translateX(${(1 - local) * (row % 2 ? 45 : -45)}%) scale(${.7 + local * .3})`
            : `rotateY(${(1 - local) * ((column + row) % 2 ? 85 : -85)}deg) scale(${.7 + local * .3})`;
      return tile(`${visual}-${index}`, column, row, columns, rows, {transform, opacity: revealOpacity(local), transformOrigin: `${(column + .5) * 100 / columns}% ${(row + .5) * 100 / rows}%`});
    })}</AbsoluteFill>;
  }

  if (visual === 'diagonalStrips') {
    return <AbsoluteFill style={{transform: 'skewX(-12deg) scale(1.25)'}}>{range(12).map((index) => {
      const left = index * 100 / 12;
      const right = 100 - (index + 1) * 100 / 12;
      const local = clamp((p - index * .025) / .7);
      return piece(`diagonal-${index}`, `inset(0 ${right}% 0 ${left}%)`, {transform: `translateY(${(index % 2 ? 1 : -1) * (1 - local) * 105}%)`, opacity: revealOpacity(local)});
    })}</AbsoluteFill>;
  }

  if (visual === 'dominoFall' || visual === 'accordionFold' || visual === 'glassPanels' || visual === 'rollingCylinder') {
    const columns = visual === 'glassPanels' ? 6 : 9;
    return <AbsoluteFill style={{perspective: 1200}}>{range(columns).map((index) => {
      const left = index * 100 / columns;
      const right = 100 - (index + 1) * 100 / columns;
      const local = clamp((p - index * .028) / .72);
      let transform = `rotateX(${(1 - local) * -88}deg)`;
      if (visual === 'accordionFold') transform = `rotateY(${(index % 2 ? -1 : 1) * (1 - local) * 76}deg) scaleX(${.45 + local * .55})`;
      if (visual === 'glassPanels') transform = `translate3d(${(index - columns / 2) * (1 - local) * 34}px, ${(index % 2 ? -1 : 1) * (1 - local) * 85}px, ${(1 - local) * 180}px) rotateY(${(index % 2 ? -1 : 1) * (1 - local) * 38}deg)`;
      if (visual === 'rollingCylinder') transform = `translateZ(${(1 - local) * -260}px) rotateY(${(index - columns / 2) * (1 - local) * 18}deg) scaleY(${.72 + local * .28})`;
      return piece(`${visual}-${index}`, `inset(0 ${right}% 0 ${left}%)`, {transform, opacity: revealOpacity(local), filter: visual === 'glassPanels' ? `brightness(${.65 + local * .35}) blur(${(1 - local) * 5}px)` : undefined, transformOrigin: `${left + 50 / columns}% ${visual === 'dominoFall' ? '0%' : '50%'}`});
    })}</AbsoluteFill>;
  }

  if (visual === 'origamiFold') {
    const triangles = [
      'polygon(0 0,50% 0,25% 50%)', 'polygon(50% 0,100% 0,75% 50%)',
      'polygon(0 0,25% 50%,0 100%)', 'polygon(100% 0,100% 100%,75% 50%)',
      'polygon(0 100%,50% 100%,25% 50%)', 'polygon(50% 100%,100% 100%,75% 50%)',
      'polygon(25% 50%,50% 0,75% 50%,50% 50%)', 'polygon(25% 50%,50% 100%,75% 50%,50% 50%)',
    ];
    return <AbsoluteFill style={{perspective: 1100}}>{triangles.map((clip, index) => piece(`origami-${index}`, clip, {transform: `rotate${index % 2 ? 'Y' : 'X'}(${(index % 3 - 1) * (1 - p) * 95}deg) translateZ(${(1 - p) * 120}px)`, opacity: revealOpacity(p), transformOrigin: '50% 50%'}))}</AbsoluteFill>;
  }

  if (visual === 'crossSplit') {
    const clips = ['inset(0 50% 50% 0)', 'inset(0 0 50% 50%)', 'inset(50% 50% 0 0)', 'inset(50% 0 0 50%)'];
    const moves = [[-70, -70], [70, -70], [-70, 70], [70, 70]];
    return <AbsoluteFill>{clips.map((clip, index) => piece(`cross-${index}`, clip, {transform: `translate(${moves[index][0] * (1 - p)}%, ${moves[index][1] * (1 - p)}%) rotate(${(index % 2 ? -1 : 1) * (1 - p) * 12}deg)`, opacity: revealOpacity(p)}))}</AbsoluteFill>;
  }

  if (visual === 'zipperOpen') {
    const edge = 50 * p;
    return <AbsoluteFill>
      {piece('zip-left', `polygon(0 0, ${edge}% 0, ${edge - 4}% 10%, ${edge + 2}% 20%, ${edge - 4}% 30%, ${edge + 2}% 40%, ${edge - 4}% 50%, ${edge + 2}% 60%, ${edge - 4}% 70%, ${edge + 2}% 80%, ${edge - 4}% 90%, ${edge}% 100%, 0 100%)`)}
      {piece('zip-right', `polygon(100% 0, ${100 - edge}% 0, ${104 - edge}% 10%, ${98 - edge}% 20%, ${104 - edge}% 30%, ${98 - edge}% 40%, ${104 - edge}% 50%, ${98 - edge}% 60%, ${104 - edge}% 70%, ${98 - edge}% 80%, ${104 - edge}% 90%, ${100 - edge}% 100%, 100% 100%)`)}
    </AbsoluteFill>;
  }

  if (visual === 'liquidWave') {
    const edge = p * 112;
    return image('liquid', {clipPath: `polygon(0 0, ${edge}% 0, ${edge - 7}% 12%, ${edge + 2}% 25%, ${edge - 9}% 40%, ${edge + 3}% 57%, ${edge - 5}% 73%, ${edge + 1}% 88%, ${edge - 8}% 100%, 0 100%)`, filter: `${imageStyle.filter ?? ''} saturate(${.75 + p * .25})`});
  }

  if (visual === 'paintDrips') {
    return <AbsoluteFill>{range(12).map((index) => {
      const left = index * 100 / 12;
      const right = 100 - (index + 1) * 100 / 12;
      const local = clamp((p - seeded(index, 2) * .22) / .72);
      return piece(`drip-${index}`, `inset(0 ${right}% ${100 - local * 100}% ${left}%)`, {transform: `translateY(${(1 - local) * -4}%)`});
    })}</AbsoluteFill>;
  }

  if (visual === 'elasticBands' || visual === 'ribbonTwist') {
    const horizontal = visual === 'ribbonTwist';
    return <AbsoluteFill style={{perspective: 1000}}>{range(9).map((index) => {
      const start = index * 100 / 9;
      const end = 100 - (index + 1) * 100 / 9;
      const local = clamp((p - index * .018) / .78);
      const clip = horizontal ? `inset(${start}% 0 ${end}% 0)` : `inset(0 ${end}% 0 ${start}%)`;
      const transform = horizontal ? `rotateY(${(index % 2 ? -1 : 1) * (1 - local) * 110}deg) translateX(${(1 - local) * (index % 2 ? 28 : -28)}%)` : `scaleY(${.05 + local * .95}) skewY(${(index % 2 ? -1 : 1) * (1 - local) * 12}deg)`;
      return piece(`${visual}-${index}`, clip, {transform, opacity: revealOpacity(local), transformOrigin: '50% 50%'});
    })}</AbsoluteFill>;
  }

  if (visual === 'tunnelFrames') {
    return <AbsoluteFill>
      {image('tunnel-base', {clipPath: `inset(${(1 - p) * 48}% round 18px)`})}
      {range(5).map((index) => <AbsoluteFill key={index} style={{inset: `${8 + index * 7}%`, border: `${2 + index}px solid rgba(147,197,253,${(1 - p) * .7})`, transform: `scale(${.55 + p * .45 + index * (1 - p) * .08})`, boxShadow: '0 0 22px rgba(96,165,250,.55)'}} />)}
    </AbsoluteFill>;
  }

  if (visual === 'filmStrip') {
    return <AbsoluteFill style={{overflow: 'hidden'}}>
      {[-1, 0, 1].map((position) => image(`film-${position}`, {transform: `translateX(${position * (1 - p) * 92}%) scale(.88) rotate(${position * (1 - p) * 5}deg)`, border: '10px solid #111827', boxShadow: '0 16px 38px rgba(0,0,0,.42)', opacity: revealOpacity(p)}))}
      <AbsoluteFill style={{opacity: (1 - p) * .65, background: 'repeating-linear-gradient(90deg, transparent 0 5%, #0f172a 5% 6%, transparent 6% 11%)', mixBlendMode: 'multiply'}} />
    </AbsoluteFill>;
  }

  if (visual === 'shutterSnap') {
    const offset = p * 72;
    return <AbsoluteFill>{image('shutter-image')}
      <AbsoluteFill style={{clipPath: 'polygon(0 0,50% 0,50% 50%,0 50%)', background: '#020617', transform: `translate(${-offset}%, ${-offset}%)`}} />
      <AbsoluteFill style={{clipPath: 'polygon(50% 0,100% 0,100% 50%,50% 50%)', background: '#020617', transform: `translate(${offset}%, ${-offset}%)`}} />
      <AbsoluteFill style={{clipPath: 'polygon(0 50%,50% 50%,50% 100%,0 100%)', background: '#020617', transform: `translate(${-offset}%, ${offset}%)`}} />
      <AbsoluteFill style={{clipPath: 'polygon(50% 50%,100% 50%,100% 100%,50% 100%)', background: '#020617', transform: `translate(${offset}%, ${offset}%)`}} />
    </AbsoluteFill>;
  }

  if (visual === 'paperCutLayers') {
    return <AbsoluteFill>{range(5).map((index) => {
      const local = clamp((p - index * .055) / .74);
      const inset = (4 - index) * 8 * (1 - local);
      return image(`paper-layer-${index}`, {clipPath: `inset(${inset}% round ${18 + index * 5}px)`, transform: `translate(${(index - 2) * (1 - local) * 3}%, ${(2 - index) * (1 - local) * 3}%) scale(${.82 + local * .18})`, filter: `brightness(${.62 + index * .08 + local * .06})`, boxShadow: '0 10px 28px rgba(0,0,0,.3)'});
    })}</AbsoluteFill>;
  }

  if (visual === 'lightLeak') {
    return <AbsoluteFill>{image('leak-image')}<AbsoluteFill style={{opacity: (1 - p) * .92, transform: `translateX(${p * 160 - 80}%) scale(1.5)`, filter: 'blur(24px)', mixBlendMode: 'screen', background: 'linear-gradient(100deg, transparent 18%, #ff4d6d 36%, #ffb703 49%, #fff7ae 54%, transparent 72%)'}} /></AbsoluteFill>;
  }

  if (visual === 'lensFlare') {
    const x = -15 + p * 130;
    return <AbsoluteFill>{image('flare-image')}<AbsoluteFill style={{mixBlendMode: 'screen'}}>
      <div style={{position: 'absolute', left: `${x}%`, top: '42%', width: 110, height: 110, borderRadius: '50%', transform: 'translate(-50%,-50%)', background: 'radial-gradient(circle,#fff 0 5%,#93c5fd 12%,rgba(59,130,246,.32) 35%,transparent 70%)', filter: 'blur(2px)'}} />
      <div style={{position: 'absolute', left: `${x - 20}%`, top: '49%', width: '55%', height: 5, background: 'linear-gradient(90deg,transparent,#dbeafe,transparent)', filter: 'blur(3px)'}} />
    </AbsoluteFill></AbsoluteFill>;
  }

  if (visual === 'sunburst') {
    return <AbsoluteFill>{image('sun-image', {filter: `${imageStyle.filter ?? ''} brightness(${1 + (1 - p) * .45})`})}<AbsoluteFill style={{opacity: (1 - p) * .78, mixBlendMode: 'screen', transform: `rotate(${p * 35}deg) scale(${1.25 - p * .25})`, background: 'repeating-conic-gradient(from 0deg at 50% 50%,rgba(255,245,180,.9) 0 6deg,transparent 6deg 18deg)'}} /></AbsoluteFill>;
  }

  if (visual === 'auroraVeil') {
    return <AbsoluteFill>{image('aurora-image')}<AbsoluteFill style={{opacity: (1 - p) * .8, mixBlendMode: 'screen', filter: 'blur(28px) saturate(1.5)', transform: `translateY(${(p - .5) * 35}%) skewX(-12deg)`, background: 'linear-gradient(105deg,transparent 5%,#22d3ee 25%,#8b5cf6 48%,#ec4899 68%,transparent 92%)'}} /></AbsoluteFill>;
  }

  if (visual === 'bokehBurst') {
    return <AbsoluteFill>{image('bokeh-image')}<AbsoluteFill style={{mixBlendMode: 'screen'}}>{range(18).map((index) => {
      const size = 18 + seeded(index, 5) * 70;
      return <div key={index} style={{position: 'absolute', left: `${seeded(index, 2) * 100}%`, top: `${seeded(index, 8) * 100}%`, width: size, height: size, borderRadius: '50%', opacity: (1 - p) * (.2 + seeded(index, 3) * .55), transform: `translate(-50%,-50%) scale(${.3 + p * 1.8})`, background: index % 3 === 0 ? '#fef3c7' : index % 3 === 1 ? '#bfdbfe' : '#fbcfe8', filter: 'blur(5px)'}} />;
    })}</AbsoluteFill></AbsoluteFill>;
  }

  if (visual === 'laserGrid') {
    return <AbsoluteFill>{image('grid-image')}<AbsoluteFill style={{opacity: (1 - p) * .85, mixBlendMode: 'screen', backgroundImage: 'linear-gradient(rgba(34,211,238,.8) 2px,transparent 2px),linear-gradient(90deg,rgba(236,72,153,.8) 2px,transparent 2px)', backgroundSize: `${28 + p * 70}px ${28 + p * 70}px`, transform: `perspective(700px) rotateX(${55 * (1 - p)}deg) scale(${1.5 - p * .5})`, boxShadow: 'inset 0 0 45px #22d3ee'}} /></AbsoluteFill>;
  }

  if (visual === 'lightningFlash') {
    return <AbsoluteFill>{image('lightning-image')}<svg viewBox="0 0 1000 1000" preserveAspectRatio="none" style={{position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: (1 - p) * .95, filter: 'drop-shadow(0 0 16px #93c5fd)'}}><path d="M120 0 L390 350 L300 390 L560 680 L470 720 L820 1000" fill="none" stroke="white" strokeWidth="18"/><path d="M820 0 L650 250 L735 310 L510 520" fill="none" stroke="#a5f3fc" strokeWidth="10"/></svg><AbsoluteFill style={{background: 'white', opacity: Math.max(0, (1 - p) * .42 - .08)}} /></AbsoluteFill>;
  }

  if (visual === 'sparkleTrail') {
    return <AbsoluteFill>{image('spark-image')}<AbsoluteFill style={{mixBlendMode: 'screen'}}>{range(20).map((index) => {
      const local = clamp(p * 1.35 - index * .025);
      return <div key={index} style={{position: 'absolute', left: `${-8 + local * 116}%`, top: `${18 + seeded(index, 6) * 64}%`, color: index % 2 ? '#fff7ae' : '#dbeafe', fontSize: 12 + seeded(index, 2) * 28, opacity: clamp(1 - Math.abs(local - .68) * 1.4), transform: `rotate(${index * 31}deg) scale(${.4 + (1 - p) * .8})`, textShadow: '0 0 12px currentColor'}}>✦</div>;
    })}</AbsoluteFill></AbsoluteFill>;
  }

  if (visual === 'neonFrame') {
    const length = p * 100;
    const line: React.CSSProperties = {position: 'absolute', background: '#67e8f9', boxShadow: '0 0 12px #22d3ee,0 0 25px #a855f7'};
    return <AbsoluteFill>{image('neon-image')}<div style={{...line, left: '6%', top: '7%', width: `${length * .88}%`, height: 4}}/><div style={{...line, right: '6%', bottom: '7%', width: `${length * .88}%`, height: 4}}/><div style={{...line, right: '6%', top: '7%', width: 4, height: `${length * .86}%`}}/><div style={{...line, left: '6%', bottom: '7%', width: 4, height: `${length * .86}%`}}/></AbsoluteFill>;
  }

  if (visual === 'rainbowSweep') {
    return <AbsoluteFill>{image('rainbow-image')}<AbsoluteFill style={{opacity: .88 - p * .48, mixBlendMode: 'screen', filter: 'blur(7px)', transform: `translateX(${p * 190 - 95}%) skewX(-18deg) scaleX(.55)`, background: 'linear-gradient(90deg,transparent,#ef4444,#f59e0b,#eab308,#22c55e,#06b6d4,#3b82f6,#a855f7,transparent)'}} /></AbsoluteFill>;
  }

  if (visual === 'negativeFlash') {
    return <AbsoluteFill>{image('negative-image', {filter: `${imageStyle.filter ?? ''} invert(${1 - p}) hue-rotate(${(1 - p) * 180}deg) contrast(${1 + (1 - p) * .8})`})}<AbsoluteFill style={{opacity: (1 - p) * .35, background: 'white', mixBlendMode: 'difference'}} /></AbsoluteFill>;
  }

  if (visual === 'thermalReveal') {
    return <AbsoluteFill>{image('thermal-image', {filter: `${imageStyle.filter ?? ''} hue-rotate(${(1 - p) * 220}deg) saturate(${1 + (1 - p) * 3}) contrast(${1 + (1 - p) * .6})`})}<AbsoluteFill style={{opacity: (1 - p) * .38, mixBlendMode: 'color', background: 'linear-gradient(135deg,#1d4ed8,#06b6d4,#facc15,#dc2626)'}} /></AbsoluteFill>;
  }

  if (visual === 'cometStreak') {
    return <AbsoluteFill>{image('comet-image')}<AbsoluteFill style={{mixBlendMode: 'screen', transform: `translate(${p * 150 - 75}%, ${p * 90 - 45}%) rotate(-24deg)`}}>{range(9).map((index) => <div key={index} style={{position: 'absolute', left: `${index * 9}%`, top: `${12 + seeded(index, 4) * 76}%`, width: `${20 + seeded(index, 2) * 35}%`, height: 4 + index % 3, opacity: (1 - p) * .8, background: 'linear-gradient(90deg,transparent,#bae6fd,#fff)', filter: 'blur(2px)'}} />)}</AbsoluteFill></AbsoluteFill>;
  }

  if (visual === 'edgeGlow') {
    return <AbsoluteFill>{image('edge-image', {filter: `${imageStyle.filter ?? ''} contrast(${1 + (1 - p) * .35})`})}<AbsoluteFill style={{opacity: (1 - p) * .95, boxShadow: `inset 0 0 ${30 + (1 - p) * 90}px ${8 + (1 - p) * 18}px #60a5fa, inset 0 0 ${70 + (1 - p) * 80}px #c084fc`, mixBlendMode: 'screen'}} /></AbsoluteFill>;
  }

  if (visual === 'lightColumns') {
    return <AbsoluteFill>{image('columns-image')}<AbsoluteFill style={{mixBlendMode: 'screen'}}>{range(11).map((index) => {
      const width = 100 / 11;
      const local = clamp((p - seeded(index, 7) * .25) / .72);
      return <div key={index} style={{position: 'absolute', left: `${index * width}%`, top: `${-100 + local * 100}%`, width: `${width * .72}%`, height: '100%', opacity: (1 - local) * .8, background: 'linear-gradient(180deg,transparent,#fff7ae 40%,#93c5fd 75%,transparent)', filter: 'blur(7px)'}} />;
    })}</AbsoluteFill></AbsoluteFill>;
  }

  if (visual === 'radialClarity') {
    const strength = Math.pow(1 - p, 1.45);
    return <AbsoluteFill>
      {image('clarity-base')}
      {range(7).map((index) => image(`clarity-echo-${index}`, {
        opacity: strength * (.23 - index * .022),
        transform: `scale(${1 + strength * (.07 + index * .05)})`,
        filter: `blur(${strength * (3 + index * 2.5)}px) brightness(${1 + strength * .6})`,
        mixBlendMode: 'screen',
      }))}
      <AbsoluteFill style={{opacity: strength * .95, mixBlendMode: 'screen', background: 'repeating-conic-gradient(from 0deg at 50% 50%, rgba(255,255,255,.98) 0 1.8deg, transparent 1.8deg 5deg)', filter: `blur(${1 + strength * 4}px)`, transform: `scale(${.32 + p * 1.28})`}} />
      {lightParticleBurst(3, 118, 50, 50, 1.32)}
      <AbsoluteFill style={{opacity: strength * .78, background: 'radial-gradient(circle at 50% 50%, white 0 5%, rgba(219,234,254,.82) 13%, transparent 52%)', mixBlendMode: 'screen'}} />
    </AbsoluteFill>;
  }

  if (visual === 'fireworkCrown') {
    const centers = [{x: 8, y: 22}, {x: 28, y: 10}, {x: 50, y: 18}, {x: 72, y: 8}, {x: 92, y: 23}];
    return <AbsoluteFill>{image('crown-image')}<svg viewBox="0 0 1000 1000" preserveAspectRatio="none" style={{position: 'absolute', inset: 0, width: '100%', height: '100%', mixBlendMode: 'screen'}}>
      {centers.map((center, burstIndex) => {
        const local = pulse(p, .12 + burstIndex * .17, .23);
        return <g key={burstIndex} style={{opacity: local, filter: `drop-shadow(0 0 ${8 + local * 18}px ${burstIndex === 1 ? '#fef08a' : '#bfdbfe'})`}}>
          {range(28).map((ray) => {
            const angle = ray / 28 * Math.PI * 2;
            const inner = 16 + local * 18;
            const outer = inner + local * (135 + (ray % 5) * 24);
            return <line key={ray} x1={center.x * 10 + Math.cos(angle) * inner} y1={center.y * 10 + Math.sin(angle) * inner} x2={center.x * 10 + Math.cos(angle) * outer} y2={center.y * 10 + Math.sin(angle) * outer} stroke={burstIndex % 3 === 0 ? '#93c5fd' : burstIndex % 3 === 1 ? '#fff7ae' : '#f9a8d4'} strokeWidth={6 - ray % 3} strokeLinecap="round" />;
          })}
          <circle cx={center.x * 10} cy={center.y * 10} r={12 + local * 22} fill="white" />
        </g>;
      })}
    </svg>{lightParticleBurst(11, 96, 50, 14, 1.38)}</AbsoluteFill>;
  }

  if (visual === 'cornerFountains') {
    const active = pulse(p, .48, .5);
    return <AbsoluteFill>{image('fountain-image')}<AbsoluteFill style={{mixBlendMode: 'screen', overflow: 'hidden'}}>
      {[-1, 1].flatMap((side, sideIndex) => range(58).map((index) => {
        const travel = clamp((p * 1.45 - index * .018) / .82);
        const spread = 12 + seeded(index, sideIndex + 2) * 48;
        const left = side < 0 ? 4 + travel * spread : 96 - travel * spread;
        const top = 103 - travel * (58 + seeded(index, 7) * 64) + travel * travel * 26;
        const size = 4 + seeded(index, 5) * 13;
        return <div key={`${side}-${index}`} style={{position: 'absolute', left: `${left}%`, top: `${top}%`, width: size, height: size, borderRadius: '50%', opacity: active * (1 - travel * .58), background: index % 4 === 0 ? '#fff' : index % 2 ? '#fbbf24' : '#fde68a', boxShadow: '0 0 18px 6px currentColor', transform: 'translate(-50%,-50%)'}} />;
      }))}
    </AbsoluteFill></AbsoluteFill>;
  }

  if (visual === 'glitterRain') {
    return <AbsoluteFill>{image('glitter-image')}<AbsoluteFill style={{mixBlendMode: 'screen', overflow: 'hidden'}}>{range(112).map((index) => {
      const travel = (p * (1.15 + seeded(index, 4) * .45) + seeded(index, 8)) % 1.25;
      const size = 6 + seeded(index, 5) * 18;
      const opacity = pulse(travel, .55, .68) * (1 - p * .18);
      return <div key={index} style={{position: 'absolute', left: `${seeded(index, 2) * 100}%`, top: `${travel * 112 - 10}%`, width: size, height: size, opacity, transform: `rotate(${index * 29 + p * 160}deg)`, background: index % 3 === 0 ? '#f9a8d4' : index % 3 === 1 ? '#fef08a' : '#bae6fd', clipPath: index % 2 ? 'polygon(50% 0,62% 38%,100% 50%,62% 62%,50% 100%,38% 62%,0 50%,38% 38%)' : 'circle(50%)', boxShadow: '0 0 9px currentColor'}} />;
    })}</AbsoluteFill></AbsoluteFill>;
  }

  if (visual === 'starGlints') {
    return <AbsoluteFill>{image('glints-image')}<AbsoluteFill style={{mixBlendMode: 'screen'}}>{range(46).map((index) => {
      const local = pulse(p, .08 + seeded(index, 8) * .78, .14);
      return <div key={index} style={{position: 'absolute', left: `${4 + seeded(index, 2) * 92}%`, top: `${4 + seeded(index, 6) * 92}%`, width: 24 + local * 104, height: 24 + local * 104, opacity: local, transform: `translate(-50%,-50%) rotate(${p * 120 + index * 19}deg)`, background: index % 2 ? '#fef9c3' : '#dbeafe', clipPath: 'polygon(50% 0,57% 42%,100% 50%,57% 58%,50% 100%,43% 58%,0 50%,43% 42%)', filter: 'blur(.3px)', boxShadow: '0 0 34px 12px currentColor'}} />;
    })}</AbsoluteFill></AbsoluteFill>;
  }

  if (visual === 'haloShockwave') {
    return <AbsoluteFill>{image('halo-image')}<AbsoluteFill style={{mixBlendMode: 'screen'}}>
      {range(7).map((index) => {
        const local = clamp((p - index * .065) / .62);
        const size = 4 + local * 178;
        return <div key={index} style={{position: 'absolute', left: '50%', top: '50%', width: `${size}%`, aspectRatio: '1', borderRadius: '50%', border: `${Math.max(2, 10 - local * 6)}px solid ${index % 2 ? '#fef3c7' : '#bfdbfe'}`, opacity: (1 - local) * .92, transform: 'translate(-50%,-50%)', boxShadow: '0 0 28px currentColor, inset 0 0 28px currentColor'}} />;
      })}
      {lightParticleBurst(31, 116, 50, 50, 1.34)}
      <AbsoluteFill style={{opacity: pulse(p, .2, .2) * .65, background: 'radial-gradient(circle, white 0 8%, rgba(147,197,253,.65) 20%, transparent 58%)'}} />
    </AbsoluteFill></AbsoluteFill>;
  }

  if (visual === 'luminousRibbon') {
    const offset = -115 + p * 230;
    return <AbsoluteFill>{image('ribbon-image')}<svg viewBox="0 0 1000 1000" preserveAspectRatio="none" style={{position: 'absolute', inset: 0, width: '100%', height: '100%', transform: `translateX(${offset}%)`, mixBlendMode: 'screen', filter: 'blur(.6px) drop-shadow(0 0 32px #93c5fd)'}}>
      <path d="M-180 790 C100 50 410 950 1180 180" fill="none" stroke="rgba(255,255,255,.95)" strokeWidth="30" strokeLinecap="round" />
      <path d="M-160 860 C210 180 570 820 1160 110" fill="none" stroke="rgba(125,211,252,.86)" strokeWidth="72" strokeLinecap="round" />
      <path d="M-150 710 C250 20 720 920 1150 260" fill="none" stroke="rgba(253,230,138,.76)" strokeWidth="112" strokeLinecap="round" />
      <path d="M-210 570 C180 930 590 30 1210 650" fill="none" stroke="rgba(249,168,212,.84)" strokeWidth="54" strokeLinecap="round" />
      <path d="M-190 420 C260 850 720 80 1190 520" fill="none" stroke="rgba(255,255,255,.9)" strokeWidth="22" strokeLinecap="round" />
      {range(34).map((index) => <circle key={index} cx={seeded(index, 7) * 1100 - 50} cy={seeded(index, 12) * 900 + 50} r={5 + seeded(index, 2) * 14} fill={index % 2 ? '#fff' : '#bae6fd'} opacity={pulse(p, seeded(index, 5), .28)} />)}
    </svg></AbsoluteFill>;
  }

  if (visual === 'flashCluster') {
    const flashes = [{x: 10, y: 18, t: .08}, {x: 38, y: 12, t: .16}, {x: 72, y: 18, t: .27}, {x: 91, y: 38, t: .36}, {x: 46, y: 58, t: .45}, {x: 76, y: 72, t: .57}, {x: 25, y: 80, t: .68}, {x: 54, y: 88, t: .78}, {x: 90, y: 86, t: .87}];
    return <AbsoluteFill>{image('flash-image')}<AbsoluteFill style={{mixBlendMode: 'screen'}}>{flashes.map((flash, index) => {
      const local = pulse(p, flash.t, .11);
      const size = 16 + local * (38 + index * 3);
      return <div key={index} style={{position: 'absolute', left: `${flash.x}%`, top: `${flash.y}%`, width: `${size}%`, aspectRatio: '1', borderRadius: '50%', opacity: local * .9, transform: 'translate(-50%,-50%)', background: 'radial-gradient(circle, white 0 5%, rgba(254,249,195,.9) 10%, rgba(147,197,253,.45) 32%, transparent 70%)', filter: `blur(${(1 - local) * 5}px)`}} />;
    })}<AbsoluteFill style={{background: 'white', opacity: Math.max(...flashes.map((flash) => pulse(p, flash.t, .075))) * .36}} /></AbsoluteFill></AbsoluteFill>;
  }

  if (visual === 'goldenDust') {
    return <AbsoluteFill>{image('dust-image')}<AbsoluteFill style={{mixBlendMode: 'screen', overflow: 'hidden'}}>{range(126).map((index) => {
      const travel = clamp((p - seeded(index, 3) * .24) / .76);
      const sway = Math.sin(index * 1.7 + p * 5) * (4 + seeded(index, 9) * 6);
      const size = 3 + seeded(index, 2) * 13;
      return <div key={index} style={{position: 'absolute', left: `${seeded(index, 6) * 100 + sway}%`, top: `${104 - travel * (48 + seeded(index, 5) * 64)}%`, width: size, height: size, borderRadius: '50%', opacity: pulse(travel, .52, .58) * .95, background: index % 5 === 0 ? '#fff' : '#fbbf24', boxShadow: '0 0 14px 4px rgba(251,191,36,.85)'}} />;
    })}</AbsoluteFill></AbsoluteFill>;
  }

  if (visual === 'celebrationPyro') {
    const bursts = [{x: 8, y: 28, t: .07, color: '#f9a8d4'}, {x: 28, y: 16, t: .17, color: '#fde68a'}, {x: 50, y: 22, t: .29, color: '#bfdbfe'}, {x: 78, y: 14, t: .39, color: '#c4b5fd'}, {x: 92, y: 34, t: .48, color: '#fef08a'}, {x: 72, y: 70, t: .59, color: '#f9a8d4'}, {x: 42, y: 78, t: .7, color: '#fde68a'}, {x: 16, y: 70, t: .81, color: '#bfdbfe'}];
    return <AbsoluteFill>{image('pyro-image')}<svg viewBox="0 0 1000 1000" preserveAspectRatio="none" style={{position: 'absolute', inset: 0, width: '100%', height: '100%', mixBlendMode: 'screen'}}>{bursts.map((burst, burstIndex) => {
      const local = pulse(p, burst.t, .18);
      const radius = 32 + local * 164;
      return <g key={burstIndex} style={{opacity: local, filter: `drop-shadow(0 0 22px ${burst.color})`}}>{range(24).map((ray) => {
        const angle = ray / 24 * Math.PI * 2 + burstIndex * .35;
        const inner = radius * .42;
        const length = radius * (.78 + seeded(ray, burstIndex) * .42);
        return <line key={ray} x1={burst.x * 10 + Math.cos(angle) * inner} y1={burst.y * 10 + Math.sin(angle) * inner} x2={burst.x * 10 + Math.cos(angle) * length} y2={burst.y * 10 + Math.sin(angle) * length} stroke={burst.color} strokeWidth={5 + ray % 4} strokeLinecap="round" />;
      })}<circle cx={burst.x * 10} cy={burst.y * 10} r={8 + local * 10} fill="white" /></g>;
    })}</svg></AbsoluteFill>;
  }

  if (visual === 'prismaticFireworks') {
    const colorPulse = Math.max(pulse(p, .12, .12), pulse(p, .46, .12), pulse(p, .8, .12));
    const bursts = [
      {x: 9, y: 18, t: .08, color: '#f9a8d4'}, {x: 34, y: 10, t: .25, color: '#fef08a'},
      {x: 66, y: 13, t: .48, color: '#93c5fd'}, {x: 91, y: 21, t: .7, color: '#c4b5fd'},
    ];
    return <AbsoluteFill>
      {image('prismatic-fireworks-image', {filter: `${imageStyle.filter ?? ''} saturate(${1 + colorPulse * .42}) hue-rotate(${Math.sin(p * Math.PI * 6) * 22}deg) brightness(${1 + colorPulse * .16})`})}
      <AbsoluteFill style={{opacity: .18 + colorPulse * .34, mixBlendMode: 'screen', background: `linear-gradient(${110 + p * 80}deg, rgba(34,211,238,.72), transparent 34%, rgba(244,114,182,.68) 62%, rgba(253,224,71,.58))`}} />
      <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" style={{position: 'absolute', inset: 0, width: '100%', height: '100%', mixBlendMode: 'screen'}}>
        {bursts.map((burst, burstIndex) => {
          const local = pulse(p, burst.t, .19);
          return <g key={burstIndex} opacity={local} style={{filter: `drop-shadow(0 0 ${12 + local * 18}px ${burst.color})`}}>
            {range(32).map((ray) => {
              const angle = ray / 32 * Math.PI * 2 + burstIndex * .21;
              const inner = 12 + local * 20;
              const outer = inner + local * (100 + ray % 6 * 15);
              return <line key={ray} x1={burst.x * 10 + Math.cos(angle) * inner} y1={burst.y * 10 + Math.sin(angle) * inner} x2={burst.x * 10 + Math.cos(angle) * outer} y2={burst.y * 10 + Math.sin(angle) * outer} stroke={burst.color} strokeWidth={3 + ray % 4} strokeLinecap="round" />;
            })}
          </g>;
        })}
      </svg>
      {range(54).map((index) => {
        const local = pulse(p, .08 + lightSeed(index, 44) * .84, .1);
        return <div key={index} style={{position: 'absolute', left: `${lightSeed(index, 45) * 100}%`, top: `${lightSeed(index, 46) * 100}%`, width: 8 + local * 30, height: 8 + local * 30, opacity: local, transform: `translate(-50%,-50%) rotate(${45 + index * 17}deg)`, background: index % 3 ? '#fff' : '#fef08a', clipPath: 'polygon(50% 0,58% 42%,100% 50%,58% 58%,50% 100%,42% 58%,0 50%,42% 42%)', boxShadow: '0 0 18px 5px currentColor'}} />;
      })}
    </AbsoluteFill>;
  }

  if (visual === 'polaroidSparkPop') {
    const settle = clamp(p / .42);
    const shine = pulse(p, .32, .2);
    return <AbsoluteFill style={{background: 'radial-gradient(circle at 50% 48%, rgba(191,219,254,.32), transparent 68%)'}}>
      {image('polaroid-shadow', {transform: `translateY(${(1 - settle) * 6}%) rotate(${(1 - settle) * 2.8}deg) scale(${.91 + settle * .09})`, filter: `${imageStyle.filter ?? ''} brightness(${.9 + settle * .1})`, boxShadow: '0 24px 70px rgba(15,23,42,.45)'})}
      <AbsoluteFill style={{inset: '3.5%', border: `${6 + shine * 8}px solid rgba(255,255,255,${.72 + shine * .24})`, boxShadow: `0 0 ${24 + shine * 50}px rgba(147,197,253,.9), inset 0 0 ${18 + shine * 30}px rgba(255,255,255,.7)`, transform: `rotate(${(1 - settle) * 2.8}deg)`, opacity: .65 + settle * .35}} />
      {range(38).map((index) => {
        const edge = index % 4;
        const local = pulse(p, .1 + lightSeed(index, 51) * .75, .13);
        const horizontal = edge < 2;
        const left = horizontal ? 4 + lightSeed(index, 52) * 92 : edge === 2 ? 4 : 96;
        const top = horizontal ? edge === 0 ? 4 : 96 : 4 + lightSeed(index, 53) * 92;
        return <div key={index} style={{position: 'absolute', left: `${left}%`, top: `${top}%`, width: 5 + local * 24, height: 5 + local * 24, borderRadius: '50%', opacity: local, transform: 'translate(-50%,-50%)', background: index % 2 ? '#fff7ae' : '#dbeafe', boxShadow: '0 0 17px 7px currentColor'}} />;
      })}
      <AbsoluteFill style={{opacity: shine * .56, mixBlendMode: 'screen', background: 'linear-gradient(112deg, transparent 30%, white 49%, rgba(147,197,253,.62) 53%, transparent 68%)', transform: `translateX(${p * 180 - 90}%)`}} />
    </AbsoluteFill>;
  }

  if (visual === 'chromaticStarWash') {
    const sweepX = -65 + p * 230;
    return <AbsoluteFill>
      {image('chromatic-star-image', {filter: `${imageStyle.filter ?? ''} saturate(${1.08 + pulse(p, .52, .46) * .34}) contrast(${1.02 + pulse(p, .52, .35) * .12})`})}
      <AbsoluteFill style={{opacity: .62, mixBlendMode: 'screen', filter: 'blur(16px)', transform: `translateX(${sweepX}%) skewX(-18deg) scaleX(.48)`, background: 'linear-gradient(90deg, transparent, #22d3ee 18%, #ffffff 43%, #f472b6 66%, #fde68a 82%, transparent)'}} />
      {range(72).map((index) => {
        const start = lightSeed(index, 61) * .78;
        const local = pulse(p, start + .09, .11);
        const x = lightSeed(index, 62) * 112 - 6;
        const y = lightSeed(index, 63) * 112 - 6;
        const size = 9 + lightSeed(index, 64) * 20 + local * 38;
        return <div key={index} style={{position: 'absolute', left: `${x}%`, top: `${y}%`, width: size, height: size, opacity: local * .95, transform: `translate(-50%,-50%) rotate(${p * 150 + index * 23}deg)`, background: index % 3 === 0 ? '#fef08a' : index % 3 === 1 ? '#bae6fd' : '#fbcfe8', clipPath: 'polygon(50% 0,56% 43%,100% 50%,56% 57%,50% 100%,44% 57%,0 50%,44% 43%)', boxShadow: '0 0 24px 7px currentColor'}} />;
      })}
    </AbsoluteFill>;
  }

  if (visual === 'radialRushFocus') {
    const rush = Math.max(pulse(p, .2, .2), pulse(p, .68, .19));
    return <AbsoluteFill>
      {image('radial-rush-base', {transform: `scale(${1 + rush * .045})`, filter: `${imageStyle.filter ?? ''} blur(${rush * 1.8}px) brightness(${1 + rush * .18})`})}
      {range(7).map((index) => image(`radial-rush-echo-${index}`, {transform: `scale(${1 + rush * (.07 + index * .055)})`, opacity: rush * (.22 - index * .022), filter: `blur(${3 + index * 2}px) brightness(1.28)`, mixBlendMode: 'screen'}))}
      <AbsoluteFill style={{opacity: rush * .72, mixBlendMode: 'screen', transform: `scale(${.45 + rush * .9})`, background: 'repeating-conic-gradient(from 0deg at 50% 50%, rgba(255,255,255,.9) 0 1deg, transparent 1deg 4.5deg)', filter: `blur(${2 + rush * 5}px)`, maskImage: 'radial-gradient(circle, transparent 0 13%, #000 37%, transparent 86%)', WebkitMaskImage: 'radial-gradient(circle, transparent 0 13%, #000 37%, transparent 86%)'}} />
      <AbsoluteFill style={{opacity: rush * .52, background: 'radial-gradient(circle, white 0 4%, rgba(191,219,254,.74) 10%, transparent 44%)', mixBlendMode: 'screen'}} />
    </AbsoluteFill>;
  }

  if (visual === 'splitFocusRush') {
    const rush = Math.max(pulse(p, .24, .23), pulse(p, .73, .17));
    return <AbsoluteFill>
      {image('split-focus-base')}
      {piece('split-focus-left', 'inset(0 50% 0 0)', {transform: `translateX(${-rush * 7}%) scale(${1 + rush * .08})`, opacity: rush * .58, filter: `blur(${2 + rush * 8}px) brightness(1.3)`, mixBlendMode: 'screen'})}
      {piece('split-focus-right', 'inset(0 0 0 50%)', {transform: `translateX(${rush * 7}%) scale(${1 + rush * .13})`, opacity: rush * .52, filter: `blur(${3 + rush * 10}px) brightness(1.22)`, mixBlendMode: 'screen'})}
      <AbsoluteFill style={{opacity: rush * .66, mixBlendMode: 'screen', background: 'repeating-linear-gradient(0deg, transparent 0 19px, rgba(255,255,255,.72) 20px 23px, transparent 24px 42px)', transform: `scaleX(${1 + rush * .35})`, filter: 'blur(2px)', maskImage: 'linear-gradient(90deg, transparent, #000 18% 82%, transparent)', WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 18% 82%, transparent)'}} />
      <div style={{position: 'absolute', left: '50%', top: 0, width: 8 + rush * 20, height: '100%', opacity: rush * .75, transform: 'translateX(-50%)', background: 'linear-gradient(180deg, transparent, white 18% 82%, transparent)', filter: 'blur(7px)', mixBlendMode: 'screen'}} />
    </AbsoluteFill>;
  }

  if (visual === 'tunnelSnapClarity') {
    const snap = Math.max(pulse(p, .26, .25), pulse(p, .78, .17));
    return <AbsoluteFill>
      {image('tunnel-snap-base', {filter: `${imageStyle.filter ?? ''} brightness(${1 + snap * .12})`})}
      {range(6).map((index) => {
        const depth = (index + 1) / 6;
        return image(`tunnel-snap-${index}`, {inset: `${depth * 4}%`, transform: `scale(${1 - depth * .18 + snap * depth * .42})`, opacity: snap * (.3 - index * .032), border: `${2 + index}px solid rgba(219,234,254,${.72 - index * .07})`, boxShadow: '0 0 24px rgba(147,197,253,.82)', filter: `blur(${index * 1.3}px)`, mixBlendMode: 'screen'});
      })}
      <AbsoluteFill style={{opacity: snap * .72, transform: `scale(${.28 + snap * 1.05})`, background: 'radial-gradient(circle, white 0 3%, rgba(125,211,252,.8) 8%, rgba(196,181,253,.48) 19%, transparent 52%)', mixBlendMode: 'screen'}} />
      {range(28).map((index) => {
        const angle = index / 28 * Math.PI * 2;
        const length = 10 + snap * (24 + index % 5 * 8);
        const distance = 8 + snap * 44;
        return <div key={index} style={{position: 'absolute', left: `${50 + Math.cos(angle) * distance}%`, top: `${50 + Math.sin(angle) * distance}%`, width: length, height: 3 + index % 3, opacity: snap * .82, transform: `translate(-50%,-50%) rotate(${angle}rad)`, transformOrigin: '0 50%', borderRadius: 999, background: index % 2 ? '#fff' : '#bae6fd', boxShadow: '0 0 10px currentColor'}} />;
      })}
    </AbsoluteFill>;
  }

  if (visual === 'matrixRain') {
    return <AbsoluteFill>{image('matrix-image', {clipPath: `inset(0 0 ${(1 - p) * 100}% 0)`})}<AbsoluteFill style={{opacity: (1 - p) * .85, color: '#6ee7b7', background: 'rgba(0,20,18,.28)', display: 'flex', justifyContent: 'space-around', overflow: 'hidden', fontFamily: 'monospace', fontSize: 18, lineHeight: 1.2}}>{range(14).map((index) => <div key={index} style={{transform: `translateY(${(p * 170 + seeded(index, 3) * 55 - 100)}%)`, textShadow: '0 0 8px #34d399', writingMode: 'vertical-rl'}}>01MF7A9K23</div>)}</AbsoluteFill></AbsoluteFill>;
  }

  if (visual === 'waveformReveal') {
    return <AbsoluteFill>{image('waveform-image')}<AbsoluteFill style={{display: 'flex', alignItems: 'center', gap: '1.3%', padding: '0 4%', mixBlendMode: 'screen'}}>{range(28).map((index) => {
      const height = 12 + Math.abs(Math.sin(index * .7)) * 68;
      return <div key={index} style={{flex: 1, height: `${height * (1 - p)}%`, borderRadius: 8, opacity: (1 - p) * .9, background: index % 2 ? '#22d3ee' : '#a78bfa', boxShadow: '0 0 12px currentColor'}} />;
    })}</AbsoluteFill></AbsoluteFill>;
  }

  if (visual === 'frostMelt') {
    const clear = p * 140;
    return <AbsoluteFill>{image('frost-image')}<AbsoluteFill style={{opacity: 1 - p, backdropFilter: `blur(${(1 - p) * 24}px)`, background: 'rgba(224,242,254,.42)', maskImage: `radial-gradient(circle at 35% 45%, transparent 0 ${clear}%, #000 ${clear + 8}%)`, WebkitMaskImage: `radial-gradient(circle at 35% 45%, transparent 0 ${clear}%, #000 ${clear + 8}%)`, boxShadow: 'inset 0 0 60px rgba(255,255,255,.8)'}} /></AbsoluteFill>;
  }

  if (visual === 'chromaBlocks') {
    const columns = 4;
    const rows = 3;
    return <AbsoluteFill>{range(columns * rows).map((index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const local = clamp((p - seeded(index, 5) * .18) / .78);
      return tile(`chroma-${index}`, column, row, columns, rows, {transform: `translate(${(seeded(index, 2) - .5) * (1 - local) * 70}%, ${(seeded(index, 8) - .5) * (1 - local) * 70}%)`, filter: `${imageStyle.filter ?? ''} hue-rotate(${(1 - local) * index * 37}deg) saturate(${1 + (1 - local) * 2})`, opacity: revealOpacity(local), mixBlendMode: local < .7 ? 'screen' : 'normal'});
    })}</AbsoluteFill>;
  }

  return null;
};
