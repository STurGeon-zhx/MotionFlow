/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const path=require('node:path');
const net=require('node:net');
const {spawn,execFileSync}=require('node:child_process');
const sharp=require('sharp');
const {getVideoMetadata}=require('@remotion/renderer');
const root=path.resolve(__dirname,'..');
const exe=path.resolve(process.argv[2]||path.join(root,'.release/installer/win-unpacked/MotionFlow.exe'));
if(!exe.toLowerCase().startsWith((path.join(root,'.release')+path.sep).toLowerCase()))throw Error('仅允许验证项目发行目录内的软件');
const output=path.join(root,'.data/installer-smoke',Date.now().toString());fs.mkdirSync(output,{recursive:true});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function poll(read,valid,timeout=120000){const start=Date.now();let value;do{try{value=await read();if(valid(value))return value;}catch{}await wait(200);}while(Date.now()-start<timeout);throw Error('等待超时 '+JSON.stringify(value));}
async function main(){
 const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port));});});
 const env={...process.env,MOTION_APP_DATA_DIR:path.join(output,'application-data'),PATH:process.env.SystemRoot+'\\System32;'+process.env.SystemRoot};
 for(const name of ['MOTION_DESKTOP_REVIEW','ELECTRON_RUN_AS_NODE','NODE_OPTIONS','NODE_PATH'])delete env[name];
 const child=spawn(exe,[`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1'],{cwd:path.dirname(exe),env,windowsHide:false,stdio:['ignore',fs.openSync(path.join(output,'desktop.log'),'a'),fs.openSync(path.join(output,'desktop-error.log'),'a')]});
 let socket;const checks=[];
 const assert=(value,label)=>{if(!value)throw Error(label);checks.push(label);console.log('[installed]',label);};
 try {
  const page=await poll(()=>fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json()),pages=>pages.some(p=>p.type==='page'&&p.url.startsWith('http://127.0.0.1:'))).then(pages=>pages.find(p=>p.type==='page'&&p.url.startsWith('http://127.0.0.1:')));
  socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  const callbacks=new Map();let nextId=0;
  socket.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.id&&callbacks.has(message.id)){const callback=callbacks.get(message.id);callbacks.delete(message.id);if(message.error)callback.reject(Error(JSON.stringify(message.error)));else callback.resolve(message.result);}});
  const rpc=(method,params={})=>new Promise((resolve,reject)=>{const id=++nextId;callbacks.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
  const js=async expression=>{const result=await rpc('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
  let appUrl=new URL(page.url).origin;
  const cookies=(await rpc('Network.getCookies',{urls:[appUrl]})).cookies.map(c=>c.name+'='+c.value).join('; ');
  const api=async(route,init={})=>{const response=await fetch(appUrl+route,{...init,headers:{cookie:cookies,...init.headers}});const data=await response.json();if(!response.ok||!data.success)throw Error(route+JSON.stringify(data));return data;};
  const config=await api('/api/runtime-config');assert(config.codeVersion==='1.2.0'&&config.downloadMode==='mp4','正式独立软件启动，版本1.2.0，导出MP4');
  assert(await js("typeof window.motionFlowDesktop?.selectDownloadDirectory==='function'&&typeof window.motionFlowDesktop?.saveDownloadFile==='function'"),'原生目录选择和成片保存桥接可用');
  assert((await api('/api/effects')).effects.length===118,'安装版特效库118条');
  await poll(()=>js("document.querySelectorAll('.effect-card').length"),n=>n===118);
  assert(await js("(()=>{const r=document.querySelector('.preview-shell').getBoundingClientRect();return Math.abs(r.width/r.height-16/9)<.001;})()"),'安装版默认16:9预览');
  const png=await sharp(path.join(root,'public/preview-sample.svg')).png().toBuffer();
  const upload=async(workspace,count)=>{const form=new FormData();form.append('workspaceType',workspace);for(let i=0;i<count;i++)form.append('files',new Blob([png],{type:'image/png'}),`安装验收素材${i+1}.png`);return (await api('/api/images',{method:'POST',body:form})).images;};
  const images=await upload('single_intro',1);
  const single={toolType:'single_intro',imageIds:images.map(i=>i.id),ratio:'source',resolution:'720p',durationSec:5,countPerImage:1,effectMode:'specific',selectedCategories:[],selectedEffectIds:['basic_zoom_in'],allowDuplicate:false,introDurationSec:1.2,intensity:'medium',enableBreathing:true};
  const trio=await upload('three_image_motion',3);
  const requests=[single,{toolType:'three_image_motion',imageIds:trio.map(i=>i.id),resolution:'720p',motionSpeed:.8,motionAmplitude:.025,enableMusic:true}];
  const ids=[];
  for(const request of requests)ids.push((await api('/api/video-jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)})).jobId);
  for(let index=0;index<ids.length;index++){
   const job=await poll(()=>api('/api/video-jobs/'+ids[index]).then(x=>x.job),j=>['completed','failed','partial_failed'].includes(j.status),180000);
   assert(job.status==='completed',index?'三图15秒真实渲染完成':'单图5秒真实渲染完成');
   const item=job.items[0];const response=await fetch(appUrl+item.downloadUrl,{headers:{cookie:cookies}});
   assert(response.ok&&item.downloadFilename.startsWith('安装验收素材1'),'成片下载沿用上传素材名称');
   const file=path.join(output,index?'three-image.mp4':'single-image.mp4');await fsp.writeFile(file,Buffer.from(await response.arrayBuffer()));
   const meta=await getVideoMetadata(file);assert(meta.codec==='h264'&&meta.fps===30&&meta.width===1280&&meta.height===720&&meta.audioCodec==='aac'&&Math.abs((meta.durationInSeconds||0)-(index?15:5))<.12,'成片为720p、30fps、H.264和AAC音乐');
  }
  if(process.argv.includes('--upgrade')) {
   const updates=require('../packaging/code-updates.cjs');
   const version=JSON.parse(await fsp.readFile(path.join(root,'package.json'),'utf8')).version;
   const envelope=JSON.parse(await fsp.readFile(path.join(root,'.release','v'+version,'MotionFlow-Code-Update.json'),'utf8'));
   const bundle=await fsp.readFile(path.join(root,'.release','v'+version,'MotionFlow-Code-v'+version+'.bin'));
   await updates.stageCodeUpdate(envelope,path.join(env.MOTION_APP_DATA_DIR,'updates'),{publicKey:await fsp.readFile(path.join(root,'packaging/update-public-key.pem'),'utf8'),runtimeId:'motionflow-win32-x64-node-runtime-1',currentVersion:'1.2.0',expectedVersion:version,baseUrl:'https://github.com/STurGeon-zhx/MotionFlow/releases/download/',fetchImpl:async()=>new Response(bundle)});
   await js("void window.motionFlowDesktop.applyUpdate(false).catch(error=>console.error(error))");
   await poll(()=>js("fetch('/api/runtime-config').then(r=>r.json())"),value=>value.codeVersion===version&&value.workerOnline,180000);
   appUrl=new URL(await js('location.href')).origin;
   assert((await api('/api/video-jobs')).jobs.length===ids.length,'代码更新后保留原任务历史');
   assert((await api('/api/images')).images[0].id===images[0].id,'代码更新后保留图片草稿和设备身份');
   await js("location.assign('/history');void 0");
   await poll(()=>js("!!document.querySelector('.history-home-link')"),Boolean);
   assert(await js("document.querySelector('.history-home-link').textContent.includes('返回主页')&&document.querySelector('.history-home-link').getAttribute('href')==='/'"),'历史页在创建新任务左侧显示返回主页');
   const historyScreen=await rpc('Page.captureScreenshot',{format:'png'});await fsp.writeFile(path.join(output,'history-return-home.png'),Buffer.from(historyScreen.data,'base64'));
   await js("document.querySelector('.history-home-link').click();void 0");
   await poll(()=>js("location.pathname==='/'&&document.querySelectorAll('.image-thumb').length===1"),Boolean);
   assert((await api('/api/images')).images[0].id===images[0].id,'点击返回主页不会清空草稿');
   assert((await js('window.motionFlowDesktop.getUpdateConfig()')).currentVersion===version,'现有1.2.0安装程序应用签名更新后显示新版');
  }
  const screen=await rpc('Page.captureScreenshot',{format:'png'});await fsp.writeFile(path.join(output,'installed-window.png'),Buffer.from(screen.data,'base64'));
  await fsp.writeFile(path.join(output,'report.json'),JSON.stringify({passed:true,exe,checks,usedBundledNode:true,appData:env.MOTION_APP_DATA_DIR,checkedAt:new Date().toISOString()},null,2));
  await fsp.writeFile(path.join(root,'.data/installer-smoke/latest.json'),JSON.stringify({output,passed:true},null,2));
  console.log('安装软件验证通过：'+output);
 }finally{
  socket?.close();
  try{execFileSync('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}catch{}
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
