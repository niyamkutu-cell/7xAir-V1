@echo off
setlocal enabledelayedexpansion
title 7xAir Fast Windows Installer

echo ============================================================
echo   7xAir Windows 10/11 Fast Build ^& Installer
echo ============================================================
echo.

where node >nul 2>&1 || (
  echo [MISSING] Node.js 20+ not found.
  echo Install quickly via: winget install OpenJS.NodeJS.LTS
  pause
  exit /b 1
)

where cargo >nul 2>&1 || (
  echo [MISSING] Rust / Cargo not found.
  echo Install quickly via: winget install Rustlang.Rustup
  pause
  exit /b 1
)

echo [OK] Prerequisites found. Building 7xAir Windows EXE installer...
echo.
powershell -ExecutionPolicy Bypass -File "%~dp0scripts\build-release.ps1"
if errorlevel 1 (
  echo.
  echo [ERROR] Build failed. Check the log above.
  pause
  exit /b 1
)

for %%F in ("%~dp0dist\*.exe") do (
  echo.
  echo [READY] Launching Windows installer: %%~nxF
  start "" "%%~fF"
  goto :done
)

echo [WARN] No .exe found in dist\ folder.
:done
pause
