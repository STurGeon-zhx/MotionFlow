param([string]$PackageName = 'MotionFlow-Desktop-Windows-x64')

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$releaseRoot = Join-Path $projectRoot '.release'
$packageRoot = Join-Path $releaseRoot $packageName
$internalRoot = Join-Path $packageRoot '_internal'
$archivePath = Join-Path $releaseRoot "$packageName.zip"

function Assert-SafeReleasePath([string]$candidate) {
  $resolvedRelease = [System.IO.Path]::GetFullPath($releaseRoot).TrimEnd('\')
  $resolvedCandidate = [System.IO.Path]::GetFullPath($candidate)
  if (-not $resolvedCandidate.StartsWith("$resolvedRelease\", [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to operate outside release directory: $resolvedCandidate"
  }
}

function Copy-Tree([string]$source, [string]$destination, [string[]]$excludedDirectories = @()) {
  New-Item -ItemType Directory -Force -Path $destination | Out-Null
  $arguments = @($source, $destination, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/R:2', '/W:1')
  if ($excludedDirectories.Count -gt 0) { $arguments += '/XD'; $arguments += $excludedDirectories }
  & robocopy @arguments | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "Copy failed: $source (robocopy exit code $LASTEXITCODE)" }
}

function Get-Sha256([string]$filePath) {
  $algorithm = [System.Security.Cryptography.SHA256]::Create()
  $stream = [System.IO.File]::OpenRead($filePath)
  try { return ([System.BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace('-', '') }
  finally { $stream.Dispose(); $algorithm.Dispose() }
}

Set-Location $projectRoot
Write-Host '[1/7] Building production application...'
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Next.js production build failed' }

New-Item -ItemType Directory -Force -Path $releaseRoot | Out-Null
Assert-SafeReleasePath $packageRoot
if (Test-Path -LiteralPath $packageRoot) { Remove-Item -LiteralPath $packageRoot -Recurse -Force }
if (Test-Path -LiteralPath $archivePath) { Remove-Item -LiteralPath $archivePath -Force }
New-Item -ItemType Directory -Force -Path $internalRoot | Out-Null

Write-Host '[2/7] Copying internal application files...'
Copy-Tree (Join-Path $projectRoot '.next') (Join-Path $internalRoot '.next') @('cache', 'dev')
$electronModule = Join-Path $projectRoot 'node_modules\electron'
Copy-Tree (Join-Path $projectRoot 'node_modules') (Join-Path $internalRoot 'node_modules') @((Join-Path $projectRoot 'node_modules\.cache'), $electronModule)
Copy-Tree (Join-Path $projectRoot 'src') (Join-Path $internalRoot 'src')
Copy-Tree (Join-Path $projectRoot 'assets') (Join-Path $internalRoot 'assets')
if (Test-Path (Join-Path $projectRoot 'public')) { Copy-Tree (Join-Path $projectRoot 'public') (Join-Path $internalRoot 'public') }
$files = @('server.ts', 'next.config.ts', 'next-env.d.ts', 'tsconfig.json', 'package.json')
foreach ($file in $files) { Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination (Join-Path $internalRoot $file) }

Write-Host '[3/7] Bundling Node.js runtime...'
$nodeCommand = Get-Command node.exe -ErrorAction Stop
$runtimeDir = Join-Path $internalRoot 'runtime'
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
Copy-Item -LiteralPath $nodeCommand.Source -Destination (Join-Path $runtimeDir 'node.exe')
New-Item -ItemType Directory -Force -Path (Join-Path $packageRoot 'data') | Out-Null

Write-Host '[4/7] Bundling independent desktop runtime...'
$projectPackage = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
$projectVersion = $projectPackage.version
$updateRepository = $env:MOTION_UPDATE_REPOSITORY
if (-not $updateRepository) {
  $configuredSource = Get-Content -LiteralPath (Join-Path $projectRoot 'packaging\update-config.json') -Raw | ConvertFrom-Json
  $updateRepository = $configuredSource.repository
}
if (-not $updateRepository) {
  $remoteUrl = & git config --get remote.origin.url
  if ($LASTEXITCODE -eq 0 -and $remoteUrl -match 'github\.com[:/]([^/]+/[^/]+?)(?:\.git)?$') { $updateRepository = $Matches[1] }
}
$electronDist = Join-Path $electronModule 'dist'
if (-not (Test-Path -LiteralPath (Join-Path $electronDist 'electron.exe'))) { throw 'Electron desktop runtime was not found' }
Copy-Tree $electronDist $packageRoot
Move-Item -LiteralPath (Join-Path $packageRoot 'electron.exe') -Destination (Join-Path $packageRoot 'MotionFlow.exe') -Force
$desktopAppRoot = Join-Path $packageRoot 'resources\app'
New-Item -ItemType Directory -Force -Path $desktopAppRoot | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot 'packaging\electron-main.cjs') -Destination (Join-Path $desktopAppRoot 'main.cjs')
Copy-Item -LiteralPath (Join-Path $projectRoot 'packaging\electron-preload.cjs') -Destination (Join-Path $desktopAppRoot 'preload.cjs')
Copy-Item -LiteralPath (Join-Path $projectRoot 'packaging\github-updates.cjs') -Destination (Join-Path $desktopAppRoot 'github-updates.cjs')
$updateConfig = @{repository = [string]$updateRepository} | ConvertTo-Json
[System.IO.File]::WriteAllText((Join-Path $desktopAppRoot 'update-config.json'), $updateConfig, [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText(
  (Join-Path $desktopAppRoot 'package.json'),
  "{`r`n  `"name`": `"motionflow-desktop`",`r`n  `"version`": `"$projectVersion`",`r`n  `"main`": `"main.cjs`"`r`n}`r`n",
  [System.Text.UTF8Encoding]::new($false)
)
Copy-Item -LiteralPath (Join-Path $projectRoot 'packaging\desktop-README.txt') -Destination (Join-Path $packageRoot 'README.txt')

Write-Host '[5/7] Verifying desktop package...'
$required = @(
  'MotionFlow.exe', 'README.txt', 'resources\app\main.cjs', 'resources\app\preload.cjs', 'resources\app\github-updates.cjs', 'resources\app\update-config.json',
  'chrome_100_percent.pak', 'icudtl.dat', '_internal\runtime\node.exe',
  '_internal\.next\BUILD_ID', '_internal\node_modules\tsx\dist\cli.mjs',
  '_internal\node_modules\.remotion', '_internal\src\worker.ts', '_internal\assets\music'
)
foreach ($relativePath in $required) {
  if (-not (Test-Path -LiteralPath (Join-Path $packageRoot $relativePath))) { throw "Missing package file: $relativePath" }
}
$exeHash = Get-Sha256 (Join-Path $packageRoot 'MotionFlow.exe')
[System.IO.File]::WriteAllText((Join-Path $packageRoot 'SHA256.txt'), "MotionFlow.exe  $exeHash`r`n", [System.Text.Encoding]::ASCII)

Write-Host '[6/7] Creating ZIP archive. This may take several minutes...'
& tar.exe -a -c -f $archivePath -C $releaseRoot $packageName
if ($LASTEXITCODE -ne 0) { throw 'Failed to create release archive' }

Write-Host '[7/7] Complete'
$archive = Get-Item -LiteralPath $archivePath
$archiveHash = Get-Sha256 $archivePath
Write-Host "Package: $($archive.FullName)"
Write-Host ("Size: {0:N1} MB" -f ($archive.Length / 1MB))
Write-Host "SHA256: $archiveHash"
