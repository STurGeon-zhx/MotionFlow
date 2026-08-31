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
  'matrixRain', 'waveformReveal', 'frostMelt', 'chromaBlocks', 'rollingCylinder',
]);

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const range = (count: number) => Array.from({length: count}, (_, index) => index);
const seeded = (index: number, salt = 0) => ((index * 47 + salt * 31 + 17) % 101) / 100;

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
