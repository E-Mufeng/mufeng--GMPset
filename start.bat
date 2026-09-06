@echo off
cd /d "%~dp0"
set PORT=8768
set "NODE_EXE=node"
if not exist "%NODE_EXE%" set "NODE_EXE=node"
echo [JCT] checking port %PORT% ...
netstat -ano | findstr /R ":%PORT% " >nul 2>&1
if %errorlevel%==0 (
  echo [JCT] server already running, opening browser ...
) else (
  echo [JCT] starting server ...
  if not exist "data\logs" mkdir "data\logs"
  start "" "%NODE_EXE%" server.js
  timeout /t 2 >nul
)
start "" http://127.0.0.1:%PORT%/
echo [JCT] done
