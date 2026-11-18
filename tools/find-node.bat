@echo off
rem Sets NODE to a usable node.exe (Node.js 22.13 or newer, needed for the built-in SQLite):
rem 1. portable runtime\node.exe  2. an installed node  3. downloads a portable one (first start only)
set "NODE="
if exist "%~dp0..\runtime\node.exe" (
  set "NODE=%~dp0..\runtime\node.exe"
  goto :eof
)
where node >nul 2>nul
if errorlevel 1 goto :download
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)" >nul 2>nul
if errorlevel 1 goto :download
set "NODE=node"
goto :eof

:download
echo Setting up a portable Node.js runtime (first start only, about 30 MB download)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0get-node.ps1"
if exist "%~dp0..\runtime\node.exe" set "NODE=%~dp0..\runtime\node.exe"
goto :eof
