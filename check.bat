@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 剧戏台检查

where node >nul 2>&1
if errorlevel 1 goto nonode

echo.
echo 正在检查剧戏台。这一步不演戏，只确认程序文件没有坏。
echo.
call npm run check
if errorlevel 1 goto failed

echo.
echo 检查通过。可以双击 start.bat 开始演戏。
echo.
pause
exit /b 0

:failed
echo.
echo 检查没有通过。请把这个窗口里的文字留下来，先不要继续更新。
echo.
pause
exit /b 1

:nonode
echo.
echo 还没有检测到 Node.js。
echo 请先安装 Node.js（建议 20 或更新的版本），装好后重新双击 check.bat。
echo 下载页面： https://nodejs.org/
echo.
pause
exit /b 1
