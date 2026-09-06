REM ============================================================
REM  [DEBUG-ONLY] This tool is fused into the JuChuangTai main process
REM  (single port 8768). All routes are now mounted by the main server.
REM  Do NOT use this .bat for normal startup. Standalone debug / fallback only.
REM ============================================================
@echo off
cd /d %~dp0\..\..
set MOUNT_TOOL=tools
set MOUNT_PORT=8803
set MOUNT_ROUTES=tools,extra-tools
set MOUNT_PATHS=/api/tools,/api/tools
node services/_mount/mount.js
