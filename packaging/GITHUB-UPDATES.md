# GitHub 检查更新

桌面版顶部的“检查更新”读取指定 GitHub 仓库的最新正式 Release，显示版本号、发布说明，并通过原生文件对话框保存新版 ZIP。此版本提供检查和下载；下载完成后关闭软件、解压新版，并保留原来的 data 文件夹。

## 首次设置

软件默认检查公开仓库 `STurGeon-zhx/MotionFlow` 的最新正式 Release，打开“检查更新”即可使用，无需填写地址或登录。之前保存的空地址会自动回退到该默认仓库。需要更换发布仓库时，可展开“GitHub 更新源”修改；配置保存在本机 data/desktop-updates.json。

如果希望转发的程序已经绑定仓库，可把 `packaging/update-config.json` 的 repository 设置成 `owner/motionflow`，再打包。也支持在打包时设置 `MOTION_UPDATE_REPOSITORY`，或从 origin 的 GitHub 远程地址自动识别。当前项目的 origin 已关联 `https://github.com/STurGeon-zhx/MotionFlow.git`。

默认发布仓库和 Release 已公开，检查及下载无需 GitHub 登录。

## 发布新版

1. 更新 package.json 和 package-lock.json 中的版本号，例如从 1.1.0 升为 1.1.1。
2. 运行：`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-desktop.ps1 -PackageName MotionFlow-Desktop-v1.1.1-Windows-x64`。
3. 在指定仓库创建正式 Release，Tag 使用 `v1.1.1`，填写更新说明。
4. 上传刚生成的 `MotionFlow-Desktop-v1.1.1-Windows-x64.zip`。不要只上传源码 ZIP。
5. 正式发布后，旧版客户端点击“检查更新”即可发现新版。

程序只提示高于当前版本的正式版本，不提示降级、草稿或预发布版。网络故障、限流、没有 Release 和没有 Windows 附件会分别提示。下载采用临时文件写入，完成后检查大小和 GitHub 提供的 SHA256（如果有），避免留下不完整的安装包。

实现参考：[GitHub Releases API](https://docs.github.com/en/rest/releases/releases#get-the-latest-release)。
