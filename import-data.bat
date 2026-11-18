@echo off
setlocal
title D^&D Builder - Import
cd /d "%~dp0"

call tools\find-node.bat
if not defined NODE (
  echo Could not set up Node.js. Check your internet connection and try again.
  pause
  exit /b 1
)

echo Importing data from dnd5e.wikidot.com.
echo The first run downloads about 2000 pages (approx. 35 minutes). Later runs use the local cache.
echo Options: --refresh (download pages again), --only=spells (one category), --offline (cache only)
echo The same can be done from the Settings page while the app is running.
echo.
"%NODE%" --disable-warning=ExperimentalWarning dist\importer.mjs %*
if errorlevel 1 (
  echo.
  echo Import failed. See the messages above.
  pause
  exit /b 1
)
echo.
echo Import finished. See data\import-report.md for details.
pause
