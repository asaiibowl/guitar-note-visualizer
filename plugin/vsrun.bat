@echo off
rem Run a command inside the Visual Studio x64 developer environment.
rem Usage: vsrun.bat <command> [args...]
call "C:\Program Files\Microsoft Visual Studio\18\Community\VC\Auxiliary\Build\vcvars64.bat" >nul || exit /b 1
%*
