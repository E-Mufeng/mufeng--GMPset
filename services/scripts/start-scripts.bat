REM ============================================================
REM  [DEBUG-ONLY] This tool is fused into the JuChuangTai main process
REM  (single port 8768). All routes are now mounted by the main server.
REM  Do NOT use this .bat for normal startup. Standalone debug / fallback only.
REM ============================================================
@echo off
cd /d %~dp0\..\..
set MOUNT_TOOL=scripts
set MOUNT_PORT=8809
node services/_mount/mount.js
