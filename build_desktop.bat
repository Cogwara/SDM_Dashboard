@echo off
echo =======================================================
echo Building FCT SDM Dashboard Desktop App for Windows...
echo =======================================================

cd frontend
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo Error building frontend web assets.
    pause
    exit /b %ERRORLEVEL%
)

cd ..\desktop
call npm install
call npm run build:win

echo =======================================================
echo Desktop Installer Built Successfully!
echo Check dist_desktop folder for FCT SDM Dashboard Setup.exe
echo =======================================================
pause
