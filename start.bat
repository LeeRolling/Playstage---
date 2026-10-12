@echo off
echo off
setlocal EnableExtensions
rem ASCII only, UTF-8 BOM, CRLF. cmd.exe splits UTF-8 Chinese and runs the fragment.
rem Chinese lines are base64, printed by PowerShell. Do not add raw non-ASCII here.
rem This script can install Node.js LTS. It does not install Ollama.
chcp 65001 >nul
cd /d "%~dp0"
title Playstage
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Console]::Title = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('5Ymn5oiP5Y+w'))"

:launch
cd /d "%~dp0"
call :refresh_path
where node >nul 2>&1
if errorlevel 1 goto nonode

echo.
call :say "5Ymn5oiP5Y+w5q2j5Zyo5pys5py65ZCv5Yqo44CC"
call :say "6Iul6IO96L+e5LiKIEdpdEh1Yu+8jOS8mueci+eci+acieayoeacieaWsOeJiOacrOOAgui/nuS4jeS4iuaIlui3s+i/h++8jOS5n+S8mueUqOeOsOWcqOi/meS7veaJk+W8gOOAgg=="
call :say "6K+355So5rWP6KeI5Zmo5omT5byAIGh0dHA6Ly8xMjcuMC4wLjE6NDE3Mw=="
call :say "5aaC5p6c5rWP6KeI5Zmo5rKh5pyJ6Ieq5Yqo5by55Ye677yM6K+35oqK5LiK6Z2i55qE5Zyw5Z2A5aSN5Yi26L+b5Y6744CC"
call :say "5YWz5o6J6L+Z5Liq56qX5Y+j77yM5Ymn5oiP5Y+w5bCx5Lya5YGc5q2i44CC"
echo.
node src\server\index.js
echo.
call :say "5Ymn5oiP5Y+w5bey5YGc5q2i44CC"
echo.
pause
exit /b 0

:nonode
echo.
call :say "6L+Y5rKh5pyJ5qOA5rWL5YiwIE5vZGUuanPjgII="
call :say "6KaB546w5Zyo5a6J6KOFIE5vZGUuanMgTFRTIOWQl++8n+ebtOaOpeWbnui9puaIlui+k+WFpSBZIOW8gOWni+Wuieijhe+8jOi+k+WFpSBOIOWImeS4jeWuieijheOAgg=="
echo.
set "ANSWER="
set /p "ANSWER=Y/N: "
if not defined ANSWER goto install
if /i "%ANSWER%"=="Y" goto install
if /i "%ANSWER%"=="YES" goto install
goto declined

:install
set "INSTALL_OK=0"
echo.
call :say "5q2j5Zyo5a6J6KOFIE5vZGUuanMgTFRT44CC5aaC5p6c5Ye6546w5p2D6ZmQ56qX5Y+j77yM6K+354K55YWB6K6444CC"
where winget >nul 2>&1
if errorlevel 1 goto msi
call :say "5q2j5Zyo55SoIHdpbmdldCDlronoo4XjgII="
call winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements --disable-interactivity
if "%ERRORLEVEL%"=="0" set "INSTALL_OK=1"
call :refresh_path
where node >nul 2>&1
if not errorlevel 1 goto launch
if "%INSTALL_OK%"=="1" goto need_new_window

:msi
call :say "5pS55Li65LuOIG5vZGVqcy5vcmcg5LiL6L29IE5vZGUuanMgTFRTIOWuieijheWMheOAgg=="
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-node-lts.ps1"
if "%ERRORLEVEL%"=="0" set "INSTALL_OK=1"
call :refresh_path
where node >nul 2>&1
if not errorlevel 1 goto launch
if "%INSTALL_OK%"=="1" goto need_new_window
goto install_fail

:need_new_window
echo.
call :say "Tm9kZS5qcyDlj6/og73lt7Lnu4/oo4XkuIrvvIzkvYbov5nkuKrnqpflj6Pov5jmib7kuI3liLDlroPjgILor7flhbPmjonnqpflj6PvvIzph43mlrDlj4zlh7sgc3RhcnQuYmF044CC6Iul5LuN54S25LiN6KGM77yM6K+36YeN5ZCv55S16ISR5ZCO5YaN6K+V44CC"
echo https://nodejs.org/
echo.
pause
exit /b 1

:install_fail
echo.
call :say "5a6J6KOF5rKh5pyJ5a6M5oiQ44CC6K+35omT5byAIGh0dHBzOi8vbm9kZWpzLm9yZy8g6Ieq6KGM5a6J6KOF77yM54S25ZCO5YaN5Y+M5Ye7IHN0YXJ0LmJhdOOAgg=="
echo https://nodejs.org/
echo.
pause
exit /b 1

:declined
echo.
call :say "5bey6Lez6L+H5a6J6KOF44CC6K+35omT5byAIGh0dHBzOi8vbm9kZWpzLm9yZy8g5a6J6KOFIE5vZGUuanPvvIznhLblkI7lho3lj4zlh7sgc3RhcnQuYmF044CC"
echo https://nodejs.org/
echo.
pause
exit /b 1

:refresh_path
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "PATH=%ProgramFiles(x86)%\nodejs;%PATH%"
if exist "%LocalAppData%\Programs\nodejs\node.exe" set "PATH=%LocalAppData%\Programs\nodejs;%PATH%"
set "SYS_PATH="
set "USER_PATH="
for /f "tokens=1,2*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do if /i "%%A"=="Path" set "SYS_PATH=%%C"
for /f "tokens=1,2*" %%A in ('reg query "HKCU\Environment" /v Path 2^>nul') do if /i "%%A"=="Path" set "USER_PATH=%%C"
if defined SYS_PATH call set "SYS_PATH=%SYS_PATH%"
if defined USER_PATH call set "USER_PATH=%USER_PATH%"
if defined SYS_PATH set "PATH=%SYS_PATH%;%USER_PATH%;%PATH%"
exit /b 0

:say
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Write-Host ([System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('%~1')))"
exit /b 0
