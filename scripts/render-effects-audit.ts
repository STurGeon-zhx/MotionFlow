import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import sharp from 'sharp';
import {bundle} from '@remotion/bundler';
import {getVideoMetadata, openBrowser, renderMedia, renderStill} from '@remotion/renderer';
import type {VideoConfig} from 'remotion';
import {effects} from '../src/lib/effects';
import type {ImageIntroVideoProps} from '../src/remotion/types';

const output = path.resolve('.data/effect-audit-1022');
await fs.mkdir(output, {recursive: true});
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#f9cc71"/><rect x="35" y="30" width="280" height="290" fill="#58aacc"/><circle cx="450" cy="180" r="110" fill="#ee754e"/><path d="M0 0L640 360M640 0L0 360" stroke="#fff5" stroke-width="8"/><text x="105" y="210" fill="white" font-size="62">MOTION</text></svg>';
const source = await sharp(Buffer.from(svg)).png().toBuffer();
const imageSrc = `data:image/png;base64,${source.toString('base64')}`;
const serveUrl = await bundle({entryPoint: path.resolve('src/remotion/index.ts'), outDir: path.join(output,'bundle'), webpackOverride: c => ({...c, resolve: {...c.resolve, alias: {...c.resolve?.alias, '@':path.resolve('src')}}})});
const browser = await openBrowser('chrome', {logLevel:'error'});
const newEffects = effects.filter(e => e.category === 'reference_creative');
const failures: unknown[] = [];
let checked = 0;
const composition = (props: ImageIntroVideoProps) => ({id:'ImageIntroVideo', width:props.width,height:props.height,fps:30,durationInFrames:150,props,defaultProps:{},defaultCodec:null,defaultOutName:null,defaultVideoImageFormat:null,defaultSampleRate:null,defaultPixelFormat:null,defaultProResProfile:null}) as VideoConfig;
const propsFor = (effect: typeof effects[number],width:number,height:number,intensity: ImageIntroVideoProps['intensity']='medium',introFrames=36): ImageIntroVideoProps => ({imageSrc,backgroundMusicSrc:null,effect,width,height,introFrames,intensity,enableBreathing:true,randomParams:{scaleMultiplier:1.1,translateMultiplier:1.1,rotateMultiplier:1.1,blurMultiplier:1.1}});
async function inspect(buffer: Buffer) {
 const {data,info} = await sharp(buffer).removeAlpha().raw().toBuffer({resolveWithObject:true});
 let bright=0,sum=0,blank=0;
 for(let i=0;i<data.length;i+=info.channels){const r=data[i],g=data[i+1],b=data[i+2],l=.2126*r+.7152*g+.0722*b;sum+=l;if(l>60)bright++;if(Math.abs(r-8)<3&&Math.abs(g-20)<3&&Math.abs(b-38)<3)blank++;}
 const pixels=info.width*info.height;
 return {brightFraction:bright/pixels,meanLuma:sum/pixels,blankFraction:blank/pixels};
}
try {
 for(const [width,height,intensity,frames,introFrames] of [
   [320,180,'medium',[0,1,4],36], [180,320,'medium',[0,1,4],36],
   [180,320,'strong',[0],15], [320,180,'weak',[0],36],
 ] as const) {
   for(const effect of effects) {
     const props=propsFor(effect,width,height,intensity,introFrames);
     for(const frame of frames){
       const file=path.join(output,`${effect.id}-${width}-${intensity}-${frame}.png`);
       await renderStill({serveUrl,composition:composition(props),inputProps:props,puppeteerInstance:browser,frame,output:file,imageFormat:'png',logLevel:'error'});
       const metrics=await inspect(await fs.readFile(file));checked++;
       if(metrics.meanLuma<40||metrics.brightFraction<.2||metrics.blankFraction>.95) failures.push({effect:effect.id,width,height,intensity,frame,...metrics});
     }
   }
   console.log(`首帧检查 ${checked}，异常 ${failures.length}（${width}×${height} / ${intensity}）`);
 }
 // Contact sheets compare start, middle, settled and final frames of all 20 new scenes.
 for(let page=0;page<4;page++){
   const composites=[];
   for(const [row,effect] of newEffects.slice(page*5,page*5+5).entries()){
     for(const [column,frame] of [0,12,25,36,149].entries()){
       const props=propsFor(effect,320,180);const file=path.join(output,`${effect.id}-contact-${frame}.png`);
       await renderStill({serveUrl,composition:composition(props),inputProps:props,puppeteerInstance:browser,frame,output:file,imageFormat:'png',logLevel:'error'});
       const metrics=await inspect(await fs.readFile(file));if(metrics.meanLuma<40)failures.push({effect:effect.id,frame,...metrics});
       composites.push({input:file,left:column*320,top:row*204});
       composites.push({input:Buffer.from(`<svg width="320" height="24"><rect width="320" height="24" fill="white"/><text x="4" y="17" font-size="11">${effect.id} / ${frame}</text></svg>`),left:column*320,top:row*204+180});
     }
   }
   await sharp({create:{width:1600,height:1020,channels:3,background:'white'}}).composite(composites).jpeg().toFile(path.join(output,`contact-${page+1}.jpg`));
 }
 if(!process.argv.includes('--skip-videos')) {
   const ffmpeg=path.resolve('node_modules/@remotion/compositor-win32-x64-msvc/ffmpeg.exe');
   for(const [index,effect] of newEffects.entries()){
     const props=propsFor(effect,index%2?180:320,index%2?320:180);const video=path.join(output,`${effect.id}.mp4`);
     await renderMedia({serveUrl,composition:composition(props),inputProps:props,puppeteerInstance:browser,outputLocation:video,codec:'h264',pixelFormat:'yuv420p',muted:true,concurrency:3,x264Preset:'veryfast',crf:20,logLevel:'error'});
     const metadata=await getVideoMetadata(video);
     if(metadata.codec!=='h264'||Math.abs((metadata.durationInSeconds ?? 0)-5)>.1||metadata.fps!==30||metadata.width!==props.width||metadata.height!==props.height)failures.push({effect:effect.id,metadata});
     // Inspect every decoded MP4 frame too, not just the pre-encode stills.
     const decoded=spawnSync(ffmpeg,['-v','error','-i',video,'-an','-vf','scale=80:80','-f','image2pipe','-c:v','rawvideo','-pix_fmt','rgb24','pipe:1'],{maxBuffer:12*1024*1024});
     if(decoded.status!==0)throw Error(decoded.stderr.toString());
     const frameSize=80*80*3;
     for(let i=0;i<150;i++){
       const frameBuffer=decoded.stdout.subarray(i*frameSize,(i+1)*frameSize);if(frameBuffer.length!==frameSize)throw Error('MP4帧数不足');
       let sum=0;for(let j=0;j<frameBuffer.length;j+=3)sum+=.2126*frameBuffer[j]+.7152*frameBuffer[j+1]+.0722*frameBuffer[j+2];
       if(sum/6400<30)failures.push({effect:effect.id,encodedFrame:i,meanLuma:sum/6400});
     }
     console.log(`真实成片 ${index+1}/20 ${effect.name}`);
   }
 }
} finally {await browser.close({silent:true});}
await fs.writeFile(path.join(output,'report.json'),JSON.stringify({effectCount:effects.length,newEffectCount:newEffects.length,checked,failures},null,2));
if(failures.length){console.error(failures);process.exitCode=1;}else console.log(`通过：${effects.length} 个特效，${checked} 个首帧样本，20 个新效果动态验证`);
