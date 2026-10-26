/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {loadSigningKey}=require('./prepare-release-signing.cjs');
const updates=require('../packaging/code-updates.cjs');
const root=path.resolve(__dirname,'..');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function main(){
 const codeOnly=process.argv.includes('--code-only');
 const source=codeOnly?root:path.join(root,'.data/installer-runtime');
 const resolveSource=relative=>codeOnly&&relative.startsWith('remotion-bundle')?path.join(root,'.data/review',relative):path.join(source,...relative.split('/'));
 const pkg=JSON.parse(await fs.readFile(path.join(source,'package.json'),'utf8'));
 if(!/^\d+\.\d+\.\d+$/.test(pkg.version))throw Error('无效发布版本');
 const version=pkg.version;
 const release=path.join(root,'.release','v'+version);await fs.mkdir(release,{recursive:true});
 const runtimeId=(await fs.readFile(path.join(root,'packaging/electron-main.cjs'),'utf8')).match(/const runtimeId = "([^"]+)"/)[1];
 const files=[];const buffers=[];let offset=0;
 async function add(relative){
  updates.safeRelative(relative);
  const bytes=await fs.readFile(resolveSource(relative));
  files.push({path:relative,size:bytes.length,sha256:hash(bytes),offset});buffers.push(bytes);offset+=bytes.length;
 }
 async function walk(relative){
  const entries=await fs.readdir(resolveSource(relative),{withFileTypes:true});
  entries.sort((a,b)=>a.name<b.name?-1:1);
  for(const entry of entries){
   if(['node_modules','cache','dev','types','diagnostics','trace','trace-build'].includes(entry.name)||entry.isSymbolicLink())continue;
   const rel=relative+'/'+entry.name;
   if(entry.isDirectory())await walk(rel);else if(entry.isFile())await add(rel);
  }
 }
 for(const folder of ['src','public','.next','remotion-bundle'])await walk(folder);
 for(const file of ['server.ts','package.json','next.config.ts','next-env.d.ts','tsconfig.json'])await add(file);
 const bundle=Buffer.concat(buffers);const bundleName=`MotionFlow-Code-v${version}.bin`;
 const manifest={schemaVersion:1,version,runtimeId,bundle:{url:`https://github.com/STurGeon-zhx/MotionFlow/releases/download/v${version}/${bundleName}`,size:bundle.length,sha256:hash(bundle)},files};
 const payload=Buffer.from(JSON.stringify(manifest));
 const envelope={payload:payload.toString('base64'),signature:crypto.sign(null,payload,loadSigningKey()).toString('base64')};
 const publicKey=await fs.readFile(path.join(root,'packaging/update-public-key.pem'),'utf8');
 updates.verifyManifest(envelope,publicKey,runtimeId);
 await fs.writeFile(path.join(release,bundleName),bundle);
 await fs.writeFile(path.join(release,'MotionFlow-Code-Update.json'),JSON.stringify(envelope,null,2));
 const verifyRoot=path.join(root,'.data/release-verification',crypto.randomUUID());let downloads=0;
 await updates.stageCodeUpdate(envelope,verifyRoot,{publicKey,runtimeId,expectedVersion:version,currentVersion:'1.1.1',baseUrl:'https://github.com/STurGeon-zhx/MotionFlow/releases/download/',fetchImpl:async(url)=>{if(url!==manifest.bundle.url)throw Error('更新来源错误');downloads++;return new Response(bundle);}});
 await updates.verifyStaged(verifyRoot,version,runtimeId,publicKey);
 if(downloads!==1)throw Error('代码更新不应逐文件重复下载');
 const installer=`MotionFlow-Setup-${version}-Windows-x64.exe`;
 if(!codeOnly)await fs.copyFile(path.join(root,'.release/installer',installer),path.join(release,installer));
 const sums=[];
 for(const file of [...(codeOnly?[]:[installer]),bundleName,'MotionFlow-Code-Update.json'])sums.push(hash(await fs.readFile(path.join(release,file)))+'  '+file);
 await fs.writeFile(path.join(release,'SHA256SUMS.txt'),sums.join('\n')+'\n');
 await fs.writeFile(path.join(root,'.data/release-verification/report.json'),JSON.stringify({passed:true,version,codeFiles:files.length,bundleBytes:bundle.length,downloads,verifiedAt:new Date().toISOString()},null,2));
 console.log(JSON.stringify({release,version,codeOnly,codeFiles:files.length,bundleBytes:bundle.length,verified:true}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
