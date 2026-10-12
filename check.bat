@echo off
echo off
setlocal EnableExtensions
rem ASCII only, UTF-8 BOM, CRLF. Chinese is printed from base64.
rem Does not install Node or Ollama. start.bat can install Node.js LTS.
chcp 65001 >nul
cd /d "%~dp0"
title Playstage check
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Console]::Title = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('5Ymn5oiP5Y+w5qOA5p+l'))"

where node >nul 2>&1
if errorlevel 1 goto nonode

echo.
call :say "5q2j5Zyo5qOA5p+l5Ymn5oiP5Y+w44CC6L+Z5LiA5q2l5LiN5ryU5oiP77yM5Y+q56Gu6K6k56iL5bqP5paH5Lu25rKh5pyJ5Z2P44CC"
echo.
call npm run check
if errorlevel 1 goto failed

echo.
call :say "5qOA5p+l6YCa6L+H44CC5Y+v5Lul5Y+M5Ye7IHN0YXJ0LmJhdCDlvIDlp4vmvJTmiI/jgII="
echo.
pause
exit /b 0

:failed
echo.
call :say "5qOA5p+l5rKh5pyJ6YCa6L+H44CC6K+35oqK6L+Z5Liq56qX5Y+j6YeM55qE5paH5a2X55WZ5LiL5p2l77yM5YWI5LiN6KaB57un57ut5pu05paw44CC"
echo.
pause
exit /b 1

:nonode
echo.
call :say "6L+Y5rKh5pyJ5qOA5rWL5YiwIE5vZGUuanPjgILor7flj4zlh7sgc3RhcnQuYmF077yM5a6D5Y+v5Lul5a6J6KOFIE5vZGUuanPjgILkuZ/lj6/ku6XmiZPlvIAgaHR0cHM6Ly9ub2RlanMub3JnLw=="
echo https://nodejs.org/
echo.
pause
exit /b 1

:say
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Write-Host ([System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('%~1')))"
exit /b 0
