import React from 'react';
import {Img} from 'remotion';
import type {CreativeVisual} from '@/lib/schema';

export const referenceCreativeVisuals = [
  'brushComet', 'inkBloomPaper', 'charcoalRubbing', 'watercolorPools', 'paintRollerReveal',
  'paperWindowCut', 'polaroidSwing', 'galleryRail', 'matteDepth', 'albumBook',
  'hangingClips', 'magnifierFocus', 'envelopeLetter', 'parcelUnwrap', 'accordionLetter',
  'postcardTurn', 'ticketPerforation', 'instantPrint', 'scrapbookAssemble', 'paperAirplane',
] as const;
export type ReferenceCreativeVisualKind = typeof referenceCreativeVisuals[number];
export const isReferenceCreativeVisual = (visual: CreativeVisual): visual is ReferenceCreativeVisualKind =>
  (referenceCreativeVisuals as readonly string[]).includes(visual);

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const ease = (n: number) => {const t = clamp(n); return t * t * (3 - 2 * t);};
const stage = (p: number, start: number, end: number) => ease((p - start) / (end - start));
const range = (n: number) => Array.from({length: n}, (_, i) => i);

const SceneFill: React.FC<React.PropsWithChildren<{style?: React.CSSProperties}>> = ({style, children}) => <div style={{position: 'absolute', inset: 0, ...style}}>{children}</div>;

type Props = {visual: ReferenceCreativeVisualKind; progress: number; imageSrc: string; imageStyle: React.CSSProperties};

// New effects are entrance scenes: all decorations disappear at the settled frame.
// Every branch starts with a visible image fragment, never a blank staging frame.
export const ReferenceCreativeVisual: React.FC<Props> = ({visual, progress, imageSrc, imageStyle}) => {
  const p = clamp(progress);
  const q = ease(p);
  const settle = stage(p, .68, 1);
  const remain = 1 - settle;
  const photo = (style: React.CSSProperties = {}, key?: string) => <SceneFill key={key} style={style}><Img src={imageSrc} style={imageStyle} /></SceneFill>;
  const paper = (style: React.CSSProperties = {}, key?: string) => <SceneFill key={key} style={{background: '#fffaf1', ...style}} />;
  const dots = (color = '#fff', count = 22) => <SceneFill style={{opacity: remain, pointerEvents: 'none'}}>{range(count).map(i => <div key={i} style={{position: 'absolute', left: `${(i * 41 + 11) % 100}%`, top: `${((i * 29 + 13) % 100 + p * (i % 2 ? 9 : -9) + 100) % 100}%`, width: 2 + i % 4, height: 2 + i % 4, borderRadius: '50%', background: color, opacity: .25 + i % 3 * .2, boxShadow: `0 0 ${4 + i % 5}px ${color}`}} />)}</SceneFill>;
  const framed = (style: React.CSSProperties = {}, border = 2) => <SceneFill style={{border: `${border * remain}vmin solid white`, boxSizing: 'border-box', boxShadow: `0 ${12 * remain}px ${32 * remain}px #14233240`, ...style}}>{photo()}</SceneFill>;
  const backdrop = (color = '#eae4da') => <SceneFill style={{background: color}}>{photo({filter: 'blur(15px)', opacity: .24 + settle * .76, transform: 'scale(1.12)'})}</SceneFill>;
  if (p >= .999) return photo();

  if (visual === 'brushComet') {
    const reveal = .18 + .82 * stage(p, 0, .62);
    const brushMask = range(22).map(i => {
      const y = i * 100 / 22;
      const edge = reveal * 124 - ((i * 19) % 17);
      return `polygon(0 ${y}%, ${edge}% ${y}%, ${edge - 8}% ${y + 2}%, ${edge + 2}% ${y + 4.7}%, 0 ${y + 4.7}%)`;
    });
    return <SceneFill>{backdrop('#e8e7e3')}<SceneFill style={{background: 'radial-gradient(ellipse at 45% 55%, #836399, #1d4249 75%)', transform: `rotate(${-8 * remain}deg) scale(${.88 + .12 * q})`, opacity: .9 * remain, clipPath: `inset(${(1 - reveal) * 40}% 0)`}} />
      <SceneFill style={{transform: `translate(${(1 - q) * 9}%, ${(1 - q) * 5}%) rotate(${-9 * (1 - q)}deg) scale(${.78 + .22 * q})`}}>{brushMask.map((clipPath, i) => photo({clipPath}, `stroke-${i}`))}</SceneFill>{dots('#ffedce')}
    </SceneFill>;
  }
  if (visual === 'inkBloomPaper') {
    const radius = 14 + q * 115;
    const mask = [[31, 42, 1], [68, 61, .72], [46, 72, .65], [76, 24, .58]].map(([x,y,k]) => `radial-gradient(ellipse at ${x}% ${y}%, #000 0 ${radius * k}%, transparent ${radius * k + 1.5}%)`).join(',');
    return <SceneFill>{backdrop('#e4dbc6')}{photo({maskImage: mask, WebkitMaskImage: mask, transform: `scale(${1.08 - .08 * q})`, filter: `saturate(${.35 + q * .65})`})}<SceneFill style={{opacity: .13 * remain, background: 'repeating-linear-gradient(20deg,#866c47 0 1px,transparent 1px 7px)', mixBlendMode: 'multiply'}} /></SceneFill>;
  }
  if (visual === 'charcoalRubbing') {
    return <SceneFill>{paper({background: '#e9e5db'})}{range(28).map(i => {
      const local = .14 + .86 * stage(p, (i % 7) * .035, .76 + (i % 3) * .04);
      return photo({clipPath: `inset(${i * 100 / 28}% ${(1 - local) * (i % 2 ? 0 : 100)}% ${100 - (i + 1) * 100 / 28}% ${(1 - local) * (i % 2 ? 100 : 0)}%)`, filter: `grayscale(${remain}) contrast(${1 + remain * .45})`}, String(i));
    })}{photo({opacity: settle})}<SceneFill style={{opacity: .3 * remain, mixBlendMode: 'multiply', background: 'repeating-linear-gradient(-22deg,transparent 0 3px,#675f5144 3px 4px)'}} /></SceneFill>;
  }
  if (visual === 'watercolorPools') {
    const mask = [[18,32],[66,25],[48,78],[84,69]].map(([x,y],i) => `radial-gradient(ellipse at ${x}% ${y}%,#000 0 ${10 + q * (78 - i * 5)}%,transparent ${14 + q * (78 - i * 5)}%)`).join(',');
    return <SceneFill>{paper({background: '#f4dfd7'})}{photo({maskImage: mask, WebkitMaskImage: mask, filter: `saturate(${.6 + .4 * q}) blur(${remain * 1.2}px)`})}<SceneFill style={{opacity: .28 * remain, mixBlendMode: 'color', background: 'radial-gradient(ellipse at 20% 30%,#e78ca1,transparent 55%),radial-gradient(ellipse at 80% 60%,#5ab3ba,transparent 60%)'}} />{dots('#936693', 16)}</SceneFill>;
  }
  if (visual === 'paintRollerReveal') {
    const edge = 22 + q * 95;
    return <SceneFill>{backdrop('#e7daca')}{photo({clipPath: `inset(0 ${Math.max(0, 100 - edge)}% 0 0)`})}<div style={{position: 'absolute', left: `${edge}%`, top: '-6%', height: '112%', width: `${10 * remain}%`, borderRadius: '45%', background: 'linear-gradient(90deg,#e7e6df,#fff 48%,#bfb8af)', boxShadow: '-8px 0 18px #0004', transform: `translateX(-50%) rotate(${-4 * remain}deg)`, opacity: remain}} /><div style={{position:'absolute',left:`${edge}%`,top:'50%',width:`${16*remain}%`,height:4,background:'#8a7663',opacity:remain}} /></SceneFill>;
  }
  if (visual === 'paperWindowCut') {
    const r = 16 + q * 100;
    return <SceneFill>{photo()}<SceneFill style={{background: '#ebe3d3', clipPath: `polygon(0 0,100% 0,100% 100%,0 100%,0 0,${50-r}% ${50-r}%,${50-r}% ${50+r}%,${50+r}% ${50+r}%,${50+r}% ${50-r}%,${50-r}% ${50-r}%)`, opacity: remain, transform: `rotate(${remain * 7}deg)`, filter: 'drop-shadow(0 6px 10px #473b3355)'}} /><SceneFill style={{inset:`${Math.max(0,48-r)}%`,border:`${remain * 3}px dashed #aa8668`,transform:`rotate(${remain*7}deg)`,opacity:remain}} /></SceneFill>;
  }
  if (visual === 'polaroidSwing') {
    const swing = Math.cos(p * Math.PI * 2) * Math.pow(1-p, 2) * 13;
    return <SceneFill>{backdrop('#d9e5e7')}<SceneFill style={{transformOrigin: '50% -20%', transform: `translateY(${-12*(1-q)}%) rotate(${swing}deg) scale(${.69+.31*q})`}}>{framed({borderBottomWidth:`${7*remain}vmin`},2.4)}</SceneFill>{dots('#e1f8ff',18)}</SceneFill>;
  }
  if (visual === 'galleryRail') {
    const move = stage(p,0,.8);
    return <SceneFill>{backdrop('#d6dce2')}{[-1,1].map(i=>photo({inset:'12%',transform:`translateX(${i*(87+q*40)}%) scale(.72) rotateY(${i*18}deg)`,opacity:.6*remain,filter:'blur(3px)'},String(i)))}<SceneFill style={{transform:`translateX(${(1-move)*26}%) scale(${.66+.34*q})`}}>{framed({},1.8)}</SceneFill><SceneFill style={{opacity:.16*remain,background:'linear-gradient(105deg,transparent 30%,white 50%,transparent 70%)'}} /></SceneFill>;
  }
  if (visual === 'matteDepth') {
    return <SceneFill>{backdrop('#d8d4dd')}{range(4).map(i=>paper({inset:`${(5+i*4)*remain}%`,background:['#eee6dc','#c4b6c7','#ede9df','#faf9f4'][i],transform:`translate(${(i-1.5)*4*remain}%,${(i-1.5)*-3*remain}%) rotate(${(i-1.5)*3*remain}deg)`,boxShadow:'0 8px 22px #24304433'},String(i)))}<SceneFill style={{inset:`${18*remain}%`,transform:`rotate(${-6*remain}deg)`}}>{framed({},1)}</SceneFill></SceneFill>;
  }
  if (visual === 'albumBook') {
    const opening=stage(p,0,.62);
    return <SceneFill>{backdrop('#cbbca9')}<SceneFill style={{perspective:900,inset:`${10*remain}%`}}>{photo({boxShadow:'0 15px 26px #30281b44'})}<SceneFill style={{width:'50%',transformOrigin:'100% 50%',transform:`rotateY(${-145*opening-12}deg)`,backfaceVisibility:'hidden',background:'linear-gradient(90deg,#624537,#996e50)',boxShadow:'4px 0 15px #0004',opacity:remain}}>{photo({inset:'10%',opacity:.45})}</SceneFill><SceneFill style={{left:'49.5%',width:`${1*remain}%`,background:'#8f7258',opacity:remain}} /></SceneFill></SceneFill>;
  }
  if (visual === 'hangingClips') {
    const fall=stage(p,0,.7);
    return <SceneFill>{backdrop('#e2d8c8')}<div style={{position:'absolute',top:`${14*remain}%`,width:'100%',height:2,background:'#9e8d75',opacity:remain}} /><SceneFill style={{inset:`${10*remain}%`,transform:`translateY(${-14*(1-fall)}%) rotate(${Math.sin(p*8)*5*(1-p)}deg)`}}>{framed({},1.4)}{[22,78].map(left=><div key={left} style={{position:'absolute',left:`${left}%`,top:`${-5*remain}%`,width:`${4*remain}%`,height:`${12*remain}%`,borderRadius:3,background:'linear-gradient(90deg,#b28b57,#f3d6a3,#b28b57)',boxShadow:'2px 3px 4px #0004'}} />)}</SceneFill></SceneFill>;
  }
  if (visual === 'magnifierFocus') {
    const x=20+q*60,y=68-Math.sin(p*Math.PI)*40;
    return <SceneFill>{photo({filter:`blur(${7*remain}px) saturate(${.5+.5*q})`})}{photo({clipPath:`circle(${18+settle*100}% at ${x}% ${y}%)`})}<div style={{position:'absolute',left:`${x}%`,top:`${y}%`,width:`${36*remain}vmin`,height:`${36*remain}vmin`,border:`${1.4*remain}vmin solid #e9d1a4`,borderRadius:'50%',transform:'translate(-50%,-50%)',boxShadow:'0 4px 16px #0004',opacity:remain}} /><div style={{position:'absolute',left:`${x}%`,top:`${y}%`,width:`${3*remain}vmin`,height:`${22*remain}vmin`,transform:'translate(11vmin,11vmin) rotate(-38deg)',background:'#7d604d',borderRadius:20,opacity:remain}} /></SceneFill>;
  }
  if (visual === 'envelopeLetter') {
    const pull=stage(p,.04,.72),expand=stage(p,.6,1);
    return <SceneFill>{backdrop('#e2a086')}<SceneFill style={{inset:`${22*(1-expand)}%`,transform:`translateY(${10*(1-expand)}%)`}}>{paper({background:'#c8b9a6',clipPath:'polygon(0 10%,50% -34%,100% 10%,100% 100%,0 100%)',transform:`translateY(${-15*pull}%)`,opacity:remain})}{photo({inset:`${7*(1-expand)}%`,transform:`translateY(${-30*pull*(1-expand)}%) scale(${.84+.16*expand})`,boxShadow:'0 6px 15px #0004'})}{paper({background:'#eee8df',clipPath:`polygon(0 ${20+pull*10}%,50% 65%,100% ${20+pull*10}%,100% 100%,0 100%)`,transform:`translateY(${45*pull}%)`,opacity:remain})}</SceneFill></SceneFill>;
  }
  if (visual === 'parcelUnwrap') {
    const unfold=stage(p,0,.78);
    return <SceneFill>{backdrop('#ccbda4')}<SceneFill style={{perspective:1000}}>{photo({inset:`${14*remain}%`,transform:`scale(${.84+.16*q})`})}{range(4).map(i=>paper({background:['#c8aa78','#ddc49c','#bc9a69','#ead3ad'][i],clipPath:['polygon(0 0,100% 0,50% 40%)','polygon(100% 0,100% 100%,60% 50%)','polygon(0 100%,100% 100%,50% 60%)','polygon(0 0,0 100%,40% 50%)'][i],transform:`translate(${[0,75,0,-75][i]*unfold}%,${[-75,0,75,0][i]*unfold}%)`,opacity:remain,filter:'drop-shadow(0 4px 7px #523f3344)'},String(i)))}</SceneFill></SceneFill>;
  }
  if (visual === 'accordionLetter') {
    return <SceneFill>{backdrop('#d6c7ac')}<SceneFill style={{perspective:1100,transform:`scale(${.72+.28*q})`}}>{range(3).map(i=>photo({clipPath:`inset(${i*100/3}% 0 ${100-(i+1)*100/3}% 0)`,transform:`rotateX(${(i===1?0:(i===0?-1:1))*(1-q)*66}deg) translateY(${(1-i)*remain*7}%)`,transformOrigin:`50% ${(i+.5)*100/3}%`,filter:`brightness(${1-(i===1?0:.18*remain)})`},String(i)))}</SceneFill><SceneFill style={{opacity:remain*.24,background:'linear-gradient(180deg,transparent 32.8%,#9a8060 33.2%,transparent 33.8%,transparent 66%,#9a8060 66.5%,transparent 67%)'}} /></SceneFill>;
  }
  if (visual === 'postcardTurn') {
    const turn=stage(p,0,.7);
    return <SceneFill>{backdrop('#e6d5bc')}<SceneFill style={{perspective:1200,transform:`translateX(${16*(1-q)}%) scale(${.72+.28*q})`}}>{photo({transform:`rotateY(${-72*(1-turn)}deg) rotate(${-8*(1-q)}deg)`,boxShadow:`${16*remain}px 12px 25px #3b2e2833`,border:`${1.6*remain}vmin solid #fff9eb`,boxSizing:'border-box'})}<div style={{position:'absolute',right:'3%',top:'5%',width:'16%',height:'23%',border:'3px dotted #ac7655',transform:`rotate(${15*remain}deg)`,opacity:remain,background:'#e6c09a88'}} /></SceneFill></SceneFill>;
  }
  if (visual === 'ticketPerforation') {
    const tear=stage(p,.05,.65);
    return <SceneFill>{backdrop('#e1c7a6')}<SceneFill style={{transform:`scale(${.76+.24*q})`}}>{photo({clipPath:'inset(0 22% 0 0)'})}{photo({clipPath:'inset(0 0 0 78%)',transform:`translate(${18*tear}%,${-22*tear}%) rotate(${12*tear}deg)`,opacity:1-settle})}{photo({opacity:settle})}<div style={{position:'absolute',left:'78%',height:'100%',borderLeft:`${2*remain}px dashed #fff5d4`,opacity:remain}} /></SceneFill>{range(12).map(i=><div key={i} style={{position:'absolute',left:`${78+tear*(i%3)*3}%`,top:`${i*9-tear*10}%`,width:4,height:5,background:'#fdf4df',opacity:tear*remain,transform:`rotate(${i*28}deg)`}} />)}</SceneFill>;
  }
  if (visual === 'instantPrint') {
    const eject=stage(p,0,.75);
    return <SceneFill>{backdrop('#c6d8d8')}<SceneFill style={{inset:`${17*remain}%`,transform:`translateY(${16*(1-eject)}%)`}}>{framed({clipPath:`inset(0 0 ${(1-eject)*58}% 0)`,filter:`saturate(${.25+.75*eject})`},2.5)}</SceneFill><div style={{position:'absolute',left:`${12*remain}%`,right:`${12*remain}%`,top:`${60+eject*38}%`,height:`${8*remain}%`,borderRadius:8,background:'linear-gradient(#304b4c,#132b2d)',boxShadow:'0 -3px 10px #0005',opacity:remain}} /></SceneFill>;
  }
  if (visual === 'scrapbookAssemble') {
    const attach=stage(p,.15,.65);
    return <SceneFill>{backdrop('#e3d4b9')}{paper({inset:`${7*remain}%`,transform:`rotate(${5*remain}deg)`,background:'#f5efdf',boxShadow:'0 4px 15px #563f2433'})}<SceneFill style={{inset:`${12*remain}%`,transform:`rotate(${-7*remain}deg) translateY(${6*(1-q)}%)`}}>{framed({},1)}{[[-4,10,-22],[84,78,-24]].map(([left,top,rotate],i)=><div key={i} style={{position:'absolute',left:`${left}%`,top:`${top}%`,width:'22%',height:'9%',background:i?'#d78a8bbd':'#8ab7a5bd',transform:`translateY(${-(1-attach)*80}%) rotate(${rotate}deg)`,opacity:remain,boxShadow:'0 1px 2px #0002'}} />)}</SceneFill></SceneFill>;
  }
  // The folded image starts partially open, then its two wings flatten into a photo.
  return <SceneFill>{backdrop('#d9e2e6')}<SceneFill style={{perspective:1000,transform:`translate(${(1-q)*16}%,${(1-q)*-12}%) rotate(${-16*(1-q)}deg) scale(${.62+.38*q})`}}>{photo({clipPath:'polygon(15% 0,85% 0,50% 100%)'})}{photo({clipPath:'polygon(0 0,15% 0,50% 100%,0 100%)',transformOrigin:'35% 50%',transform:`rotateY(${-(1-q)*68}deg)`,filter:`brightness(${.8+.2*q})`})}{photo({clipPath:'polygon(85% 0,100% 0,100% 100%,50% 100%)',transformOrigin:'65% 50%',transform:`rotateY(${(1-q)*68}deg)`,filter:`brightness(${.9+.1*q})`})}</SceneFill></SceneFill>;
};
