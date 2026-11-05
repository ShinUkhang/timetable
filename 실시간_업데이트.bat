@echo off
chcp 65001 > nul
title Baehwa Timetable - Update and Deploy
cd /d "%~dp0"

rem ------------------------------------------------------------------
rem  1) update_duty.js : sheets/notices/library/confirmed changes -> index.html
rem  2) deploy.js      : git commit + push (Korean messages handled in Node)
rem  Keep this file ASCII-only: cmd with chcp 65001 mis-reads Korean lines.
rem ------------------------------------------------------------------

node update_duty.js
if errorlevel 1 goto fail

node deploy.js
if errorlevel 1 goto fail

set OPEN_WEB=Y
set /p OPEN_WEB="Open the website now? (Y/N, default Y): "
if /i "%OPEN_WEB%"=="Y" start https://shinukhang.github.io/timetable/
exit /b 0

:fail
echo.
echo [ERROR] Update or deploy failed. See the messages above.
pause
exit /b 1
