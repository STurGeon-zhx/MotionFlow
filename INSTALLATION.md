# MotionFlow Windows 安装版

## 安装与使用

从 [GitHub Releases](https://github.com/STurGeon-zhx/MotionFlow/releases/latest) 下载 `MotionFlow-Setup-版本号-Windows-x64.exe`，运行安装向导。支持 Windows 10/11 x64，按当前用户安装，可选择目录，不要求额外安装 Node.js 或浏览器。

安装后从桌面或开始菜单打开 **MotionFlow**，使用独立软件窗口，不通过外部浏览器打开。上传图片后选择参数并生成；任务进入历史列表，工作区自动准备下一批。导出时选择本机目录，直接保存 MP4，沿用上传素材名称。

当前保留 118 个特效、720p / 30fps、自动配乐和两种工具：单图 5 秒、三图 15 秒。任务可暂停、继续、删除，详情只滚动生成结果区域。

## 数据与更新

历史任务、原始素材、成片、日志和浏览器身份保存在 `%APPDATA%\MotionFlow`；安装目录和数据目录分开。卸载默认保留这些数据，不要手动清理该目录，除非确认不再需要。

顶部“检查更新”默认读取公开仓库 `STurGeon-zhx/MotionFlow`。日常更新仅下载签名代码资源、校验并重启本地服务，不重复下载安装程序、Electron、Node、浏览器和音乐库。底层运行环境不兼容时仍需安装新版程序。旧 v1.1.x ZIP 用户需要先安装一次 v1.2.0，以获得新的更新机制。

## 安全与校验

当前安装包未进行 Windows Authenticode 商业证书签名，系统可能显示“未知发布者”。请只从上述仓库的正式 Release 下载，并对照发布附件 `SHA256SUMS.txt` 核对文件哈希。

软件代码更新使用 Ed25519 签名，与 Windows 安装包的发布者证书是两套独立机制。更新公钥随安装版内置；签名私钥不打包、不上传。

## 构建与发布维护

1. 仅首次在发布电脑执行 `node scripts/prepare-release-signing.cjs`，生成并使用当前 Windows 账户加密保存签名私钥；以后必须复用原密钥，不要随意删除或换钥。
2. 修改 `package.json` 和 `package-lock.json` 的版本号。
3. 执行 `npm run typecheck`、`npm run lint`、`npm test`。
4. 执行 `npm run package:installer`，生成 `.release/installer/MotionFlow-Setup-版本号-Windows-x64.exe`。
5. 执行 `node scripts/verify-installed-desktop.cjs` 检查打包程序；也可传入实际安装后的 EXE 路径（仅限项目 `.release` 内的隔离测试安装）。测试使用独立数据，不读取真实历史。
6. 执行 `node scripts/prepare-code-release.cjs`，在 `.release/v版本号` 生成安装包、签名清单、代码资源和 SHA256 校验和，并逐文件验证签名资源。
7. 提交并推送对应源码，然后发布同版本 GitHub Release，上传上述四个文件。不要上传 `.data`、私钥或本机历史。

本机加密私钥：`.data/release-signing/update-private.dpapi`，只能由生成它的 Windows 账户解密。请按发布凭据妥善备份；更换电脑或账户前先安排安全迁移。
## 仅发布日常代码更新

如果只修改页面或业务代码、没有改变 Electron/Node/Chromium/原生依赖及桌面壳，执行版本升级和检查后运行：

```powershell
npm run build
node --import tsx scripts/prepare-review-assets.ts
node scripts/prepare-code-release.cjs --code-only
```

这会直接从当前构建生成 `.release/v版本号` 下的签名清单、代码资源和校验和，不重新制作安装包。发布同版本 GitHub Release 并上传这三个文件即可；已有兼容安装版可在软件内检查、下载并应用更新。
