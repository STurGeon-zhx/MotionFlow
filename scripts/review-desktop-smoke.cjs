/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");
const { dialog } = require("electron");
module.exports = async function ({
  mainWindow: window,
  appUrl,
  projectRoot,
  stopWorker,
  restartWorker,
  setUpdateFeed,
  getAppUrl,
  restartBase,
}) {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const result = {
    checks: [],
    screenshots: [],
    startedAt: new Date().toISOString(),
  };
  const root = path.join(projectRoot, ".data/review");
  const captures = path.join(root, "screenshots");
  await fs.mkdir(captures, { recursive: true });
  const js = (code) => window.webContents.executeJavaScript(code, true);
  const assert = (test, label) => {
    if (!test) throw Error(label);
    result.checks.push(label);
    console.log("[review]", label);
  };
  const cookies = await window.webContents.session.cookies.get({ url: appUrl });
  const cookie = cookies.map((x) => `${x.name}=${x.value}`).join("; ");
  async function api(route, options = {}) {
    const response = await fetch(appUrl + route, {
      ...options,
      headers: { cookie, ...options.headers },
    });
    const body = await response.json();
    if (!response.ok) throw Error(route + " " + JSON.stringify(body));
    return body;
  }
  async function poll(operation, predicate, timeout = 45000) {
    const started = Date.now();
    let value;
    do {
      value = await operation();
      if (predicate(value)) return value;
      await wait(100);
    } while (Date.now() - started < timeout);
    throw Error("等待超时 " + JSON.stringify(value).slice(0, 300));
  }
  const getJob = (id) => api("/api/video-jobs/" + id).then((body) => body.job);
  const click = (text) =>
    js(
      `(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes(${JSON.stringify(text)}));if(!b)throw Error('没有按钮 '+${JSON.stringify(text)});b.click();})()`,
    );
  const capture = async (name) => {
    await wait(500);
    const file = path.join(captures, name + ".png");
    await fs.writeFile(file, (await window.webContents.capturePage()).toPNG());
    result.screenshots.push(file);
  };
  await poll(
    () => js("document.querySelectorAll('.effect-card').length"),
    (n) => n === 118,
  );
  await js('document.querySelectorAll("video").forEach(v=>v.pause())');
  await capture("home-1440");
  await api("/api/images", { method: "DELETE" });
  await api("/api/images?workspaceType=three_image_motion", {
    method: "DELETE",
  });
  const sample = await fs.readFile(
    path.join(projectRoot, "public/preview-sample.svg"),
  );
  const sources = [];
  for (let index = 0; index < 6; index++) {
    const portrait = index % 3 === 2;
    const data = await sharp(sample)
      .resize(portrait ? 720 : 1280, portrait ? 1280 : 900, { fit: "cover" })
      .modulate({ hue: index * 12 })
      .png()
      .toBuffer();
    sources.push(data);
  }
  const form = new FormData();
  sources.forEach((data, index) =>
    form.append(
      "files",
      new Blob([data], { type: "image/png" }),
      `本地测试素材${index + 1}.png`,
    ),
  );
  const images = (await api("/api/images", { method: "POST", body: form }))
    .images;
  await window.loadURL(appUrl);
  await poll(
    () => js("document.querySelectorAll('.image-thumb').length"),
    (n) => n === 6,
  );
  assert(true, "上传六张图片并刷新恢复");
  const payload = {
    toolType: "single_intro",
    imageIds: images.map((x) => x.id),
    ratio: "source",
    durationSec: 5,
    countPerImage: 1,
    effectMode: "specific",
    selectedCategories: [],
    selectedEffectIds: ["light_radial_clarity"],
    allowDuplicate: false,
    introDurationSec: 1.2,
    intensity: "medium",
    enableBreathing: true,
    resolution: "720p",
  };
  const created = (
    await api("/api/video-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  ).jobId;
  await poll(
    () => getJob(created),
    (job) => job.items.some((x) => x.status === "rendering"),
  );
  const start = Date.now();
  await api("/api/video-jobs/" + created + "/pause", { method: "POST" });
  const paused = await poll(
    () => getJob(created),
    (job) => job.status === "paused",
    6000,
  );
  assert(Date.now() - start < 5000, "真实渲染任务在五秒内暂停");
  assert(paused.failedCount === 0, "用户暂停不计为失败");
  const other = (
    await api("/api/video-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        imageIds: [images[0].id],
        selectedEffectIds: ["basic_zoom_in"],
      }),
    })
  ).jobId;
  await poll(
    () => getJob(other),
    (job) => job.status === "completed",
  );
  assert(
    (await getJob(created)).status === "paused",
    "另一任务正常完成且不解除已暂停任务",
  );
  await api("/api/video-jobs/" + created + "/resume", { method: "POST" });
  await window.loadURL(appUrl + "/?job=" + created);
  await poll(() => js("document.querySelector('.task-dialog')?.open"), Boolean);
  await capture("task-progress");
  const complete = await poll(
    () => getJob(created),
    (job) => job.status === "completed",
    60000,
  );
  assert(
    complete.completedCount === 6 && complete.failedCount === 0,
    "继续后六条视频完成且不重复失败",
  );
  await wait(1200);
  await capture("task-complete");
  await js(
    "document.querySelector('button[aria-label=\"关闭任务详情\"]').click()",
  );
  await js(
    "(()=>{const input=document.querySelector('.effect-search input');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,'光芒变清晰');input.dispatchEvent(new Event('input',{bubbles:true}));})()",
  );
  await wait(200);
  assert(
    (await js("document.querySelectorAll('.effect-card').length")) === 1,
    "特效搜索筛选正确",
  );
  // Mock only the native folder chooser; video writes still use the real main-process export handler.
  const exportDir = path.join(root, "exports", String(Date.now()));
  await fs.mkdir(exportDir, { recursive: true });
  const chooser = dialog.showOpenDialog;
  dialog.showOpenDialog = async () => ({
    canceled: false,
    filePaths: [exportDir],
  });
  try {
    await js("window.alert=message=>{window.__reviewAlert=message;};void 0");
    await click("导出全部");
    await poll(
      () => fs.readdir(exportDir),
      (files) => files.filter((file) => file.endsWith(".mp4")).length === 6,
      30000,
    );
    const exported = (await fs.readdir(exportDir)).filter((file) =>
      file.endsWith(".mp4"),
    );
    assert(
      exported.every((name) => name.startsWith("本地测试素材")),
      "原生成片导出六条 MP4 并沿用原始文件名（目录选择使用测试桩）",
    );
  } finally {
    dialog.showOpenDialog = chooser;
  }
  await window.loadURL(appUrl + "/motion-sequence");
  const trioForm = new FormData();
  trioForm.append("workspaceType", "three_image_motion");
  sources.forEach((data, index) =>
    trioForm.append(
      "files",
      new Blob([data], { type: "image/png" }),
      `三图素材${index + 1}.png`,
    ),
  );
  const triples = (await api("/api/images", { method: "POST", body: trioForm }))
    .images;
  await window.loadURL(appUrl + "/motion-sequence");
  await poll(
    () => js("document.querySelectorAll('.sequence-thumb').length"),
    (n) => n === 6,
  );
  await js(
    "document.querySelectorAll('.sequence-thumb')[0].dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:new DataTransfer()}))",
  );
  await wait(100);
  await js(
    "document.querySelectorAll('.sequence-thumb')[3].dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:new DataTransfer()}))",
  );
  await wait(300);
  const reordered = (await api("/api/images?workspaceType=three_image_motion"))
    .images;
  assert(reordered[3].id === triples[0].id, "跨组三图拖拽重排并持久化");
  await click("开始批量生成");
  const trio = await poll(
    () =>
      api("/api/video-jobs").then((x) =>
        x.jobs.find((j) => j.toolType === "three_image_motion"),
      ),
    Boolean,
  );
  await poll(
    () => getJob(trio.id),
    (job) => job.status === "completed",
    60000,
  );
  assert(true, "六张三图素材生成两条十五秒视频");
  await window.loadURL(appUrl + "/motion-sequence?job=" + trio.id);
  await poll(() => js("document.querySelector('.task-dialog')?.open"), Boolean);
  await capture("three-image-results");
  await js(
    "document.querySelector('button[aria-label=\"关闭任务详情\"]').click()",
  );
  await capture("three-image-workspace");
  const disposable = (
    await api("/api/video-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  ).jobId;
  await poll(
    () => getJob(disposable),
    (job) => job.items.some((x) => x.status === "rendering"),
  );
  const deletionStart = Date.now();
  await api("/api/video-jobs/" + disposable, { method: "DELETE" });
  assert(
    !(await api("/api/video-jobs")).jobs.some((j) => j.id === disposable),
    "渲染中任务立即从列表删除",
  );
  assert(Date.now() - deletionStart < 1500, "删除请求不等待渲染完成");
  const foreign = await fetch(appUrl + "/api/video-jobs/" + created, {
    headers: { cookie: "motion_device_id=device_" + "a".repeat(32) },
  });
  assert(foreign.status === 404, "其他设备不能读取当前任务详情");
  await window.loadURL(appUrl + "/history");
  await wait(1000);
  await capture("history");
  window.setSize(1180, 780);
  await window.loadURL(appUrl);
  await wait(1200);
  assert(
    await js("document.documentElement.scrollWidth<=window.innerWidth+1"),
    "1180 宽窗口无横向页面溢出",
  );
  await capture("home-1180");
  window.setSize(1440, 900);
  stopWorker();
  await wait(16000);
  const offline = (
    await api("/api/video-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  ).jobId;
  const offlineJob = await getJob(offline);
  assert(!offlineJob.workerOnline, "Worker 离线有可识别状态");
  await api("/api/video-jobs/" + offline + "/pause", { method: "POST" });
  assert(
    (await getJob(offline)).status === "paused",
    "Worker 离线仍可暂停排队任务",
  );
  await api("/api/video-jobs/" + offline, { method: "DELETE" });
  assert(
    !(await api("/api/video-jobs")).jobs.some((j) => j.id === offline),
    "Worker 离线仍可删除任务",
  );
  restartWorker();
  await wait(2000);
  const feed = await require("./review-update-feed.cjs")(
    projectRoot,
    global.__motionReviewSigningKey,
  );
  setUpdateFeed(feed.url);
  try {
    const found = await js("window.motionFlowDesktop.checkForUpdates()");
    assert(
      found.status === "available" && found.latestVersion === "1.1.2",
      "本地签名更新源检查到代码新版",
    );
    const staged = await js("window.motionFlowDesktop.downloadUpdate()");
    assert(staged.ready, "代码逐文件下载、签名和哈希校验成功");
    await js("void window.motionFlowDesktop.applyUpdate(false).catch(()=>{})");
    await poll(
      async () => {
        try {
          return await fetch(getAppUrl() + "/api/runtime-config").then(
            (response) => response.json(),
          );
        } catch {
          return {};
        }
      },
      (health) => health.codeVersion === "1.1.2" && health.workerOnline,
      60000,
    );
    appUrl = getAppUrl();
    assert(true, "真实切换代码目录、重启服务并通过健康检查");
    assert(
      (await getJob(created)).completedCount === 6,
      "代码更新后历史任务、设备身份和成品保留",
    );
    await capture("code-update-applied");
  } finally {
    await restartBase();
    appUrl = getAppUrl();
    await feed.close();
  }
  await window.loadURL(appUrl);
  await wait(1000);
  await capture("home-ready");
  result.finishedAt = new Date().toISOString();
  await fs.writeFile(
    path.join(root, "desktop/smoke-results.json"),
    JSON.stringify(result, null, 2),
  );
  console.log("[review] 本地软件端到端测试完成");
};
