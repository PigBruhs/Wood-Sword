@echo off
setlocal
title Wood-Sword One-Click Start
cd /d "%~dp0"

set "NODE_EXE="
set "PORTABLE_NODE=%~dp0runtime\node\node.exe"

echo [1/3] Checking Node runtime...
if exist "%PORTABLE_NODE%" (
  set "NODE_EXE=%PORTABLE_NODE%"
  echo Using bundled runtime: runtime\node\node.exe
) else (
  for /f "delims=" %%I in ('where node 2^>nul') do (
    set "NODE_EXE=%%I"
    goto :node_found
  )
)

:node_found
if "%NODE_EXE%"=="" (
  echo Node runtime not found.
  echo Either:
  echo 1^) use the portable package that contains runtime\node, or
  echo 2^) install Node.js LTS from https://nodejs.org
  pause
  exit /b 1
)

echo [2/3] Checking built files...
if not exist "%~dp0dist\index.html" (
  echo dist\index.html is missing.
  echo This launcher expects a built game in the dist folder.
  echo If you are a developer, run: npm run build
  pause
  exit /b 1
)

if not exist "%~dp0scripts\serve-dist.mjs" (
  echo scripts\serve-dist.mjs is missing.
  pause
  exit /b 1
)

echo [3/3] Starting game server...
echo A browser tab should open automatically.
"%NODE_EXE%" "%~dp0scripts\serve-dist.mjs" --root "%~dp0dist" --port 4173

if errorlevel 1 (
  echo Game exited with an error.
  pause
)

endlocal
