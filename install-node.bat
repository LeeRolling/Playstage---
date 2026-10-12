@echo off
echo off
setlocal EnableExtensions
rem ASCII, UTF-8 BOM, CRLF. Companion to the README WinGet steps.
rem If Node.js is already version 20 or newer, skip. Otherwise run the
rem interactive WinGet command.
rem Does not install Ollama. Does not download an MSI.
chcp 65001 >nul
cd /d "%~dp0"
title Playstage

set "MAJOR="
where node >nul 2>&1
if errorlevel 1 goto need
node -v >nul 2>&1
if errorlevel 1 goto need
for /f "tokens=1 delims=." %%M in ('node -v 2^>nul') do set "MAJOR=%%M"
if not defined MAJOR goto need
set "MAJOR=%MAJOR:v=%"
set "MAJOR=%MAJOR:V=%"
if %MAJOR% GEQ 20 goto enough

:need
echo.
where winget >nul 2>&1
if errorlevel 1 goto nowinget
call :say "5bCG55SoIHdpbmdldCDlronoo4UgTm9kZS5qcyBMVFPjgILor7fmjInlronoo4Xnqpflj6Pph4znmoTmj5DnpLrnu6fnu63jgII="
echo.
call winget install --id OpenJS.NodeJS.LTS --exact --source winget --interactive
echo.
call :say "5a6J6KOF5q2l6aqk5bey57uT5p2f44CC6K+35YWz5o6J6L+Z5Liq56qX5Y+j77yM5YaN5byA5LiA5Liq5paw55qE5ZG95Luk56qX5Y+j77yM6L6T5YWlIG5vZGUgLXYg56Gu6K6k44CC"
echo https://nodejs.org/
echo.
pause
exit /b 0

:enough
echo.
call :say "5bey57uP5qOA5rWL5YiwIE5vZGUuanPvvIzniYjmnKzlpJ/nlKjvvIzkuI3nlKjlho3lronoo4XjgILlj6/ku6Xnm7TmjqXlj4zlh7sgc3RhcnQuYmF044CC"
echo.
pause
exit /b 0

:nowinget
echo.
call :say "5rKh5pyJ5om+5YiwIHdpbmdldOOAguivt+aJk+W8gCBodHRwczovL25vZGVqcy5vcmcvIOWuieijhSAyMCDmiJbmm7TmlrDnmoTniYjmnKzjgII="
echo https://nodejs.org/
echo.
pause
exit /b 1

:say
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Write-Host ([System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('%~1')))"
exit /b 0
