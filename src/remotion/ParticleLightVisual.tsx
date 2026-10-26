import React, {useId} from 'react';
import {AbsoluteFill, Img, useCurrentFrame, useVideoConfig} from 'remotion';
import {particlePoint, particleStyles, type ParticleVisual} from '@/lib/particle-effects';

export function ParticleLightVisual({visual,imageSrc,imageStyle}: {visual:ParticleVisual;imageSrc:string;imageStyle:React.CSSProperties}) {
  const frame=useCurrentFrame();
  const {width,height}=useVideoConfig();
  const id=useId().replace(/:/g,'');
  const style=particleStyles[visual];
  const phase=frame/60;
  const time=frame/150*Math.PI*2;
  const [zoom,dx,dy,tilt]=style.camera;
  const particles=Array.from({length:style.count},(_,i)=>particlePoint(visual,i,phase));
  const scale=Math.min(width,height)/720;
  return <AbsoluteFill style={{overflow:'hidden'}}>
    <AbsoluteFill style={{transform:`translate(${dx*Math.sin(time)}%, ${dy*Math.sin(time+.6)}%) rotate(${tilt*Math.sin(time)}deg) scale(${zoom+.008*Math.sin(time)})`}}>
      <Img src={imageSrc} style={imageStyle}/>
    </AbsoluteFill>
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" style={{position:'absolute',inset:0,mixBlendMode:'screen',pointerEvents:'none'}}>
      <defs>
        <radialGradient id={id+'halo'}><stop stopColor={style.colors[0]} stopOpacity=".25"/><stop offset="1" stopColor={style.colors[1]} stopOpacity="0"/></radialGradient>
      </defs>
      <ellipse cx={width*(.5+.25*Math.sin(phase*Math.PI*2))} cy={height*.35} rx={width*.55} ry={height*.5} fill={`url(#${id}halo)`}/>
      {visual==='particleConstellation' && particles.map((p,i)=>i%5<4 && <line key={'link'+i} x1={p.x*width} y1={p.y*height} x2={particles[i+1].x*width} y2={particles[i+1].y*height} stroke={style.colors[0]} strokeWidth={scale} opacity=".22"/>)}
      {visual==='particleLightning' && [0,1].map(row=><polyline key={row} points={Array.from({length:35},(_,i)=>`${width*i/34},${height*((row?.8:.2)+.08*Math.sin(Math.floor(i/34*18)*2.7+phase*Math.PI*2))}`).join(' ')} fill="none" stroke={style.colors[row]} strokeWidth={2*scale} opacity=".65"/>)}
      {visual==='particleGrid' && Array.from({length:9},(_,i)=><line key={i} x1={width*.5} y1={height*.3} x2={width*(i/8*1.4-.2)} y2={height} stroke={style.colors[0]} strokeWidth={scale} opacity=".15"/>)}
      {visual==='particlePortal' && [0,1,2,3].map(i=>{const radius=((phase+i/4)%1);return <ellipse key={i} cx={width*.5} cy={height*.5} rx={width*radius*.58} ry={height*radius*.48} fill="none" stroke={style.colors[i%3]} strokeWidth={2*scale} opacity={.5*(1-radius)}/>;})}
      {particles.map((p,i)=>{
        const x=p.x*width,y=p.y*height,r=p.size*scale*(style.shape==='ring'?2.4:1);
        const color=style.colors[i%3];
        const glow={filter:`drop-shadow(0 0 ${4*scale}px ${color})`};
        return <g key={i} transform={`translate(${x} ${y}) rotate(${p.rotation})`} opacity={p.opacity} style={glow}>
          {style.shape==='dot' && <><circle r={r*2} fill={color} opacity=".12"/><circle r={r*.65} fill={color}/><circle r={r*.2} fill="white"/></>}
          {style.shape==='star' && <path d={`M0 ${-r*2} L${r*.4} ${-r*.4} L${r*2} 0 L${r*.4} ${r*.4} L0 ${r*2} L${-r*.4} ${r*.4} L${-r*2} 0 L${-r*.4} ${-r*.4} Z`} fill={color}/>}
          {style.shape==='streak' && <><line x1={-r*(visual==='particleRain'?10:7)} y1="0" x2="0" y2="0" stroke={color} strokeWidth={Math.max(1,r*.4)} opacity=".35"/><line x1={-r*2} y1="0" x2="0" y2="0" stroke="white" strokeWidth={Math.max(1,r*.25)}/><circle r={r*.35} fill={color}/></>}
          {style.shape==='crystal' && Array.from({length:6},(_,j)=><path key={j} transform={`rotate(${j*60})`} d={`M0 0 V${-r*2} M0 ${-r} L${-r*.5} ${-r*1.5} M0 ${-r} L${r*.5} ${-r*1.5}`} fill="none" stroke={color} strokeWidth={scale}/>)}
          {style.shape==='ring' && <><circle r={r} fill={color} fillOpacity=".04" stroke={color} strokeWidth={scale*1.4}/><path d={`M${-r*.7} 0 A${r*.7} ${r*.7} 0 0 1 0 ${-r*.7}`} fill="none" stroke="white" strokeWidth={scale}/></>}
          {style.shape==='wing' && <g transform={`scale(${.55+.4*Math.sin((phase+i)*Math.PI*4)} 1)`}><ellipse cx={-r} cy={-r*.4} rx={r*1.4} ry={r*2} fill={color} opacity=".7"/><ellipse cx={r} cy={-r*.4} rx={r*1.4} ry={r*2} fill={color} opacity=".7"/><line y1={-r} y2={r*1.2} stroke="white" strokeWidth={scale}/></g>}
          {style.shape==='petal' && <path d={`M0 ${-r*2} Q${r*2} 0 0 ${r*2} Q${-r*1.3} 0 0 ${-r*2}`} fill={color} opacity=".8"/>}
          {style.shape==='prism' && <><path d={`M0 ${-r*2} L${r} 0 L0 ${r*2} L${-r} 0 Z`} fill={color} fillOpacity=".35" stroke={color} strokeWidth={scale}/><path d={`M0 ${-r*2} V${r*2} M${-r} 0 H${r}`} stroke="white" strokeOpacity=".6" strokeWidth={scale*.7}/></>}
        </g>;
      })}
    </svg>
  </AbsoluteFill>;
}
