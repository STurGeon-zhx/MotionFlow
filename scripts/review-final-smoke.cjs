/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs/promises"),
  path = require("node:path");
const { dialog } = require("electron");
module.exports = async ({ mainWindow: window, appUrl, projectRoot }) => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const root = path.join(projectRoot, ".data/review");
  const js = (code) => window.webContents.executeJavaScript(code, true);
  const cookies = await window.webContents.session.cookies.get({ url: appUrl });
  const cookie = cookies.map((x) => `${x.name}=${x.value}`).join("; ");
  const jobs = await fetch(appUrl + "/api/video-jobs?pageSize=50", {
    headers: { cookie },
  }).then((r) => r.json());
  const job = jobs.jobs.find(
    (x) =>
      x.toolType === "single_intro" &&
      x.status === "completed" &&
      x.totalCount === 6,
  );
  if (!job) throw Error("缺少完整测试任务");
  await window.loadURL(appUrl + "/?job=" + job.id);
  for (let i = 0; i < 100; i++) {
    if (
      (await js(
        "document.querySelectorAll('.task-result-thumb input').length",
      )) === 6
    )
      break;
    await wait(100);
  }
  await js(
    "document.querySelector('.task-results-heading input').click();void 0",
  );
  await wait(100);
  await js(
    "document.querySelectorAll('.task-result-thumb input')[0].click();document.querySelectorAll('.task-result-thumb input')[2].click();void 0",
  );
  await wait(200);
  if (
    (await js(
      "document.querySelectorAll('.task-result-thumb input:checked').length",
    )) !== 2
  )
    throw Error("部分选择状态错误");
  const output = path.join(root, "selected-export-" + Date.now());
  await fs.mkdir(output, { recursive: true });
  const original = dialog.showOpenDialog;
  dialog.showOpenDialog = async () => ({
    canceled: false,
    filePaths: [output],
  });
  try {
    await js("window.alert=message=>{window.__finalAlert=message;};void 0");
    await js(
      "document.querySelector('.task-results-heading .compact-mp4-export').click();void 0",
    );
    for (let i = 0; i < 100; i++) {
      const files = (await fs.readdir(output)).filter((x) =>
        x.endsWith(".mp4"),
      );
      if (files.length === 2) break;
      await wait(100);
    }
    const files = (await fs.readdir(output)).filter((x) => x.endsWith(".mp4"));
    if (files.length !== 2) throw Error("勾选导出数量不正确");
    await fs.writeFile(
      path.join(root, "selected-export-report.json"),
      JSON.stringify(
        { passed: true, count: 2, files, nativeDirectoryPickerMocked: true },
        null,
        2,
      ),
    );
  } finally {
    dialog.showOpenDialog = original;
  }
  await fs.writeFile(
    path.join(root, "screenshots/selected-results.png"),
    (await window.webContents.capturePage()).toPNG(),
  );
  await window.loadURL(appUrl);
  await wait(700);
  await fs.writeFile(
    path.join(root, "screenshots/home-ready.png"),
    (await window.webContents.capturePage()).toPNG(),
  );
  console.log("[final-review] 勾选两条 MP4 实际导出成功");
};
