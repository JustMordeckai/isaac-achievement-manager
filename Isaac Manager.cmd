@echo off
rem The only launcher of Isaac Achievement Manager. It installs what is missing (Node.js, the
rem dependencies, the interface build), then starts the server and opens the browser. Everything it
rem prints is also appended to data\server.log.
setlocal
cd /d "%~dp0"
if not exist "data" mkdir "data"

call :ensure_node || goto :stop
call :ensure_modules || goto :stop
call :ensure_build || goto :stop

node server\index.ts --open --log
goto :eof

rem ---------------------------------------------------------------------------

rem Node.js 26 or newer, installed with winget when it is missing.
:ensure_node
call :node_ok && exit /b 0
echo This application needs Node.js 26 or newer.
where winget >nul 2>nul || (
  echo Install Node.js from https://nodejs.org/ then start this file again.
  exit /b 1
)
echo Installing Node.js with winget. Windows may ask you to allow it.
winget install --exact --id OpenJS.NodeJS --accept-package-agreements --accept-source-agreements --silent
rem winget only sets the PATH of the processes started after it: point this window at the install.
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
call :node_ok && exit /b 0
echo Node.js is not visible yet. Close this window, open a new one and start this file again.
exit /b 1

:node_ok
where node >nul 2>nul || exit /b 1
for /f "tokens=1 delims=." %%v in ('node --version') do set "MAJOR=%%v"
set "MAJOR=%MAJOR:v=%"
if "%MAJOR%"=="" exit /b 1
if %MAJOR% GEQ 26 exit /b 0
echo Node.js %MAJOR% is too old.
exit /b 1

rem The dependencies, installed again when package-lock.json moved since the last install.
:ensure_modules
call :modules_ok && exit /b 0
echo Installing the dependencies. This takes a minute.
call npm install || (
  echo The install failed. Run npm install in this folder to see why.
  exit /b 1
)
exit /b 0

:modules_ok
node -e "const fs=require('fs');const stamp='node_modules/.package-lock.json';process.exit(fs.existsSync(stamp)&&fs.statSync(stamp).mtimeMs>=fs.statSync('package-lock.json').mtimeMs?0:1)" 2>nul
exit /b %errorlevel%

rem The interface, built again when a source file moved since the last build.
:ensure_build
call :build_ok && exit /b 0
echo Building the interface.
call npm run build || (
  echo The build failed. Run npm run build in this folder to see why.
  exit /b 1
)
exit /b 0

:build_ok
node -e "const fs=require('fs'),p=require('path');const newest=d=>fs.readdirSync(d,{withFileTypes:true}).reduce((t,e)=>Math.max(t,e.isDirectory()?newest(p.join(d,e.name)):fs.statSync(p.join(d,e.name)).mtimeMs),0);const out='web/dist/index.html';process.exit(fs.existsSync(out)&&fs.statSync(out).mtimeMs>=Math.max(newest('web/src'),newest('shared'))?0:1)" 2>nul
exit /b %errorlevel%

:stop
echo.
pause
exit /b 1
