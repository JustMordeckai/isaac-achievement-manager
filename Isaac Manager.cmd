@echo off
rem Starts Isaac Achievement Manager: installs and builds what is missing, then opens the browser.
rem The argument "hidden" says that Isaac Manager.vbs started it without a console: the messages and
rem the server output then go to data\server.log, which the server appends to line by line.
setlocal
cd /d "%~dp0"
if not exist "data" mkdir "data"

set "LOG=%CD%\data\server.log"
set "SERVER_FLAGS=--open"
set "HIDDEN="
if "%~1"=="hidden" (
  set "SERVER_FLAGS=--open --log"
  set "HIDDEN=1"
)

where node >nul 2>nul
if errorlevel 1 (
  call :say "Node.js was not found. Install Node.js 26 or newer from https://nodejs.org/ then start this file again."
  goto :stop
)

if not exist "node_modules" (
  call :say "Installing the dependencies. This takes a minute."
  call :run npm install || (
    call :say "The install failed. Run npm install in this folder to see why."
    goto :stop
  )
)

call :needs_build
if errorlevel 1 (
  call :say "Building the interface."
  call :run npm run build || (
    call :say "The build failed. Run npm run build in this folder to see why."
    goto :stop
  )
)

node server\index.ts %SERVER_FLAGS%
goto :eof

rem Runs a command, with its output appended to the log when no console is attached.
:run
if defined HIDDEN (
  call %* >>"%LOG%" 2>&1
) else (
  call %*
)
exit /b %errorlevel%

rem Says a line to whoever can read it: the console, or the log when there is none.
:say
echo %~1
if defined HIDDEN >>"%LOG%" echo %~1
exit /b 0

rem Fails when web\dist is missing or older than the newest file under web\src or shared.
:needs_build
node -e "const fs=require('fs'),p=require('path');const newest=d=>fs.readdirSync(d,{withFileTypes:true}).reduce((t,e)=>Math.max(t,e.isDirectory()?newest(p.join(d,e.name)):fs.statSync(p.join(d,e.name)).mtimeMs),0);const out='web/dist/index.html';const fresh=fs.existsSync(out)&&fs.statSync(out).mtimeMs>=Math.max(newest('web/src'),newest('shared'));process.exit(fresh?0:1)"
goto :eof

:stop
if not defined HIDDEN pause
exit /b 1
