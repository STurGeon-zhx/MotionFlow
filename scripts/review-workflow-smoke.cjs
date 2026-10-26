/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const {randomUUID} = require('node:crypto');
module.exports = async ({mainWindow: window, appUrl, projectRoot}) => {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const js = code => window.webContents.executeJavaScript(code, true);
  const checks = [];
  const assert = (ok, label) => { if (!ok) throw Error(label); checks.push(label); console.log("[workflow-check]", label); };
  async function poll(read, valid, timeout = 60000) {
    const start = Date.now(); let value;
    do { value = await read(); if (valid(value)) return value; await wait(100); } while (Date.now() - start < timeout);
    throw Error('等待超时：' + JSON.stringify(value));
  }
  async function capture(file) {
    for(let attempt=0;attempt<3;attempt++) {
      await wait(400);
      try { await fs.writeFile(file,(await window.webContents.capturePage()).toPNG()); return; }
      catch(error) { if(attempt===2)throw error; }
    }
  }
  const root = path.join(projectRoot, '.data/review');
  await fs.mkdir(path.join(root, 'screenshots'), {recursive: true});
  const session = window.webContents.session;
  const previous = (await session.cookies.get({url: appUrl})).find(x => x.name === 'motion_device_id');
  const identity = 'device_' + randomUUID().replaceAll('-', '');
  await session.cookies.set({url: appUrl, name: 'motion_device_id', value: identity, path: '/', httpOnly: true, sameSite: 'lax'});
  const api = async (url, init = {}) => {
    const response = await fetch(appUrl + url, {...init, headers: {cookie: 'motion_device_id=' + identity, ...init.headers}});
    const data = await response.json(); if (!response.ok) throw Error(JSON.stringify(data)); return data;
  };
  const savedSettings = await js('JSON.stringify({...localStorage})');
  try {
    const sample = await fs.readFile(path.join(projectRoot, 'public/preview-sample.svg'));
    for (const [route, workspace, count] of [['/', 'single_intro', 1], ['/motion-sequence', 'three_image_motion', 3]]) {
      const form = new FormData(); form.append('workspaceType', workspace);
      for (let i = 0; i < count; i++) {
        const png = await sharp(sample).resize(720, 1280, {fit: 'cover'}).png().toBuffer();
        form.append('files', new Blob([png], {type: 'image/png'}), '提交工作流测试' + i + '.png');
      }
      const images = (await api('/api/images', {method: 'POST', body: form})).images;
      await window.loadURL(appUrl + route);
      await poll(() => js("document.querySelector('.section-header small')?.textContent"), x => x?.startsWith(count + '/'));
      if (workspace === 'single_intro') {
        // 拒绝创建时仍保留草稿，不会误清空。
        await js("window.__savedFetch=window.fetch;window.fetch=(url,init)=>url==='/api/video-jobs'&&init?.method==='POST'?Promise.resolve(new Response(JSON.stringify({success:false,error:'测试创建失败'}),{status:400,headers:{'Content-Type':'application/json'}})):window.__savedFetch(url,init);document.querySelector('.result-panel .primary-action').click();void 0");
        await poll(() => js("document.querySelector('.notice')?.textContent"), x => x?.includes('测试创建失败'));
        assert((await api('/api/images')).images.length === 1, '创建失败保留上传图片');
        await js("window.fetch=window.__savedFetch;document.querySelector('.notice button').click();void 0");
      }
      const settings = await js('JSON.stringify({...localStorage})');
      // 检查实际播放器内容区比例，不允许实体边框挤压出黑边。
      const geometry = await js(`(()=>{const s=document.querySelector('.preview-shell'),p=s.querySelector(':scope > div'),r=s.getBoundingClientRect(),c=p.getBoundingClientRect(),css=getComputedStyle(s);return {ratio:r.width/r.height,target:720/1280,border:css.borderWidth,background:css.backgroundColor,delta:Math.max(Math.abs(r.width-c.width),Math.abs(r.height-c.height))};})()`);
      assert(Math.abs(geometry.ratio-geometry.target)<0.001 && geometry.border==='0px' && geometry.delta<0.1, workspace + ' 预览比例正确且无挤压边框');
      await capture(path.join(root, 'screenshots', 'workflow-' + workspace + '-portrait.png'));
      await js("document.querySelector('.result-panel .primary-action').click();void 0");
      await poll(() => js("document.querySelector('.notice')?.textContent"), x => x?.includes('可上传图片创建下一批任务'));
      const job = (await api('/api/video-jobs?pageSize=10')).jobs.find(x => x.toolType === workspace);
      assert(!!job, workspace + ' 提交后进入历史任务');
      assert((await api('/api/images?workspaceType=' + workspace)).images.length === 0, workspace + ' 草稿已清空');
      assert(await js("!document.querySelector('dialog[open]') && document.querySelector('.section-header small').textContent.startsWith('0/') && !!document.querySelector('.result-panel .primary-action')"), workspace + ' 自动准备新任务且不弹出旧任务');
      assert(settings === await js('JSON.stringify({...localStorage})'), workspace + ' 创建下一任务保留参数');
      await poll(() => js("document.querySelector('.recent-tasks')?.textContent"), x => x?.includes(job.id.slice(-6)));
      assert(true, workspace + ' 历史列表立即显示新任务');
      const completed = await poll(() => api('/api/video-jobs/' + job.id).then(x => x.job), x => ['completed','failed','partial_failed'].includes(x.status));
      assert(completed.status === 'completed', workspace + ' 清空草稿后原任务仍成功渲染');
      for (const image of images) assert((await fetch(appUrl + image.previewUrl, {headers: {cookie: 'motion_device_id=' + identity}})).ok, '历史任务原图仍可读取');
      await window.reload();
      await poll(() => js("document.querySelector('.section-header small')?.textContent"), x => x?.startsWith('0/'));
      assert(true, workspace + ' 刷新不会恢复上批图片');
    }
    const form = new FormData();
    form.append('files', new Blob([await sharp(sample).resize(1280,720).png().toBuffer()], {type:'image/png'}), '横版预览测试.png');
    await api('/api/images', {method:'POST', body:form});
    await window.loadURL(appUrl);
    await poll(() => js("document.querySelector('.preview-landscape')!==null"), Boolean);
    await wait(500);
    for (const width of [1440,1180]) {
      window.setSize(width,900); await wait(400);
      const ratio = await js("(()=>{const r=document.querySelector('.preview-shell').getBoundingClientRect();return r.width/r.height;})()");
      assert(Math.abs(ratio-1280/720)<0.001, width + ' 横版预览无比例偏差');
      await capture(path.join(root,'screenshots','workflow-landscape-'+width+'.png'));
    }
    await api('/api/images',{method:'DELETE'});
    await fs.writeFile(path.join(root,'workflow-review-report.json'),JSON.stringify({passed:true,checks,createdAt:new Date().toISOString()},null,2));
    console.log('[workflow-review] PASS', checks.length);
  } finally {
    await js(`localStorage.clear();for(const [key,value] of Object.entries(${savedSettings}))localStorage.setItem(key,value);void 0`);
    if(previous) await session.cookies.set({url:appUrl,name:previous.name,value:previous.value,path:'/',httpOnly:true,sameSite:'lax'});
    else await session.cookies.remove(appUrl,'motion_device_id');
    window.setSize(1440,900);
    await window.loadURL(appUrl);
  }
};
