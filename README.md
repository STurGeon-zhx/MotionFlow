# MotionFlow 图片入场动效工坊

一个本地运行的图片批量视频工具。上传 JPG、PNG 或 WebP 图片后，可以为每张图片生成多条带不同入场特效的 5 秒 MP4 视频。

## 已实现

- 单张或批量上传，工作区最多 100 张、单图 20MB；缩略图区域同时显示 10 张并可拖动滚动条查看其余图片
- 每张图片固定生成 1 条视频，输出比例自动跟随该图片
- 支持 720p 和 1080p，分别按原图方向控制长边清晰度
- 7 个基础入场动画和 75 个“入场＋出场”联动组合动画，其中 47 个采用独立的创意视觉机制
- 全随机、基础、组合、分类和指定特效五种分配模式
- SQLite 持久任务、独立顺序渲染 Worker、重启恢复
- 实时进度、视频在线播放、单条下载、ZIP 打包下载
- 历史任务按局域网客户端 IP 隔离，并支持失败项重试

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

新建任务会记录客户端 IP。历史列表、详情、重试和下载只允许同一 IP 访问；升级前已经存在且无法确认创建 IP 的任务不会显示给局域网用户。

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

运行数据默认存放在 `.data`，包括 SQLite 数据库、上传图片、视频成品和 Remotion 运行组件。可以通过 `MOTION_DATA_DIR` 环境变量修改位置。

## 检查与测试

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run render:smoke
```

`render:smoke` 会用 16:9 横版图片真实生成一条 1280×720、5 秒、H.264 视频，并检查尺寸、编码与时长。

## 使用边界

首版按个人或三人以内小团队的本地内部工具设计，不包含登录、云端部署、AI 视频生成、音频、字幕或自定义时间轴。Remotion 的许可条款可能更新；公司规模扩大、自动化商用或对外发布前，请核对 [Remotion 当前许可与定价](https://www.remotion.dev/license)。
