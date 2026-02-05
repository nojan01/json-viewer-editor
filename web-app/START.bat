@echo off
REM JSON Viewer/Editor - Windows Starter
REM Doppelklick zum Starten

echo JSON Viewer/Editor wird gestartet...

REM Versuche verschiedene Browser
start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" "%~dp0index.html" 2>nul && exit
start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" "%~dp0index.html" 2>nul && exit
start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" "%~dp0index.html" 2>nul && exit
start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" "%~dp0index.html" 2>nul && exit

REM Fallback: Standard-Browser
start "" "%~dp0index.html"
