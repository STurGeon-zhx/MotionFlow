# GitHub 软件内代码更新

正式安装与发布流程见 [安装版说明](../INSTALLATION.md)。默认公开仓库为 `STurGeon-zhx/MotionFlow`。

## 正式资源

每个正式 Release 提供：

- `MotionFlow-Setup-版本号-Windows-x64.exe`：首次安装或运行环境升级使用。
- `MotionFlow-Code-Update.json`：Ed25519 签名清单，包含版本、运行环境标识、文件路径、大小、偏移和 SHA256。
- `MotionFlow-Code-v版本号.bin`：仅包含应用代码与页面资源，单次下载后逐文件验证；不包含 Electron、Node、Chromium、音乐库或用户数据。
- `SHA256SUMS.txt`：上述文件的 SHA256 校验和。

客户端先验证清单签名，再下载代码资源并检查总体和逐文件哈希，拒绝目录穿越、越界偏移、重复路径、损坏文件及不兼容环境。新代码写入独立版本目录；应用更新前备份数据库、暂停任务并重启本地服务，健康检查失败时回退。

更新公钥为 `packaging/update-public-key.pem`。本机私钥经 Windows DPAPI CurrentUser 加密保存在 `.data/release-signing`，不能上传到仓库或 Release。

旧 v1.1.x ZIP 版本没有内置这一正式公钥，需要先安装新版程序一次。安装版默认从 GitHub 检查，无需用户填写地址或登录 GitHub。仓库访问或网络失败会显示原因，不会执行远端分支源码。
