# MotionFlow 图片入场动效工坊

一个本地运行的图片批量视频工具，支持“单图 5 秒特效”和“三图 15 秒微动”两种模式。

## 已实现

- 单张或批量上传，工作区最多 100 张、单图 20MB；缩略图区域同时显示 10 张并可拖动滚动条查看其余图片
- 每张图片固定生成 1 条视频，输出比例自动跟随该图片
- 导出时按任务顺序自动添加音乐库中对应音乐的前 5 秒，音乐不足时循环使用
- 新任务固定输出 720p，并按原图方向控制长边清晰度；旧 1080p 历史任务仍可查看、下载和重试
- 7 个基础入场动画和 75 个“入场＋出场”联动组合动画，其中 47 个采用独立的创意视觉机制
- 全随机、基础、组合、分类和指定特效五种分配模式
- SQLite 持久任务、双槽位并行渲染 Worker、重启恢复与失败自动降级
- 实时进度、视频在线播放、单条下载和多条成片直接下载
- 历史任务和图片工作区按浏览器设备 ID 隔离，并支持失败项重试
- 三图模式支持 3～99 张图片、跨组拖拽排序，每三张按顺序生成一条 15 秒视频
- 三图模式可调移动速度与幅度，画布跟随组内首图，并支持自动配乐或静音输出

## 启动

需要 Node.js 20 或更高版本。首次安装依赖：

```bash
npm install
```

开发模式只需一条命令，它会同时启动网页和渲染 Worker：

```bash
npm run dev
```

然后本机打开 [http://localhost:3001](http://localhost:3001)。同一局域网内的其他设备使用 `http://本机局域网IP:3001` 访问，例如 `http://192.168.1.100:3001`。可运行 `ipconfig`，在当前联网网卡下查看“IPv4 地址”。Windows 防火墙首次询问时，请允许 Node.js 通过专用网络。

项目会在每个浏览器中保存独立设备 ID。历史列表、任务详情、图片工作区、重试、下载和删除只允许创建任务的同一浏览器访问。清理浏览器 Cookie 或换用其他浏览器会被识别为新设备；升级前仅按 IP 保存且无法准确归属的旧任务不会自动展示，避免不同用户串台。

第一次真实渲染时 Remotion 可能需要下载兼容的浏览器和视频编码组件，因此耗时会明显长于后续任务。

如果 3000 端口已被占用，可在 PowerShell 中指定其他端口：

```powershell
$env:PORT='3001'; npm run dev
```

生产模式：

```bash
npm run build
npm start
```

## Windows 便携发行版

执行以下命令会生成一个可直接转发的 Windows 64 位便携包：

```bash
npm run package:portable
```

产物位于 `.release/MotionFlow-Windows-x64.zip`。接收方解压后双击“启动 MotionFlow.cmd”即可使用，不需要另行安装 Node.js。发行版中的单条下载为 MP4；“导出全部”会把任务内全部 MP4 直接保存到当前用户的“下载\MotionFlow\任务编号”目录。源码运行版本仍保留 ZIP 批量下载。

需要独立软件窗口和 `.exe` 启动程序时，执行：

```bash
npm run package:desktop
```

桌面版产物位于 `.release/MotionFlow-Desktop-Windows-x64.zip`。解压后双击 `MotionFlow.exe`，程序通过内置 Electron 运行环境打开独立应用窗口，不会启动 Edge 或 Chrome；下载位置使用 Windows 原生文件夹选择窗口，关闭软件后本地服务和渲染 Worker 会一起停止。

运行数据默认存放在 `.data`，包括 SQLite 数据库、上传图片、视频成品和 Remotion 运行组件。可以通过 `MOTION_DATA_DIR` 环境变量修改位置。

默认渲染配置为 2 个任务槽位、每条视频 4 路帧并发和 `veryfast` 编码预设。单图任务可以双槽位并行；三图 15 秒任务会自动限流为一次一条，避免两个长视频互相争抢资源。需要临时调整时可使用 `MOTION_RENDER_SLOTS`、`MOTION_RENDER_CONCURRENCY` 和 `MOTION_RENDER_PRESET` 环境变量。渲染临时失败时会自动重建浏览器，并依次降为 2 路和 1 路并发重试。

## 检查与测试

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run render:smoke
npm run render:sequence-smoke
npm run render:benchmark
```

`render:smoke` 会用 16:9 横版图片真实生成一条 1280×720、5 秒、H.264 视频，并检查尺寸、编码与时长。
`render:sequence-smoke` 会使用三张不同尺寸的图片分别验证 15 秒 AAC 配乐版本和静音版本。
`render:benchmark` 会使用同一批 1080p 素材比较旧版单槽位配置和新版双槽位配置，并校验视频规格、失败数、总耗时与内存峰值。

内置音乐保存在 `assets/music`，支持 MP3、WAV、M4A、AAC 和 OGG。网易云 `.ncm` 加密缓存文件不能直接用于渲染，需要先转换为上述标准音频格式。

## 使用边界

首版按个人或三人以内小团队的本地内部工具设计，不包含登录、云端部署、AI 视频生成、字幕或自定义时间轴。Remotion 的许可条款可能更新；公司规模扩大、自动化商用或对外发布前，请核对 [Remotion 当前许可与定价](https://www.remotion.dev/license)。

## 2026-10-22 特效更新

特效库共 118 个效果，新增 20 个“参考创意”，分为笔刷显影、相框景深、信封纸艺等不同机制。新效果只执行入场并稳定展示至 5 秒。现有低可见度入场按实际检测结果提前，预览、导出和旧任务重试共用修复。

运行 `npx tsx scripts/render-effects-audit.ts` 可检查全部效果在横竖版、不同强度和入场时长下的首帧，并生成 20 条新效果的真实视频及抽帧报告；输出位于 `.data/effect-audit-1022`。

桌面版 v1.1.0 顶部提供“检查更新”。首次使用时在“GitHub 更新源”填写发布仓库地址，即可读取最新正式 Release 并下载新版 ZIP。发布和打包约定见 [GitHub 更新说明](packaging/GITHUB-UPDATES.md)。
