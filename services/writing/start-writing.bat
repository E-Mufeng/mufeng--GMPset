REM ============================================================
REM  [DEBUG-ONLY] This tool is fused into the JuChuangTai main process
REM  (single port 8768). All routes are now mounted by the main server.
REM  Do NOT use this .bat for normal startup. Standalone debug / fallback only.
REM ============================================================
@echo off
cd /d %~dp0\..\..
set MOUNT_TOOL=writing
set MOUNT_PORT=8807
set MOUNT_ROUTES=writing,writing-engine,world
set MOUNT_PATHS=/api/writing,/api/writing/engine,/api/world
node services/_mount/mount.js
