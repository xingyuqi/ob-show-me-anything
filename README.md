# Obsidian Show Me Anything Plugin

这是一个为 Obsidian 开发的文件预览和搜索插件，支持多种文件格式的预览和在线搜索功能。

## 功能特性

### 文档预览功能
- **DOCX/DOC 文档预览**: 使用 docx-preview 库实现 Word 文档的在线预览
- **PPTX/PPT 演示文稿预览**: 使用 pptx-preview 库实现 PowerPoint 文档的在线预览，支持幻灯片模式

### 在线搜索功能
对于不支持预览的文件类型，插件会自动跳转到百度搜索相关文件：
- **支持的搜索文件类型**: XLSX、PDF、KEY、Pages、Numbers 等

### 操作方式
1. **直接点击文件**: 在文件管理器中直接点击支持的文件类型
2. **右键菜单**: 右键点击文件，选择"预览此文档"或"搜索此文件"
3. **命令面板**: 使用 Ctrl+P 打开命令面板，搜索"预览/搜索当前文件"

## 支持的文件类型

### 预览模式
- `.docx` - Microsoft Word 文档
- `.doc` - Microsoft Word 文档（旧版）
- `.pptx` - Microsoft PowerPoint 演示文稿
- `.ppt` - Microsoft PowerPoint 演示文稿（旧版）

### 搜索模式
- `.xlsx` - Microsoft Excel 表格
- `.pdf` - PDF 文档
- `.key` - Apple Keynote 演示文稿
- `.pages` - Apple Pages 文档
- `.numbers` - Apple Numbers 表格

## 技术实现

- **前端框架**: TypeScript + Obsidian API
- **文档预览**: docx-preview 库
- **演示文稿预览**: pptx-preview 库
- **构建工具**: esbuild
- **类型检查**: TypeScript

## 安装和使用

1. 将插件文件放入 Obsidian 插件目录
2. 在 Obsidian 设置中启用"Show Me Anything"插件
3. 点击支持的文件类型即可预览或搜索

## 开发和构建

```bash
# 安装依赖
npm install

# 开发模式（监听文件变化）
npm run dev

# 生产构建
npm run build
```

# Obsidian 文件搜索/预览插件

这是一个为 Obsidian 设计的多功能文件处理插件，支持文档预览和网络搜索功能。

## 功能特性

### 🔍 智能文件处理
- **文档预览模式**：支持 DOCX、DOC、PPTX、PPT 文件的本地预览
- **网络搜索模式**：对于其他文件类型（XLSX、PDF、KEY、PAGES、NUMBERS）显示百度搜索结果

### 📋 支持的文件类型
- **预览支持**：
  - DOCX/DOC - 使用 docx-preview 库实现Word文档预览
  - PPTX/PPT - 使用 pptx-preview 库实现PowerPoint演示文稿预览
- **搜索支持**：
  - XLSX - Excel电子表格
  - PDF - PDF文档
  - KEY - Keynote演示文稿
  - PAGES - Pages文档
  - NUMBERS - Numbers电子表格

### 🎯 使用方式
1. **点击文件**：在文件资源管理器中直接点击支持的文件类型
2. **右键菜单**：右键点击文件选择"预览此文档"或"搜索此文件"
3. **命令面板**：使用 `Ctrl+P` 打开命令面板，搜索"预览/搜索当前文件"

### 💡 智能切换
- 文档类型文件（DOCX、DOC、PPTX、PPT）自动启用预览模式
- 其他文件类型自动启用网络搜索模式
- 预览失败时可一键切换到搜索模式

## 技术实现

### 依赖库
- `docx-preview` - Word文档预览
- `pptx-preview` - PowerPoint文档预览
- TypeScript - 类型安全的开发

### 插件架构
- 自定义视图系统，支持标签页管理
- 事件监听机制，拦截文件点击行为
- 错误处理和备选方案
- 响应式布局设计

## 安装说明

1. 下载插件文件（main.js、manifest.json、styles.css）
2. 将文件放置到 Obsidian 插件目录：
   ```
   .obsidian/plugins/ob-show-me-anything/
   ```
3. 重启 Obsidian
4. 在设置中启用"文件搜索/预览插件"

## 开发说明

### 环境要求
- Node.js v16+
- TypeScript
- Obsidian API

### 构建命令
```bash
npm install        # 安装依赖
npm run build      # 构建生产版本
npm run dev        # 开发模式
```

### 部署脚本
```bash
.\deploy.bat       # Windows 自动部署脚本
```

## 更新日志

### v1.0.0 (2025-07-27)
- ✨ 添加 DOCX/DOC 文档预览功能
- ✨ 添加 PPTX/PPT 演示文稿预览功能
- ✨ 支持多种文件类型的网络搜索
- ✨ 智能文件类型识别和处理
- ✨ 完整的错误处理和备选方案
- ✨ 响应式用户界面设计

## 作者信息

- 项目名称：ob-show-me-anything
- 开发者：xingyuqi
- 仓库地址：https://github.com/xingyuqi/ob-show-me-anything

## 许可证

MIT License

## Releasing new releases

- Update your `manifest.json` with your new version number, such as `1.0.1`, and the minimum Obsidian version required for your latest release.
- Update your `versions.json` file with `"new-plugin-version": "minimum-obsidian-version"` so older versions of Obsidian can download an older version of your plugin that's compatible.
- Create new GitHub release using your new version number as the "Tag version". Use the exact version number, don't include a prefix `v`. See here for an example: https://github.com/obsidianmd/obsidian-sample-plugin/releases
- Upload the files `manifest.json`, `main.js`, `styles.css` as binary attachments. Note: The manifest.json file must be in two places, first the root path of your repository and also in the release.
- Publish the release.

> You can simplify the version bump process by running `npm version patch`, `npm version minor` or `npm version major` after updating `minAppVersion` manually in `manifest.json`.
> The command will bump version in `manifest.json` and `package.json`, and add the entry for the new version to `versions.json`

## Adding your plugin to the community plugin list

- Check the [plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines).
- Publish an initial version.
- Make sure you have a `README.md` file in the root of your repo.
- Make a pull request at https://github.com/obsidianmd/obsidian-releases to add your plugin.

## How to use

- Clone this repo.
- Make sure your NodeJS is at least v16 (`node --version`).
- `npm i` or `yarn` to install dependencies.
- `npm run dev` to start compilation in watch mode.

## Manually installing the plugin

- Copy over `main.js`, `styles.css`, `manifest.json` to your vault `VaultFolder/.obsidian/plugins/your-plugin-id/`.

## Improve code quality with eslint (optional)
- [ESLint](https://eslint.org/) is a tool that analyzes your code to quickly find problems. You can run ESLint against your plugin to find common bugs and ways to improve your code. 
- To use eslint with this project, make sure to install eslint from terminal:
  - `npm install -g eslint`
- To use eslint to analyze this project use this command:
  - `eslint main.ts`
  - eslint will then create a report with suggestions for code improvement by file and line number.
- If your source code is in a folder, such as `src`, you can use eslint with this command to analyze all files in that folder:
  - `eslint .\src\`

## Funding URL

You can include funding URLs where people who use your plugin can financially support it.

The simple way is to set the `fundingUrl` field to your link in your `manifest.json` file:

```json
{
    "fundingUrl": "https://buymeacoffee.com"
}
```

If you have multiple URLs, you can also do:

```json
{
    "fundingUrl": {
        "Buy Me a Coffee": "https://buymeacoffee.com",
        "GitHub Sponsor": "https://github.com/sponsors",
        "Patreon": "https://www.patreon.com/"
    }
}
```

## API Documentation

See https://github.com/obsidianmd/obsidian-api
