$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$releaseRoot = Join-Path $projectRoot '.release'
$packageName = 'MotionFlow-Windows-x64'
$packageRoot = Join-Path $releaseRoot $packageName
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

Set-Location $projectRoot
Write-Host '[1/6] Building production application...'
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Next.js production build failed' }

New-Item -ItemType Directory -Force -Path $releaseRoot | Out-Null
Assert-SafeReleasePath $packageRoot
if (Test-Path -LiteralPath $packageRoot) { Remove-Item -LiteralPath $packageRoot -Recurse -Force }
if (Test-Path -LiteralPath $archivePath) { Remove-Item -LiteralPath $archivePath -Force }
New-Item -ItemType Directory -Force -Path $packageRoot | Out-Null

Write-Host '[2/6] Copying application files...'
Copy-Tree (Join-Path $projectRoot '.next') (Join-Path $packageRoot '.next') @('cache', 'dev')
Copy-Tree (Join-Path $projectRoot 'node_modules') (Join-Path $packageRoot 'node_modules') @('.cache')
Copy-Tree (Join-Path $projectRoot 'src') (Join-Path $packageRoot 'src')
Copy-Tree (Join-Path $projectRoot 'assets') (Join-Path $packageRoot 'assets')
if (Test-Path (Join-Path $projectRoot 'public')) { Copy-Tree (Join-Path $projectRoot 'public') (Join-Path $packageRoot 'public') }

$files = @('server.ts', 'next.config.ts', 'next-env.d.ts', 'tsconfig.json', 'package.json')
foreach ($file in $files) { Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination (Join-Path $packageRoot $file) }
Copy-Item -LiteralPath (Join-Path $projectRoot 'packaging\portable-launcher.mjs') -Destination (Join-Path $packageRoot 'portable-launcher.mjs')
Get-ChildItem -LiteralPath (Join-Path $projectRoot 'packaging') -Filter '*.cmd' | Copy-Item -Destination $packageRoot
Copy-Item -LiteralPath (Join-Path $projectRoot 'packaging\README.txt') -Destination (Join-Path $packageRoot 'README.txt')

Write-Host '[3/6] Bundling Node.js runtime...'
$nodeCommand = Get-Command node.exe -ErrorAction Stop
$runtimeDir = Join-Path $packageRoot 'runtime'
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
Copy-Item -LiteralPath $nodeCommand.Source -Destination (Join-Path $runtimeDir 'node.exe')
New-Item -ItemType Directory -Force -Path (Join-Path $packageRoot 'data') | Out-Null

Write-Host '[4/6] Verifying package files...'
$required = @(
  'runtime\node.exe', 'portable-launcher.mjs', 'Start-MotionFlow.cmd',
  '.next\BUILD_ID', 'node_modules\tsx\dist\cli.mjs', 'src\worker.ts', 'assets\music'
)
foreach ($relativePath in $required) {
  if (-not (Test-Path -LiteralPath (Join-Path $packageRoot $relativePath))) { throw "Missing package file: $relativePath" }
}

Write-Host '[5/6] Creating ZIP archive. This may take several minutes...'
& tar.exe -a -c -f $archivePath -C $releaseRoot $packageName
if ($LASTEXITCODE -ne 0) { throw 'Failed to create release archive' }

Write-Host '[6/6] Complete'
$archive = Get-Item -LiteralPath $archivePath
$sha256 = [System.Security.Cryptography.SHA256]::Create()
$archiveStream = [System.IO.File]::OpenRead($archivePath)
try {
  $hash = ([System.BitConverter]::ToString($sha256.ComputeHash($archiveStream))).Replace('-', '')
} finally {
  $archiveStream.Dispose()
  $sha256.Dispose()
}
Write-Host "Package: $($archive.FullName)"
Write-Host ("Size: {0:N1} MB" -f ($archive.Length / 1MB))
Write-Host "SHA256: $hash"
