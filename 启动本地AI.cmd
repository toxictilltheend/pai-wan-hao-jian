@echo off
cd /d "%~dp0"
node local-ai.cjs --open
if errorlevel 1 pause
