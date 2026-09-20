@echo off
rem Starts Isaac Achievement Manager: installs and builds what is missing, then opens the browser.
rem The argument "hidden" means no console is attached: the errors are then only written to the log.
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js 26 or newer from https://nodejs.org/ then start this file again.
  goto :stop
)

if not exist "node_modules" (
  echo Installing the dependencies. This takes a minute.
  call npm install || (
    echo The install failed. Run "npm install" in this folder to see why.
    goto :stop
  )
)

call :needs_build
if errorlevel 1 (
  echo Building the interface.
  call npm run build || (
    echo The build failed. Run "npm run build" in this folder to see why.
    goto :stop
  )
)

if not exist "data" mkdir "data"
node server\index.ts --open
goto :eof

rem Fails when web\dist is missing or older than the newest file under web\src.
:needs_build
node -e "const fs=require('fs'),p=require('path');const newest=d=>fs.readdirSync(d,{withFileTypes:true}).reduce((t,e)=>Math.max(t,e.isDirectory()?newest(p.join(d,e.name)):fs.statSync(p.join(d,e.name)).mtimeMs),0);const out='web/dist/index.html';const fresh=fs.existsSync(out)&&fs.statSync(out).mtimeMs>=Math.max(newest('web/src'),newest('shared'));process.exit(fresh?0:1)"
goto :eof

:stop
if not "%~1"=="hidden" pause
exit /b 1
