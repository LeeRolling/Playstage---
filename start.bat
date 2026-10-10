@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 剧戏台

where node >nul 2>&1
if errorlevel 1 goto nonode

echo.
echo 剧戏台正在本机启动。
echo 若能连上 GitHub，会看看私有仓库有没有新版本。连不上或跳过，也会用现在这份打开。
echo 请用浏览器打开： http://127.0.0.1:4173
echo 如果浏览器没有自动弹出，请把上面的地址复制进去。
echo 关掉这个窗口，剧戏台就会停止。
echo.
node src\server\index.js
echo.
echo 剧戏台已停止。
pause
exit /b 0

:nonode
echo.
echo 还没有检测到 Node.js。
echo 这一步需要你自己完成：请先安装 Node.js（建议 20 或更新的版本），装好后重新双击 start.bat。
echo 下载页面： https://nodejs.org/
echo.
pause
exit /b 1
