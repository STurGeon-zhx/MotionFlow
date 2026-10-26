param([string]$UpdatePublicKey = $env:MOTION_UPDATE_PUBLIC_KEY_FILE)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
if (-not $UpdatePublicKey) { $UpdatePublicKey = Join-Path $projectRoot 'packaging\update-public-key.pem' }
if (-not (Test-Path -LiteralPath $UpdatePublicKey)) { throw '正式安装版需要先提供 Ed25519 更新公钥文件：MOTION_UPDATE_PUBLIC_KEY_FILE。请先完成本地评审。' }
@'
const key=require('node:crypto').createPublicKey(require('node:fs').readFileSync(process.argv[2]));
if(key.asymmetricKeyType!=='ed25519')process.exit(1);
'@ | node.exe - $UpdatePublicKey
if ($LASTEXITCODE -ne 0) { throw '更新公钥不是有效的 Ed25519 公钥' }
$stagingRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot '.data\installer-runtime'))
$allowedRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot '.data'))
if (-not $stagingRoot.StartsWith($allowedRoot + '\', [System.StringComparison]::OrdinalIgnoreCase)) { throw '安装构建目录越界' }
function Copy-RuntimeTree([string]$source, [string]$relative, [string[]]$exclude = @()) {
  $destination = [System.IO.Path]::GetFullPath((Join-Path $stagingRoot $relative))
  if (-not $destination.StartsWith($stagingRoot + '\', [System.StringComparison]::OrdinalIgnoreCase)) { throw '复制目标越界' }
  New-Item -ItemType Directory -Force -Path $destination | Out-Null
  $arguments = @($source, $destination, '/E', '/XJ', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/R:2', '/W:1')
  if ($exclude.Count -gt 0) { $arguments += '/XD'; $arguments += $exclude }
  & robocopy @arguments | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "复制失败：$relative" }
}
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw '生产页面构建失败' }
& node.exe --import tsx scripts/prepare-review-assets.ts
if ($LASTEXITCODE -ne 0) { throw 'Remotion 预构建失败' }
if (Test-Path -LiteralPath $stagingRoot) { Remove-Item -LiteralPath $stagingRoot -Recurse -Force }
New-Item -ItemType Directory -Force -Path $stagingRoot | Out-Null
Copy-RuntimeTree (Join-Path $projectRoot '.next') '.next' @('cache', 'dev', 'node_modules')
Copy-RuntimeTree (Join-Path $projectRoot 'node_modules') 'node_modules' @((Join-Path $projectRoot 'node_modules\electron'), (Join-Path $projectRoot 'node_modules\.cache'))
foreach ($folder in @('src','public','assets')) { Copy-RuntimeTree (Join-Path $projectRoot $folder) $folder }
Copy-RuntimeTree (Join-Path $projectRoot '.data\review\remotion-bundle') 'remotion-bundle'
foreach ($alias in Get-ChildItem -LiteralPath (Join-Path $projectRoot '.next\node_modules') -ErrorAction SilentlyContinue) { Copy-RuntimeTree $alias.FullName ('.next\node_modules\' + $alias.Name) }
foreach ($file in @('server.ts','next.config.ts','next-env.d.ts','tsconfig.json','package.json','package-lock.json')) { Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination (Join-Path $stagingRoot $file) -Force }
$runtimeDirectory = Join-Path $stagingRoot 'runtime'
New-Item -ItemType Directory -Force -Path $runtimeDirectory | Out-Null
Copy-Item -LiteralPath (Get-Command node.exe).Source -Destination (Join-Path $runtimeDirectory 'node.exe') -Force
$bundledKey = Join-Path $projectRoot 'packaging\update-public-key.pem'
if ([System.IO.Path]::GetFullPath($UpdatePublicKey) -ne [System.IO.Path]::GetFullPath($bundledKey)) { Copy-Item -LiteralPath $UpdatePublicKey -Destination $bundledKey -Force }
$shellRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot '.data\installer-shell'))
if (-not $shellRoot.StartsWith($allowedRoot + '\', [System.StringComparison]::OrdinalIgnoreCase)) { throw '桌面壳构建目录越界' }
if (Test-Path -LiteralPath $shellRoot) { Remove-Item -LiteralPath $shellRoot -Recurse -Force }
New-Item -ItemType Directory -Force -Path (Join-Path $shellRoot 'packaging') | Out-Null
foreach ($file in @('electron-main.cjs','electron-preload.cjs','github-updates.cjs','code-updates.cjs','update-config.json','update-public-key.pem')) { Copy-Item -LiteralPath (Join-Path $projectRoot "packaging\$file") -Destination (Join-Path $shellRoot 'packaging') -Force }
$projectPackage = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
$shellPackage = @{name='motionflow-desktop';version=$projectPackage.version;description='MotionFlow 图片动态视频工坊';author='STurGeon-zhx';main='packaging/electron-main.cjs'} | ConvertTo-Json
[System.IO.File]::WriteAllText((Join-Path $shellRoot 'package.json'), $shellPackage, [System.Text.UTF8Encoding]::new($false))
$env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
& npm.cmd exec --yes --package=electron-builder@26.15.3 -- electron-builder --config packaging/electron-builder.json --win nsis --publish never
if ($LASTEXITCODE -ne 0) { throw '安装程序构建失败' }
