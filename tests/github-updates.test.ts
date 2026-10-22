import {createRequire} from 'node:module';
import {describe, expect, it, vi} from 'vitest';
const require = createRequire(import.meta.url);
const {compareVersions, normalizeRepository, getReleaseUpdate, checkForUpdate} = require('../packaging/github-updates.cjs');
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
 it('当前版本等于或高于远程版本时不提示更新',()=>{
  expect(getReleaseUpdate(release(),'1.2.0',repository).status).toBe('up_to_date');
  expect(getReleaseUpdate(release(),'2.0.0',repository).status).toBe('up_to_date');
 });
 it('拒绝草稿和预发布，缺少桌面附件时保留更新说明',()=>{
  expect(()=>getReleaseUpdate({...release(),prerelease:true},'1.1.0',repository)).toThrow();
  expect(getReleaseUpdate({...release(),assets:[]},'1.1.0',repository)).toMatchObject({status:'available',asset:null,notes:'Release notes'});
 });
 it('未配置仓库时不联网',async()=>{
  const fetcher=vi.fn();expect(await checkForUpdate({repository:'',currentVersion:'1.1.0'},fetcher)).toMatchObject({status:'not_configured'});
  expect(fetcher).not.toHaveBeenCalled();
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
