@echo off
chcp 65001 >nul
cd /d "%~dp0"
"runtime\node.exe" "portable-launcher.mjs"
if errorlevel 1 pause
