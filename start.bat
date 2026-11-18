@echo off
setlocal
title D^&D Builder
cd /d "%~dp0"

call tools\find-node.bat
if not defined NODE (
  echo Could not set up Node.js. Check your internet connection and try again.
  pause
  exit /b 1
)
if not exist "dist\server.mjs" (
  echo The prebuilt app is missing ^(dist folder^). Download the complete repository again.
  pause
  exit /b 1
)

for /f "usebackq delims=" %%p in (`call "%NODE%" -p "require('./config.json').port"`) do set PORT=%%p

rem open the browser shortly after the server started
if not defined DND_NO_BROWSER start "" /b cmd /c "timeout /t 3 /nobreak >nul & start http://127.0.0.1:%PORT%"

"%NODE%" --disable-warning=ExperimentalWarning dist\server.mjs
if errorlevel 1 (
  echo.
  echo Something went wrong. See the messages above.
  pause
  exit /b 1
)
