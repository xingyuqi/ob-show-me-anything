# Obsidian Show Me Anything Plugin 部署脚本
Write-Host "正在部署 Obsidian Show Me Anything 插件..." -ForegroundColor Green

# 设置路径
$SourceDir = $PSScriptRoot
$ObsidianDir = "$env:APPDATA\obsidian\plugins\ob-show-me-anything"

# 创建目标目录
if (!(Test-Path $ObsidianDir)) {
    Write-Host "创建插件目录: $ObsidianDir" -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $ObsidianDir -Force | Out-Null
}

# 要复制的文件列表
$FilesToCopy = @(
    "main.js",
    "manifest.json", 
    "styles.css"
)

# 复制文件
Write-Host "复制插件文件..." -ForegroundColor Cyan
$Success = $true

foreach ($File in $FilesToCopy) {
    $SourceFile = Join-Path $SourceDir $File
    $TargetFile = Join-Path $ObsidianDir $File
    
    if (Test-Path $SourceFile) {
        try {
            Copy-Item $SourceFile $TargetFile -Force
            Write-Host "  ✓ $File" -ForegroundColor Green
        } catch {
            Write-Host "  ✗ $File (复制失败: $($_.Exception.Message))" -ForegroundColor Red
            $Success = $false
        }
    } else {
        Write-Host "  ✗ $File (源文件不存在)" -ForegroundColor Red
        $Success = $false
    }
}

# 显示结果
Write-Host ""
if ($Success) {
    Write-Host "✅ 插件部署成功！" -ForegroundColor Green
    Write-Host "📁 目标目录: $ObsidianDir" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "📝 接下来的步骤：" -ForegroundColor Yellow
    Write-Host "   1. 重启 Obsidian" -ForegroundColor White
    Write-Host "   2. 在设置 > 第三方插件 > 已安装插件中启用 'Show Me Anything'" -ForegroundColor White
    Write-Host "   3. 尝试点击支持的文档文件进行预览" -ForegroundColor White
    Write-Host ""
    Write-Host "🎯 支持的文件类型：" -ForegroundColor Cyan
    Write-Host "   📄 DOCX/DOC - Word 文档预览" -ForegroundColor White
    Write-Host "   📊 PPTX/PPT - PowerPoint 演示文稿预览" -ForegroundColor White
    Write-Host "   📈 XLSX/XLS - Excel 表格预览" -ForegroundColor White
} else {
    Write-Host "❌ 部署失败！请检查文件权限和路径。" -ForegroundColor Red
}

Write-Host ""
Write-Host "按任意键继续..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
