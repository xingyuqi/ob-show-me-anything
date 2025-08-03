@echo off
echo 正在部署 Obsidian Show Me Anything 插件...

REM 设置源文件路径
set SOURCE_DIR=%~dp0
set TARGET_DIR=%APPDATA%\obsidian\plugins\ob-show-me-anything

REM 创建目标目录（如果不存在）
if not exist "%TARGET_DIR%" (
    echo 创建插件目录: %TARGET_DIR%
    mkdir "%TARGET_DIR%"
)

REM 复制必要的文件
echo 复制插件文件...
copy "%SOURCE_DIR%main.js" "%TARGET_DIR%\" >nul
copy "%SOURCE_DIR%manifest.json" "%TARGET_DIR%\" >nul
copy "%SOURCE_DIR%styles.css" "%TARGET_DIR%\" >nul

if %errorlevel% equ 0 (
    echo.
    echo ✅ 插件部署成功！
    echo 📁 目标目录: %TARGET_DIR%
    echo.
    echo 📝 接下来的步骤：
    echo    1. 重启 Obsidian
    echo    2. 在设置 ^> 第三方插件 ^> 已安装插件中启用 "Show Me Anything"
    echo    3. 尝试点击支持的文档文件进行预览
    echo.
) else (
    echo ❌ 部署失败！请检查文件权限和路径。
)

pause
