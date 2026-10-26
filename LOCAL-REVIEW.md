# MotionFlow 本地评审版

## 打开软件

双击项目根目录的 **启动本地评审.vbs**，会打开独立的 MotionFlow 软件窗口，不打开外部浏览器。也可在项目目录运行 `npm run desktop:review`。

这是源码环境中的本地评审入口；正式的 Windows 安装程序将在评审通过后另行生成。本轮没有制作安装包、压缩包，也没有推送或发布 GitHub 版本。

## 本轮可以评审的内容

- 新三栏界面、真实特效缩略图、名称搜索、最近任务及任务详情弹窗。
- 排队、渲染中任务都可暂停和删除；暂停立即中断当前视频，继续时重做该条，已完成视频保留。
- 弹窗可勾选已完成结果，选择本机目录直接导出 MP4，沿用上传素材名称。
- 两种工具保持 720p / 30fps；三图仍为 15 秒、在第 5 和第 10 秒直接切图，镜头使用同一条全局轨迹。
- 软件内更新代码：签名验证、逐文件下载、校验、切换代码目录、重启本地服务，启动失败时回退。

## 数据隔离

测试数据位于 `.data/review/desktop/data`，测试用的软件身份位于 `.data/review/desktop/profile`。均与项目原来的 `.data` 数据库和历史素材隔离。

评审窗口中预置的是本轮生成的山湖演示素材和测试任务，可自行上传图片测试。原音乐库只读复用。

## 更新测试说明

默认更新源仍是 `STurGeon-zhx/MotionFlow` 的 GitHub 正式 Release。当前没有向远端发布本轮代码更新资源，所以正常检查不会出现本轮未发布的新版本。

完整流程已使用临时 Ed25519 密钥和仅监听本机的模拟更新源验证：模拟从 1.1.1 更新到 1.1.2，重新启动并保留历史、成片和设备身份，再回到本地评审基线。临时私钥只在测试进程内存中使用，没有写入仓库。

正式发布前需在首个安装版中嵌入正式更新公钥，并提供签名的 `MotionFlow-Code-Update.json` 和对应代码文件；不会直接拉取、执行 GitHub 分支源码。底层运行环境不兼容时只提示升级，不强行覆盖。

## 测试材料

- [验收与性能报告](LOCAL-REVIEW-REPORT.md)
- 运行日志：`.data/review/desktop/`
- 实际软件截图：`.data/review/screenshots/`
- 原始性能记录与抽帧对照：`.data/review/benchmark/`
- 历史数据库副本迁移报告：`.data/review/migration-copy/report.json`

## 开发复验命令

```powershell
npm run typecheck
npm run lint
npm test
npm run build
node --import tsx scripts/prepare-review-assets.ts --covers
npm run desktop:review
```

`package:installer` 仅是后续安装构建入口，本轮没有运行。正式构建需要先提供 `MOTION_UPDATE_PUBLIC_KEY_FILE`，然后才会准备运行环境和生成当前用户安装的 NSIS 程序。
