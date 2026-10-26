/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const sharp=require('sharp');
module.exports=async({mainWindow:win,appUrl,projectRoot})=>{
 const js=code=>win.webContents.executeJavaScript(code,true);
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 const checks=[];
 const assert=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);console.log('[polish-check]',label);};
 const poll=async(read,valid)=>{for(let i=0;i<600;i++){const value=await read();if(valid(value))return value;await wait(100);}throw Error('等待超时');};
 const captures=path.join(projectRoot,'.data/review/screenshots');await fs.mkdir(captures,{recursive:true});
 const capture=async(name)=>{await wait(450);await fs.writeFile(path.join(captures,name+'.png'),(await win.webContents.capturePage()).toPNG());};
 const session=win.webContents.session;
 const previous=(await session.cookies.get({url:appUrl})).find(c=>c.name==='motion_device_id');
 const identity='device_'+randomUUID().replaceAll('-','');
 await session.cookies.set({url:appUrl,name:'motion_device_id',value:identity,path:'/',httpOnly:true,sameSite:'lax'});
 const api=async(url,init={})=>{const res=await fetch(appUrl+url,{...init,headers:{cookie:'motion_device_id='+identity,...init.headers}});const data=await res.json();if(!res.ok)throw Error(JSON.stringify(data));return data;};
 const saved=await js('JSON.stringify({...localStorage})');
 let jobId;
 try {
  await win.loadURL(appUrl);
  await poll(()=>js("document.querySelectorAll('.effect-card').length"),n=>n===118);
  const effects=(await api('/api/effects')).effects;
  assert(effects.length===118&&!effects.some(e=>e.id.startsWith('particle_')),'20条新光粒子已下架，特效库恢复118条');
  assert(await js("(()=>{const r=document.querySelector('.preview-shell').getBoundingClientRect();return Math.abs(r.width/r.height-16/9)<.001;})()"),'默认16:9预览保持不变');
  const bounce=await js("(()=>{const b=document.querySelector('.advanced-toggle');b.click();return b.getAnimations().some(a=>a.effect.getTiming().duration===440&&a.effect.getKeyframes().some(k=>Number(k.scale)<.94));})()");
  assert(bounce,'按钮有440毫秒明显回弹与光圈动画');
  win.webContents.debugger.attach('1.3');
  try {
   await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
   await wait(450);
   assert(await js("(()=>{const b=document.querySelector('.advanced-toggle');b.click();return matchMedia('(prefers-reduced-motion: reduce)').matches&&b.getAnimations().length===0;})()"),'减少动态效果设置可关闭增强动效');
  } finally {await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[]});win.webContents.debugger.detach();}
  const data=await sharp(await fs.readFile(path.join(projectRoot,'public/preview-sample.svg'))).png().toBuffer();
  const form=new FormData();for(let i=0;i<24;i++)form.append('files',new Blob([data],{type:'image/png'}),'滚动评审'+i+'.png');
  const images=(await api('/api/images',{method:'POST',body:form})).images;
  const payload={toolType:'single_intro',imageIds:images.map(x=>x.id),ratio:'source',resolution:'720p',durationSec:5,countPerImage:1,effectMode:'specific',selectedCategories:[],selectedEffectIds:['basic_zoom_in'],allowDuplicate:false,introDurationSec:1.2,intensity:'medium',enableBreathing:true};
  jobId=(await api('/api/video-jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})).jobId;
  await api('/api/video-jobs/'+jobId+'/pause',{method:'POST'});
  await api('/api/images',{method:'DELETE'});
  await win.loadURL(appUrl+'/?job='+jobId);
  await poll(()=>js("document.querySelectorAll('.task-result-grid article').length"),n=>n===24);
  await wait(450);
  for(const [width,height] of [[1440,900],[1180,720]]){
   win.setSize(width,height);await wait(500);
   const geometry=await js("(()=>{const d=document.querySelector('.task-dialog'),g=document.querySelector('.task-result-grid'),p=document.querySelector('.task-preview-card'),h=document.querySelector('.task-progress-heading'),r=document.querySelector('.task-results-heading');const before=[p.getBoundingClientRect().top,h.getBoundingClientRect().top,r.getBoundingClientRect().top];g.scrollTop=99999;const after=[p.getBoundingClientRect().top,h.getBoundingClientRect().top,r.getBoundingClientRect().top];return {outerOverflow:d.scrollHeight-d.clientHeight,gridOverflow:g.scrollHeight-g.clientHeight,scrolled:g.scrollTop>0,fixed:before.every((v,i)=>Math.abs(v-after[i])<.1),lastVisible:g.lastElementChild.getBoundingClientRect().bottom<=g.getBoundingClientRect().bottom+1,dialogBottom:d.getBoundingClientRect().bottom,viewport:innerHeight};})()");
   assert(geometry.outerOverflow<=1&&geometry.gridOverflow>0&&geometry.scrolled&&geometry.fixed&&geometry.lastVisible&&geometry.dialogBottom<=geometry.viewport,`${width}×${height} 仅结果列表滚动，预览进度固定且末条可见`);
   await capture('results-scroll-'+width);
   await js("document.querySelector('.task-result-grid').scrollTop=0;void 0");
  }
  await js("document.querySelector('.task-dialog button[title=\"删除任务\"]').click();void 0");
  await poll(()=>js("document.querySelector('.interface-dialog').open"),Boolean);
  assert(await js("document.querySelector('.interface-dialog p').textContent.includes('确定删除')"),'确认弹窗仍保留任务删除保护');
  await capture('enhanced-confirm-dialog');
  await js("document.querySelector('.interface-dialog .ghost-action').click();void 0");await wait(450);
  assert((await api('/api/video-jobs/'+jobId)).job.id===jobId,'取消确认不会删除任务');
  const closeMotion=await js("new Promise(resolve=>{document.querySelector('button[aria-label=\"关闭任务详情\"]').click();setTimeout(()=>resolve(document.querySelector('.task-result-grid')?.children.length===24&&document.querySelector('.task-dialog').getAnimations().some(a=>a.effect.getTiming().duration>=220)),40)})");
  assert(closeMotion,'任务弹窗退出时保留内容并播放增强动效');
  await fs.writeFile(path.join(projectRoot,'.data/review/polish-review-report.json'),JSON.stringify({passed:true,checks,createdAt:new Date().toISOString()},null,2));
  console.log('[polish-review] PASS',checks.length);
 } finally {
  if(jobId)await api('/api/video-jobs/'+jobId,{method:'DELETE'}).catch(()=>undefined);
  await js(`localStorage.clear();for(const [key,value] of Object.entries(${saved}))localStorage.setItem(key,value);void 0`);
  if(previous)await session.cookies.set({url:appUrl,name:previous.name,value:previous.value,path:'/',httpOnly:true,sameSite:'lax'});else await session.cookies.remove(appUrl,'motion_device_id');
  win.setSize(1440,900);await win.loadURL(appUrl);
 }
};
