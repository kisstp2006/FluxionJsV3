@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul 2>&1

:: ============================================================
:: FluxionJS V3 — Setup & Build
:: Futtatás: setup-and-build.bat
::
:: Mit csinál:
::   1. Ellenőrzi / telepíti: Node.js, Rust, wasm-pack
::   2. npm install  (ha node_modules hiányzik)
::   3. npm run build:wasm  (Rust → WebAssembly pkg)
::   4. npm run build       (webpack → JS bundle-ök)
:: ============================================================

set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"
set "ERRORS=0"

echo.
echo  ================================================
echo   FluxionJS V3  ^|  Setup ^& Build
echo  ================================================
echo.

:: ── 1. Node.js ──────────────────────────────────────────────
echo [1/5] Ellenorzes: Node.js...
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo  [HIBA] Node.js nem talalhato!
    echo         Toltsd le: https://nodejs.org/  ^(LTS^)
    echo         Majd futtasd ujra ezt a scriptet.
    set "ERRORS=1"
) else (
    for /f "tokens=*" %%v in ('node --version 2^>^&1') do echo  [OK] Node.js %%v
)

:: ── 2. npm ──────────────────────────────────────────────────
echo [2/5] Ellenorzes: npm...
where npm >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo  [HIBA] npm nem talalhato! ^(Node.js-sel együtt kellene telepulnie^)
    set "ERRORS=1"
) else (
    for /f "tokens=*" %%v in ('npm --version 2^>^&1') do echo  [OK] npm %%v
)

:: ── 3. Rust / cargo ─────────────────────────────────────────
echo [3/5] Ellenorzes: Rust / cargo...
where cargo >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo  [HIBA] Rust nem talalhato!
    echo         Toltsd le: https://rustup.rs/
    echo         Majd futtasd ujra ezt a scriptet.
    set "ERRORS=1"
) else (
    for /f "tokens=*" %%v in ('cargo --version 2^>^&1') do echo  [OK] %%v
)

:: ── Korai kilepes ha hianyoznak az alapok ──────────────────
if "!ERRORS!"=="1" (
    echo.
    echo  [STOP] Telepitsd a hianyzó eszközöket, majd futtasd ujra.
    pause
    exit /b 1
)

:: ── 4. wasm-pack ────────────────────────────────────────────
echo [4/5] Ellenorzes: wasm-pack...
where wasm-pack >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo  [INFO] wasm-pack nem talalhato — telepites folyamatban...
    cargo install wasm-pack
    if %ERRORLEVEL% NEQ 0 (
        echo  [HIBA] wasm-pack telepitese sikertelen!
        pause
        exit /b 1
    )
    echo  [OK] wasm-pack telepitve.
) else (
    for /f "tokens=*" %%v in ('wasm-pack --version 2^>^&1') do echo  [OK] %%v
)

:: ── 5. wasm32 target ────────────────────────────────────────
echo [5/5] Ellenorzes: wasm32-unknown-unknown target...
rustup target list --installed 2>nul | findstr "wasm32-unknown-unknown" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo  [INFO] wasm32 target hozzaadasa...
    rustup target add wasm32-unknown-unknown
    if %ERRORLEVEL% NEQ 0 (
        echo  [HIBA] wasm32 target hozzaadasa sikertelen!
        pause
        exit /b 1
    )
)
echo  [OK] wasm32-unknown-unknown elerheto.

echo.
echo  ================================================
echo   Build 1/3 — npm install
echo  ================================================
if not exist "%ROOT%\node_modules" (
    echo  [INFO] node_modules hianyzik — npm install futtatasa...
    call npm install --prefix "%ROOT%"
    if %ERRORLEVEL% NEQ 0 (
        echo  [HIBA] npm install sikertelen!
        pause
        exit /b 1
    )
    echo  [OK] npm install kesz.
) else (
    echo  [OK] node_modules mar letezik — kihagyva.
)

echo.
echo  ================================================
echo   Build 2/3 — Rust/Wasm  ^(npm run build:wasm^)
echo  ================================================
call npm run build:wasm --prefix "%ROOT%"
if %ERRORLEVEL% NEQ 0 (
    echo  [HIBA] Wasm build sikertelen!
    pause
    exit /b 1
)
echo  [OK] fluxion-core/pkg/ elkeszult.

echo.
echo  ================================================
echo   Build 3/3 — Webpack  ^(npm run build^)
echo  ================================================
call npm run build --prefix "%ROOT%"
if %ERRORLEVEL% NEQ 0 (
    echo  [HIBA] Webpack build sikertelen!
    pause
    exit /b 1
)
echo  [OK] JS bundle-ok elkeszultek.

echo.
echo  ================================================
echo   Minden kesz!
echo   Inditas: npm run tauri:dev
echo  ================================================
echo.
pause
endlocal
