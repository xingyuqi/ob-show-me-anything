@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul
echo ================================
echo   Obsidian Plugin Deployer
echo ================================
echo.

echo [1/4] Building plugin...
npm run build

if %errorlevel% neq 0 (
    echo [ERROR] Build failed! Please check errors.
    pause
    exit /b 1
)
echo [SUCCESS] Build completed!

echo.
echo [2/4] Deploying to Obsidian...
set PLUGIN_DIR=C:\Users\yuqixing\iCloudDrive\iCloud~md~obsidian\yuqidata\.obsidian\plugins\ob-show-me-anything

if not exist "%PLUGIN_DIR%" (
    echo [INFO] Creating plugin directory...
    mkdir "%PLUGIN_DIR%"
)

echo Copying files...
copy main.js "%PLUGIN_DIR%\main.js" >nul
copy manifest.json "%PLUGIN_DIR%\manifest.json" >nul
copy styles.css "%PLUGIN_DIR%\styles.css" >nul

if %errorlevel% neq 0 (
    echo [ERROR] Deploy failed! Please check permissions.
    pause
    exit /b 1
)
echo [SUCCESS] Plugin deployed successfully!

echo.
echo [3/4] Checking Obsidian status...
tasklist /FI "IMAGENAME eq Obsidian.exe" 2>NUL | find /I /N "Obsidian.exe" >nul
if %errorlevel% equ 0 (
    echo [INFO] Obsidian is currently running.
    echo.
    echo [4/4] Restart Obsidian to apply changes? (Y/N)
    set /p restart=Choice: 
    if /i "!restart!"=="Y" (
        echo [INFO] Closing Obsidian...
        taskkill /f /im Obsidian.exe >nul 2>&1
        timeout /t 3 >nul
        echo [INFO] Starting Obsidian...
        
        REM Try different possible Obsidian locations
        if exist "C:\Users\%USERNAME%\AppData\Local\Obsidian\Obsidian.exe" (
            start "" "C:\Users\%USERNAME%\AppData\Local\Obsidian\Obsidian.exe"
        ) else if exist "C:\Program Files\Obsidian\Obsidian.exe" (
            start "" "C:\Program Files\Obsidian\Obsidian.exe"
        ) else if exist "C:\Program Files (x86)\Obsidian\Obsidian.exe" (
            start "" "C:\Program Files (x86)\Obsidian\Obsidian.exe"
        ) else (
            echo [WARNING] Could not find Obsidian executable. Please start manually.
        )
        echo [SUCCESS] Obsidian restart initiated!
    ) else (
        echo [INFO] Please manually reload the plugin in Obsidian.
    )
) else (
    echo [INFO] Obsidian is not running. You can start it now.
)

echo.
echo ================================
echo   Deployment Complete!
echo ================================
echo Files copied to: %PLUGIN_DIR%
echo.
pause
