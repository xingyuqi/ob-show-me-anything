# Obsidian Show Me Anything Plugin

这是一个为 Obsidian 开发的专业文档预览和搜索插件，专注于 Microsoft Office 文档的高质量在线预览。

## ✨ 功能特性

### 📄 核心文档预览功能
- **Word 文档预览**: 使用 docx-preview 库实现 DOCX/DOC 文档的高质量在线预览，支持移动端优化
- **PowerPoint 演示文稿预览**: 使用 pptx-preview 库实现 PPTX/PPT 文档的连续滚动预览模式
- **Excel 表格预览**: 使用 xlsx 库实现 XLSX/XLS 文档的表格预览，支持多工作表切换和移动端适配

### 🔍 智能搜索功能
对于不支持预览的文件类型，插件会智能跳转到百度搜索：
- **搜索回退机制**: 预览失败时自动提供搜索备选方案

### 🎯 操作方式
1. **直接点击文件**: 在文件管理器中直接点击支持的文件类型，自动拦截并打开预览
2. **右键菜单**: 右键点击文件，选择"预览此文档"
3. **命令面板**: 使用 Ctrl+P 打开命令面板，搜索"预览/搜索当前文件"

## 📁 支持的文件类型

### 🎨 预览模式（完整功能）
- `.docx` - Microsoft Word 文档（支持移动端优化）
- `.doc` - Microsoft Word 文档（旧版）
- `.pptx` - Microsoft PowerPoint 演示文稿（连续滚动模式）
- `.ppt` - Microsoft PowerPoint 演示文稿（旧版）
- `.xlsx` - Microsoft Excel 表格（多工作表支持）
- `.xls` - Microsoft Excel 表格（旧版）

### 🔍 搜索模式（智能回退）
- `.testshow` - 测试文件类型
- 任何其他添加到支持列表的文件类型

## 🚀 技术特性

### 移动端优化
- **响应式设计**: 所有预览模式都针对移动设备进行了优化
- **触摸友好**: 支持触摸操作和手势导航
- **自适应布局**: 根据屏幕尺寸自动调整显示效果

### 智能处理
- **自动类型识别**: 根据文件扩展名智能选择预览或搜索模式
- **错误处理**: 预览失败时自动提供搜索备选方案
- **性能优化**: 延迟加载和资源管理

### 用户体验
- **统一界面**: 所有功能集成在统一的标签页中
- **状态保持**: 智能重用已打开的预览标签页
- **实时反馈**: 完整的加载状态和错误提示

## 🛠 技术实现

### 核心依赖
- **docx-preview** (v0.3.6) - Word 文档预览
- **pptx-preview** (v1.0.5) - PowerPoint 文档预览  
- **xlsx** (v0.18.5) - Excel 文档解析和预览
- **TypeScript** - 类型安全的开发环境

### 插件架构
- **自定义视图系统**: 基于 Obsidian ItemView 的标签页管理
- **事件监听机制**: 全局文件点击拦截和处理
- **模块化设计**: 各种预览器独立实现，易于扩展
- **资源管理**: 动态加载外部库，优化性能

## 📦 安装和使用

### 自动安装（推荐）
1. 在 Obsidian 中打开设置 → 第三方插件 → 社区插件
2. 搜索 "Show Me Anything" 
3. 点击安装并启用插件

### 手动安装
1. 下载最新版本的插件文件（main.js、manifest.json、styles.css）
2. 将文件放入 Obsidian 插件目录：
   ```
   .obsidian/plugins/ob-show-me-anything/
   ```
3. 重启 Obsidian 并在设置中启用插件

### 使用方法
1. **预览文档**: 直接点击支持的 Microsoft Office 文档类型（Word、PowerPoint、Excel）
2. **搜索文件**: 点击其他文件类型或预览失败时使用搜索模式
3. **快捷操作**: 
   - 右键菜单选择预览/搜索
   - 命令面板：Ctrl+P → "预览/搜索当前文件"

## 🔧 开发和构建

### 环境要求
- Node.js v16+
- TypeScript 4.0+
- Obsidian API

### 构建命令

```bash
# 安装依赖
npm install

# 开发模式（监听文件变化）
npm run dev

# 生产构建
npm run build

# 版本管理
npm version patch    # 补丁版本
npm version minor    # 次要版本  
npm version major    # 主要版本
```

### 项目结构
```
ob-show-me-anything/
├── main.ts                 # 主插件文件
├── manifest.json          # 插件清单
├── package.json           # 项目配置
├── tsconfig.json          # TypeScript 配置
├── esbuild.config.mjs     # 构建配置
├── types/                 # 类型声明文件
│   ├── docx-preview.d.ts
│   ├── pptx-preview.d.ts
│   └── xlsx.d.ts
└── styles.css             # 样式文件
```

## 🔧 配置选项

插件支持通过修改源码中的常量来自定义配置：

```typescript
// 支持的文件类型（可自定义添加）
const SUPPORTED_EXTENSIONS = [
    'docx', 'doc',           // Word 文档
    'pptx', 'ppt',           // PowerPoint 文档  
    'xlsx', 'xls',           // Excel 文档
    'testshow'               // 测试类型
];

// 可预览的文件类型
const PREVIEW_EXTENSIONS = [
    'docx', 'doc', 'pptx', 'ppt', 
    'xlsx', 'xls'
];
```

## 🚀 更新日志

### v1.3.0 (2025-07-27) - 稳定版本
-  专注于三大核心文档类型：Word、PowerPoint、Excel
- 📱 优化移动端显示效果
- 🐛 提高插件稳定性和可靠性
- ⚡ 优化性能和资源管理

### v1.1.0 (2025-07-27) - Excel 支持和移动端优化
- ✨ 新增 Excel (.xlsx/.xls) 文档预览功能
- ✨ 支持多工作表切换和数据表格显示
- 📱 全面优化移动端显示效果
- 🎨 改进 Word 文档移动端边距和字体
- 🔧 增强错误处理和用户反馈

### v1.0.0 (2025-07-27) - 初始版本
- ✨ DOCX/DOC 文档预览功能
- ✨ PPTX/PPT 演示文稿预览功能  
- ✨ 智能文件类型识别和处理
- ✨ 完整的错误处理和备选方案
- ✨ 响应式用户界面设计
- 🔍 百度搜索集成

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

### 开发流程
1. Fork 本仓库
2. 创建功能分支：`git checkout -b feature/new-feature`
3. 提交更改：`git commit -am 'Add new feature'`
4. 推送分支：`git push origin feature/new-feature`
5. 创建 Pull Request

### 添加新文件类型支持
1. 在 `SUPPORTED_EXTENSIONS` 中添加文件扩展名
2. 如需预览功能，添加到 `PREVIEW_EXTENSIONS`
3. 在 `showPreview()` 方法中实现预览逻辑
4. 添加相应的类型声明文件

## 📄 许可证

MIT License - 查看 [LICENSE](LICENSE) 文件了解详情

## 👨‍💻 作者信息

- **项目名称**: ob-show-me-anything
- **开发者**: xingyuqi
- **仓库地址**: https://github.com/xingyuqi/ob-show-me-anything
- **问题反馈**: https://github.com/xingyuqi/ob-show-me-anything/issues

## 🙏 致谢

感谢以下开源项目的支持：
- [docx-preview](https://github.com/VolodymyrBaydalka/docxjs) - Word 文档预览
- [pptx-preview](https://github.com/meshesha/pptx-preview) - PowerPoint 文档预览
- [SheetJS](https://github.com/SheetJS/sheetjs) - Excel 文档处理
- [Obsidian](https://obsidian.md/) - 强大的知识管理平台

---

# Obsidian 文件搜索/预览插件 (旧文档)

> 以下为历史文档，保留供参考

这是一个为 Obsidian 设计的多功能文件处理插件，支持文档预览和网络搜索功能。

## 功能特性 (历史版本)

### 🔍 智能文件处理
- **文档预览模式**：支持 DOCX、DOC、PPTX、PPT 文件的本地预览
- **网络搜索模式**：对于其他文件类型（XLSX、PDF、KEY、PAGES、NUMBERS）显示百度搜索结果

### 📋 支持的文件类型 (历史版本)
- **预览支持**：
  - DOCX/DOC - 使用 docx-preview 库实现Word文档预览
  - PPTX/PPT - 使用 pptx-preview 库实现PowerPoint演示文稿预览
- **搜索支持**：
  - XLSX - Excel电子表格
  - PDF - PDF文档
  - KEY - Keynote演示文稿
  - PAGES - Pages文档
  - NUMBERS - Numbers电子表格

## 📚 API 文档

查看 [Obsidian API 文档](https://github.com/obsidianmd/obsidian-api) 了解更多开发信息。

## 🔗 相关链接

- [Obsidian 插件开发指南](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)
- [Obsidian 社区插件列表](https://github.com/obsidianmd/obsidian-releases)
- [插件提交指南](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)

### 🎯 使用方式 (历史版本)
1. **点击文件**：在文件资源管理器中直接点击支持的文件类型
2. **右键菜单**：右键点击文件选择"预览此文档"或"搜索此文件"
3. **命令面板**：使用 `Ctrl+P` 打开命令面板，搜索"预览/搜索当前文件"

### 💡 智能切换 (历史版本)
- 文档类型文件（DOCX、DOC、PPTX、PPT）自动启用预览模式
- 其他文件类型自动启用网络搜索模式
- 预览失败时可一键切换到搜索模式

---

## 📋 发布新版本

- 更新 `manifest.json` 中的版本号，如 `1.0.1`，以及所需的最低 Obsidian 版本
- 更新 `versions.json` 文件，格式为 `"new-plugin-version": "minimum-obsidian-version"`
- 使用新版本号创建 GitHub release，使用确切的版本号作为 "Tag version"（不包含前缀 `v`）
- 上传 `manifest.json`、`main.js`、`styles.css` 作为二进制附件
- 发布 release

> 可以通过运行 `npm version patch`、`npm version minor` 或 `npm version major` 来简化版本更新流程

## 🚀 添加到社区插件列表

- 检查 [插件指南](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)
- 发布初始版本
- 确保仓库根目录有 `README.md` 文件
- 在 https://github.com/obsidianmd/obsidian-releases 创建 pull request 添加插件

## 💰 资助方式

可以在 `manifest.json` 中设置资助链接：

```json
{
    "fundingUrl": "https://buymeacoffee.com"
}
```

或者多个链接：

```json
{
    "fundingUrl": {
        "Buy Me a Coffee": "https://buymeacoffee.com",
        "GitHub Sponsor": "https://github.com/sponsors",
        "Patreon": "https://www.patreon.com/"
    }
}
```
