/* eslint-disable @typescript-eslint/no-require-imports */
const {repository: DEFAULT_UPDATE_REPOSITORY} = require('./update-config.json');
const STABLE_VERSION = /^v?(\d+)\.(\d+)\.(\d+)$/;
function parseVersion(version) {
  const match = STABLE_VERSION.exec(String(version || '').trim());
  if (!match) throw new Error('版本号格式不正确，请使用 v1.2.3 形式的正式版本标签');
  return match.slice(1).map(Number);
}
function compareVersions(left, right) {
  const a = parseVersion(left), b = parseVersion(right);
  for (let i=0;i<3;i++) {if(a[i]!==b[i]) return a[i]>b[i]?1:-1;}
  return 0;
}
function normalizeRepository(value) {
  let repository=String(value||'').trim();
  if (!repository) return '';
  repository=repository.replace(/^https:\/\/(?:www\.)?github\.com\//i,'').replace(/^git@github\.com:/i,'').replace(/\.git\/?$/i,'').replace(/\/$/,'');
  if(!/^[a-z\d][a-z\d_.-]*\/[a-z\d][a-z\d_.-]*$/i.test(repository))throw new Error('请输入 GitHub 仓库地址或 用户名/仓库名');
  return repository;
}
function getReleaseUpdate(release, currentVersion, repository) {
  if (release.draft || release.prerelease) throw new Error('当前发布不是正式版本');
  const tag=String(release.tag_name||'');parseVersion(tag);
  const version=tag.replace(/^v/,'');
  const prefix=`https://github.com/${repository}/releases/download/`.toLowerCase();
  const assets=Array.isArray(release.assets)?release.assets:[];
  const trusted = assets.filter(item => String(item.browser_download_url||'').toLowerCase().startsWith(prefix));
  const asset=trusted.find(item => /^MotionFlow-Setup-.*Windows-x64\.exe$/i.test(item.name||'')) || trusted.find(item => /^MotionFlow.*Desktop.*Windows.*x64.*\.zip$/i.test(item.name||''));
  return {
    status: compareVersions(version,currentVersion)>0?'available':'up_to_date',
    currentVersion,latestVersion:version,name:String(release.name||tag),notes:String(release.body||'').slice(0,30000),
    publishedAt:release.published_at||null,
    codeManifestUrl: assets.find(item => item.name === 'MotionFlow-Code-Update.json' && String(item.browser_download_url||'').toLowerCase().startsWith(prefix))?.browser_download_url || null,
    asset:asset?{name:asset.name,url:asset.browser_download_url,size:Number(asset.size)||0,digest: /^sha256:[a-f\d]{64}$/i.test(asset.digest||'')?asset.digest:null}:null,
  };
}
async function checkForUpdate(config, fetchImpl=fetch) {
  const repository=normalizeRepository(config.repository) || DEFAULT_UPDATE_REPOSITORY;
  if(!repository) return {status:'not_configured',currentVersion:config.currentVersion};
  let response;
  try {
    response=await fetchImpl(`https://api.github.com/repos/${repository}/releases/latest`,{headers:{Accept:'application/vnd.github+json','User-Agent':'MotionFlow-Desktop','X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(20000)});
  }catch {throw new Error('连接 GitHub 失败，请检查网络后重试');}
  if(response.status===404) return {status:'no_release',currentVersion:config.currentVersion,message:'未找到正式版本，请检查仓库地址、仓库访问权限，并确认已创建 Release'};
  if(response.status===403||response.status===429)throw new Error('GitHub 请求暂时受限，请稍后再试');
  if(!response.ok)throw new Error(`检查更新失败（${response.status}）`);
  return getReleaseUpdate(await response.json(),config.currentVersion,repository);
}
module.exports={DEFAULT_UPDATE_REPOSITORY,compareVersions,normalizeRepository,getReleaseUpdate,checkForUpdate};
