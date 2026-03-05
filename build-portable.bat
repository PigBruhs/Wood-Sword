@echo off
setlocal
title Wood-Sword Portable Pack Builder
cd /d "%~dp0"

set "OUT_DIR=%~dp0release\Wood-Sword"
set "ZIP_PATH=%~dp0release\Wood-Sword-portable.zip"
set "NODE_EXE="

echo [1/6] Checking tools...
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required to build the portable package.
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo npm is required to build the portable package.
  pause
  exit /b 1
)

echo [2/6] Building dist...
call npm run build
if errorlevel 1 (
  echo Build failed.
  pause
  exit /b 1
)

echo [3/6] Preparing output folder...
if exist "%~dp0release" rmdir /s /q "%~dp0release"
mkdir "%OUT_DIR%"
mkdir "%OUT_DIR%\scripts"
mkdir "%OUT_DIR%\runtime\node"

echo [4/6] Copying game files...
xcopy "%~dp0dist" "%OUT_DIR%\dist" /E /I /Y >nul
copy /Y "%~dp0start-game.bat" "%OUT_DIR%\start-game.bat" >nul
copy /Y "%~dp0LICENSE" "%OUT_DIR%\LICENSE" >nul
copy /Y "%~dp0README.md" "%OUT_DIR%\README.md" >nul
copy /Y "%~dp0scripts\serve-dist.mjs" "%OUT_DIR%\scripts\serve-dist.mjs" >nul

echo [5/6] Bundling Node runtime...
for /f "delims=" %%I in ('where node 2^>nul') do (
  set "NODE_EXE=%%I"
  goto :node_found
)

:node_found
if "%NODE_EXE%"=="" (
  echo Could not find node.exe in PATH.
  pause
  exit /b 1
)
for %%I in ("%NODE_EXE%") do set "NODE_DIR=%%~dpI"
xcopy "%NODE_DIR%*" "%OUT_DIR%\runtime\node\" /E /I /Y >nul

echo [6/6] Creating zip archive...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Compress-Archive -Path '%OUT_DIR%\*' -DestinationPath '%ZIP_PATH%' -Force"
if errorlevel 1 (
  echo Failed to create zip archive.
  pause
  exit /b 1
)

echo.
echo Done. Portable package created:
echo %ZIP_PATH%
echo Send this zip to your friend. They only need to unzip and double-click start-game.bat

endlocal

