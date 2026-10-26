import {createRequire} from 'node:module';
import {describe, expect, it, vi} from 'vitest';
const require = createRequire(import.meta.url);
const {DEFAULT_UPDATE_REPOSITORY,compareVersions, normalizeRepository, getReleaseUpdate, checkForUpdate} = require('../packaging/github-updates.cjs');
const repository='example/motionflow';
const release=(version='v1.2.0')=>({tag_name:version,name:'New version',body:'Release notes',draft:false,prerelease:false,assets:[{name:'MotionFlow-Desktop-20261022-Windows-x64.zip',browser_download_url:`https://github.com/${repository}/releases/download/${version}/MotionFlow-Desktop-20261022-Windows-x64.zip`,size:1024,digest:'sha256:'+'a'.repeat(64)}]});

describe('GitHub Releases 软件更新',()=>{
 it('按数值比较版本而不是字符串排序，避免误降级',()=>{
  expect(compareVersions('v1.10.0','1.9.9')).toBe(1);
  expect(compareVersions('1.1.0','v1.1.0')).toBe(0);
  expect(compareVersions('v1.0.9','1.1.0')).toBe(-1);
  expect(()=>compareVersions('1.2.0-beta','1.1.0')).toThrow();
 });
 it('规范化仓库地址并拒绝外部地址',()=>{
  expect(normalizeRepository('https://github.com/example/motionflow.git')).toBe(repository);
  expect(normalizeRepository('git@github.com:example/motionflow.git')).toBe(repository);
  expect(()=>normalizeRepository('https://example.com/owner/repo')).toThrow();
 });
 it('检测新版并只选取该仓库的Windows桌面压缩包',()=>{
  const update=getReleaseUpdate(release(),'1.1.0',repository);
  expect(update.status).toBe('available');
  expect(update.asset.name).toContain('Windows-x64');
  expect(update.asset.digest).toBe('sha256:'+'a'.repeat(64));
  const invalid=release();invalid.assets[0].browser_download_url='https://other.example/installer.zip';
  expect(getReleaseUpdate(invalid,'1.1.0',repository).asset).toBeNull();
 });
 it('优先识别Windows安装包并兼容旧桌面压缩包',()=>{
  const data=release();data.assets.push({...data.assets[0],name:'MotionFlow-Setup-1.2.0-Windows-x64.exe',browser_download_url:'https://github.com/example/motionflow/releases/download/v1.2.0/MotionFlow-Setup-1.2.0-Windows-x64.exe'});
  expect(getReleaseUpdate(data,'1.1.1',repository).asset.name).toContain('Setup');
 });
 it('当前版本等于或高于远程版本时不提示更新',()=>{
  expect(getReleaseUpdate(release(),'1.2.0',repository).status).toBe('up_to_date');
  expect(getReleaseUpdate(release(),'2.0.0',repository).status).toBe('up_to_date');
 });
 it('拒绝草稿和预发布，缺少桌面附件时保留更新说明',()=>{
  expect(()=>getReleaseUpdate({...release(),prerelease:true},'1.1.0',repository)).toThrow();
  expect(getReleaseUpdate({...release(),assets:[]},'1.1.0',repository)).toMatchObject({status:'available',asset:null,notes:'Release notes'});
 });
 it('未配置或清空仓库时默认检查MotionFlow的GitHub正式版本',async()=>{
  expect(DEFAULT_UPDATE_REPOSITORY).toBe('STurGeon-zhx/MotionFlow');
  const fetcher=vi.fn(async(url: string)=>{void url;return new Response(JSON.stringify(release()),{status:200});});
  await checkForUpdate({repository:'',currentVersion:'1.1.0'},fetcher);
  expect(fetcher.mock.calls[0][0]).toBe('https://api.github.com/repos/STurGeon-zhx/MotionFlow/releases/latest');
 });
 it('通过最新Release接口获取可用正式版本',async()=>{
  const fetcher=vi.fn(async(url: string)=>{void url;return new Response(JSON.stringify(release()),{status:200});});
  expect((await checkForUpdate({repository,currentVersion:'1.1.0'},fetcher)).status).toBe('available');
  expect(fetcher.mock.calls[0][0]).toBe(`https://api.github.com/repos/${repository}/releases/latest`);
 });
 it('分别报告无正式版本、请求限流与网络故障',async()=>{
  const config={repository,currentVersion:'1.1.0'};
  expect((await checkForUpdate(config,async()=>new Response(null,{status:404}))).status).toBe('no_release');
  await expect(checkForUpdate(config,async()=>new Response(null,{status:403}))).rejects.toThrow('受限');
  await expect(checkForUpdate(config,async()=>{throw Error('offline');})).rejects.toThrow('连接 GitHub 失败');
 });
});

// Signed code updates do not modify the active version until every file is verified.
const updateFs = require('node:fs');
const updateOs = require('node:os');
const updatePath = require('node:path');
const crypto = require('node:crypto');
const codeUpdates = require('../packaging/code-updates.cjs');
const keyPair = crypto.generateKeyPairSync('ed25519');
const updatePublicKey = keyPair.publicKey.export({type:'spki',format:'pem'});
const runtimeId = 'test-runtime';
function signedFixture(change: (manifest: Record<string, unknown>) => void = ()=>{}) {
 const files=['server.ts','package.json','.next/BUILD_ID','src/worker.ts'].map(file=>({path:file,url:`https://github.com/example/motionflow/releases/download/v1.2.0/${encodeURIComponent(file)}`,size:4,sha256:crypto.createHash('sha256').update('test').digest('hex')}));
 const manifest: Record<string,unknown>={schemaVersion:1,version:'1.2.0',runtimeId,files};change(manifest);
 const payload=Buffer.from(JSON.stringify(manifest));return {payload:payload.toString('base64'),signature:crypto.sign(null,payload,keyPair.privateKey).toString('base64')};
}
const codeOptions=()=>({publicKey:updatePublicKey,runtimeId,baseUrl:'https://github.com/example/motionflow/releases/download/',fetchImpl:async()=>new Response('test'),expectedVersion:'1.2.0',currentVersion:'1.1.1'});
async function inUpdateDirectory(operation:(root:string)=>Promise<void>){const root=updateFs.mkdtempSync(updatePath.join(updateOs.tmpdir(),'motion-update-test-'));try{await operation(root);}finally{updateFs.rmSync(root,{recursive:true,force:true});}}
describe('软件内签名代码更新',()=>{
 it('验证签名后暂存文件，不改活动版本，不下载整包',async()=>inUpdateDirectory(async root=>{
  const marker=await codeUpdates.stageCodeUpdate(signedFixture(),root,codeOptions());
  expect(marker.version).toBe('1.2.0');expect(codeUpdates.readPointer(root)).toEqual({});
  expect(updateFs.readFileSync(updatePath.join(root,'versions/1.2.0/server.ts'),'utf8')).toBe('test');
  expect(await codeUpdates.verifyStaged(root,'1.2.0',runtimeId,updatePublicKey)).toContain('1.2.0');
 }));
 it('一次下载签名代码资源并逐项校验写入，兼容原逐文件方式',async()=>inUpdateDirectory(async root=>{
  const bytes=Buffer.from('test'.repeat(4));
  const envelope=signedFixture(manifest=>{
   manifest.bundle={url:'https://github.com/example/motionflow/releases/download/v1.2.0/code.bin',size:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
   (manifest.files as Array<Record<string,unknown>>).forEach((file,index)=>{file.offset=index*4;delete file.url;});
  });
  const fetchImpl=vi.fn(async()=>new Response(bytes));
  await codeUpdates.stageCodeUpdate(envelope,root,{...codeOptions(),fetchImpl});
  expect(fetchImpl).toHaveBeenCalledOnce();
  expect(updateFs.readFileSync(updatePath.join(root,'versions/1.2.0/src/worker.ts'),'utf8')).toBe('test');
  expect(await codeUpdates.verifyStaged(root,'1.2.0',runtimeId,updatePublicKey)).toContain('1.2.0');
 }));
 it('拒绝签名资源的非法偏移、错误总大小及损坏内容',async()=>inUpdateDirectory(async root=>{
  const make=(offset=0,size=16)=>signedFixture(manifest=>{
   manifest.bundle={url:'https://github.com/example/motionflow/releases/download/v1.2.0/code.bin',size,sha256:crypto.createHash('sha256').update('test'.repeat(4)).digest('hex')};
   (manifest.files as Array<Record<string,unknown>>).forEach((file,index)=>{file.offset=index*4+(index===0?offset:0);});
  });
  expect(()=>codeUpdates.verifyManifest(make(1),updatePublicKey,runtimeId)).toThrow('偏移');
  expect(()=>codeUpdates.verifyManifest(make(0,17),updatePublicKey,runtimeId)).toThrow('资源');
  await expect(codeUpdates.stageCodeUpdate(make(),root,{...codeOptions(),fetchImpl:async()=>new Response('evil'.repeat(4))})).rejects.toThrow('校验');
  expect(codeUpdates.readPointer(root)).toEqual({});
 }));
 it('拒绝无效签名、运行环境不匹配和版本号不匹配',async()=>inUpdateDirectory(async root=>{
  await expect(codeUpdates.stageCodeUpdate({...signedFixture(),signature:Buffer.alloc(64).toString('base64')},root,codeOptions())).rejects.toThrow('签名');
  await expect(codeUpdates.stageCodeUpdate(signedFixture(m=>{m.runtimeId='other';}),root,codeOptions())).rejects.toThrow('运行环境');
  await expect(codeUpdates.stageCodeUpdate(signedFixture(),root,{...codeOptions(),expectedVersion:'9.0.0'})).rejects.toThrow('版本');
 }));
 it('拒绝目录穿越、绝对路径、Windows特殊路径及替换用户数据',()=>{
  for(const file of ['../data/db','/absolute','C:/Windows/file','src/../data/db','src/con.txt','src/file.','node_modules/pkg.js','data/db'])expect(()=>codeUpdates.safeRelative(file)).toThrow();
 });
 it('断网和文件损坏不改变旧版，并清理暂存目录',async()=>inUpdateDirectory(async root=>{
  for(const fetchImpl of [async()=>{throw Error('offline');},async()=>new Response('evil')]){
   await expect(codeUpdates.stageCodeUpdate(signedFixture(),root,{...codeOptions(),fetchImpl})).rejects.toThrow();
   expect(codeUpdates.readPointer(root)).toEqual({});expect(updateFs.readdirSync(updatePath.join(root,'staging'))).toHaveLength(0);
  }
 }));
 it('应用前重新验证文件与签名，拒绝已被修改的暂存内容',async()=>inUpdateDirectory(async root=>{
  await codeUpdates.stageCodeUpdate(signedFixture(),root,codeOptions());
  updateFs.writeFileSync(updatePath.join(root,'versions/1.2.0/server.ts'),'evil');
  await expect(codeUpdates.verifyStaged(root,'1.2.0',runtimeId,updatePublicKey)).rejects.toThrow('损坏');
 }));
 it('健康检查失败恢复版本指针和数据库，并重新启动旧版',async()=>inUpdateDirectory(async root=>{
  await codeUpdates.stageCodeUpdate(signedFixture(),root,codeOptions());
  const restore=vi.fn(),restartPrevious=vi.fn();
  await expect(codeUpdates.activateCodeUpdate(root,'1.2.0',{...codeOptions(),backup:async()=> 'snapshot',restore,stop:vi.fn(),startAndCheck:async()=>false,restartPrevious})).rejects.toThrow('已恢复旧版');
  expect(restore).toHaveBeenCalledWith('snapshot');expect(restartPrevious).toHaveBeenCalledOnce();expect(codeUpdates.readPointer(root)).toEqual({});
 }));
 it('健康检查通过才完成切换，并保留旧数据',async()=>inUpdateDirectory(async root=>{
  const data=updatePath.join(root,'data');updateFs.mkdirSync(data);updateFs.writeFileSync(updatePath.join(data,'history'),'keep');
  await codeUpdates.stageCodeUpdate(signedFixture(),root,codeOptions());
  await codeUpdates.activateCodeUpdate(root,'1.2.0',{...codeOptions(),backup:async()=>null,restore:vi.fn(),startAndCheck:async()=>true});
  expect(codeUpdates.readPointer(root).version).toBe('1.2.0');expect(updateFs.readFileSync(updatePath.join(data,'history'),'utf8')).toBe('keep');
 }));
 it('备份失败不会恢复不完整备份，并重新启动旧服务',async()=>inUpdateDirectory(async root=>{
  await codeUpdates.stageCodeUpdate(signedFixture(),root,codeOptions());
  const restore=vi.fn(),restartPrevious=vi.fn();
  await expect(codeUpdates.activateCodeUpdate(root,'1.2.0',{...codeOptions(),backup:async()=>{throw Error('disk full');},restore,stop:vi.fn(),startAndCheck:vi.fn(),restartPrevious})).rejects.toThrow('已恢复旧版');
  expect(restore).not.toHaveBeenCalled();expect(restartPrevious).toHaveBeenCalledOnce();expect(codeUpdates.readPointer(root)).toEqual({});
 }));

});
