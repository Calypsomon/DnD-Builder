@echo off
setlocal
cd /d "%~dp0"
if not exist "data\dndbuilder.db" (
  echo No database found at data\dndbuilder.db
  pause
  exit /b 1
)
call tools\find-node.bat
if not defined NODE (
  echo Could not set up Node.js.
  pause
  exit /b 1
)
"%NODE%" --disable-warning=ExperimentalWarning dist\backup.mjs
if errorlevel 1 echo Backup failed.
pause
