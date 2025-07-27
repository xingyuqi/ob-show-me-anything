# Show Me Anything - Obsidian 文件搜索插件

这是一个专为 Obsidian (https://obsidian.md) 设计的文件搜索插件，可以为特定类型的文件提供在线搜索功能。

## 功能特点

当你点击以下类型的文件时，插件会在主窗口中打开百度搜索结果，使用完整的文件路径作为搜索关键词：

**支持的文件类型：**
- `.pptx` - PowerPoint 演示文稿
- `.docx` - Word 文档  
- `.xlsx` - Excel 电子表格
- `.pdf` - PDF 文档
- `.key` - Keynote 演示文稿
- `.pages` - Pages 文档
- `.numbers` - Numbers 电子表格

**使用方式：**
1. **右键菜单**（推荐）：右键点击支持的文件，选择"搜索此文件"
2. **命令面板**：选中文件后，按 `Ctrl+P` 打开命令面板，搜索"搜索当前文件"
3. **直接点击**：直接点击支持的文件类型（实验性功能）

## 插件优势

- 🔍 **智能搜索**：使用完整文件路径而不是仅文件名，提供更精确的搜索结果
- 🖥️ **主窗口显示**：搜索结果在主工作区显示，而不是侧边栏
- 🛠️ **多种交互方式**：右键菜单、命令面板、直接点击等多种方式触发搜索
- ⚡ **快速响应**：即时加载搜索结果，提供加载状态提示
- 🔧 **开发友好**：包含自动化部署脚本，便于开发和调试

## 安装和使用

### 手动安装

1. 下载插件文件：`main.js`、`manifest.json`、`styles.css`
2. 复制到你的 vault 目录：`VaultFolder/.obsidian/plugins/ob-show-me-anything/`
3. 在 Obsidian 设置中启用插件

### 开发安装

1. 克隆此仓库到本地
2. 确保 NodeJS 版本至少为 v16 (`node --version`)
3. 运行 `npm i` 安装依赖
4. 运行 `npm run dev` 开始开发模式编译
5. 使用 `deploy.bat` 脚本自动构建和部署到 Obsidian

## 使用指南

1. **添加支持的文件类型**到你的 vault 中
2. **右键点击**任何支持的文件（如 `.docx`、`.pptx` 等）
3. **选择"搜索此文件"**菜单项
4. 搜索结果将在主窗口中的新标签页中显示

### 搜索示例

假设你有一个文件：`工作文档/2024项目/重要资料/年度报告.docx`

- 搜索关键词将是：`工作文档/2024项目/重要资料/年度报告`
- 这比仅搜索 `年度报告.docx` 提供了更多上下文信息

## 开发说明

### 项目结构

```
├── main.ts          # 主插件逻辑
├── manifest.json    # 插件配置文件
├── styles.css       # 插件样式
├── deploy.bat       # 部署脚本
└── README.md        # 项目说明
```

### 开发工作流

1. 修改 `main.ts` 或其他源文件
2. 运行 `deploy.bat` 自动构建和部署
3. 重启 Obsidian 或重新加载插件
4. 测试功能

### 自定义配置

可以在 `main.ts` 中修改 `SUPPORTED_EXTENSIONS` 数组来添加或移除支持的文件类型：

```typescript
const SUPPORTED_EXTENSIONS = ['pptx', 'docx', 'xlsx', 'pdf', 'key', 'pages', 'numbers'];
```

## 技术细节

这个插件使用 TypeScript 开发，基于最新的 Obsidian 插件 API。

### 核心功能实现

- **文件类型检测**：监听文件点击事件，检查文件扩展名
- **自定义视图**：创建 `FileSearchView` 类继承 `ItemView`
- **事件处理**：注册文件菜单、命令面板、点击事件
- **iframe 集成**：使用 iframe 嵌入百度搜索结果
- **状态管理**：管理文件名和路径信息

### 依赖说明

- **obsidian**: Obsidian 插件 API
- **typescript**: 类型检查和编译
- **esbuild**: 快速构建工具

## 常见问题

**Q: 为什么点击文件还是用系统默认程序打开？**
A: 请使用右键菜单的"搜索此文件"选项，这是最可靠的方式。

**Q: 可以修改搜索引擎吗？**
A: 可以，在 `main.ts` 的 `updateSearch()` 方法中修改 `searchUrl` 变量。

**Q: 如何添加更多文件类型支持？**
A: 修改 `SUPPORTED_EXTENSIONS` 数组，添加新的文件扩展名。

**Q: 搜索结果可以在右侧显示吗？**
A: 可以，在 `activateView()` 方法中将 `workspace.getLeaf(true)` 修改为 `workspace.getRightLeaf()`，以在右侧显示搜索结果。

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT License

## 作者

yuqxing

---

如果这个插件对你有帮助，请给项目点个 ⭐️！
