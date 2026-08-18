@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo   Pushing portfolio changes to GitHub
echo ============================================
echo.

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo ERROR: This folder is not a git repository.
  echo Make sure push.bat sits in the same folder as your .git folder.
  echo.
  pause
  exit /b 1
)

git add -A

git diff --cached --quiet
if not errorlevel 1 (
  echo No changes to commit - everything is already up to date.
  echo.
  pause
  exit /b 0
)

for /f "tokens=* usebackq" %%d in (`powershell -NoProfile -Command "Get-Date -Format 'yyyy-MM-dd HH:mm'"`) do set STAMP=%%d
set MSG=Update: %STAMP%

echo Committing as: "%MSG%"
git commit -m "%MSG%"
if errorlevel 1 (
  echo.
  echo ERROR: commit failed. See message above.
  pause
  exit /b 1
)

echo.
echo Pushing to remote...
git push
if errorlevel 1 (
  echo.
  echo ERROR: push failed. Check your internet connection or GitHub login.
  pause
  exit /b 1
)

echo.
echo ============================================
echo   Done. Changes pushed successfully.
echo ============================================
echo.
pause
