@echo off
title FluxionJS V3 — Editor Launcher
cd /d "%~dp0"

echo [1/3] Installing npm dependencies...
call npm install
if errorlevel 1 ( echo ERROR: npm install failed & pause & exit /b 1 )

echo.
echo [2/3] Building WASM core (fluxion-core)...
call npm run build:wasm
if errorlevel 1 ( echo ERROR: WASM build failed & pause & exit /b 1 )

echo.
echo [3/3] Starting Tauri editor (webpack watch + hot reload)...
call npm run tauri:dev
