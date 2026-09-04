# Show Me Anything

Show Me Anything 是一个 Obsidian 文档预览插件，可在标签页中打开常见的 Office 文件。

![应用截图](./assets/intr.jpg)

## 支持格式

| 格式 | 功能 |
| --- | --- |
| `.docx` | Word 文档预览 |
| `.pptx` | PowerPoint 连续预览 |
| `.xlsx`、`.xls` | Excel 工作表预览和工作表切换 |
| `.doc`、`.ppt` | 提示转换为新版格式 |

DOC 和 PPT 是旧版二进制格式，目前使用的预览组件无法正确解析。请先用 Microsoft Office 或 WPS 另存为 DOCX 或 PPTX。

## 使用

- 在文件列表中点击受支持的 Office 文件。
- 右键点击任意文件，选择预览此文档或搜索此文件。
- 在命令面板中运行预览或搜索当前文件。
- 在预览页点击复制全部文本。

Excel 预览一次最多显示 200 行和 100 列。工作表更大时，页面底部会显示实际行列数，避免一次生成过多页面元素。

## 安装

从 Release 下载 `main.js`、`manifest.json` 和 `styles.css`，放入以下目录：

```text
<你的仓库>/.obsidian/plugins/ob-show-me-anything/
```

重启 Obsidian，然后在设置的第三方插件页面启用 Show Me Anything。

## 开发

需要 Node.js 16 或更高版本。

```bash
npm install
npm run dev
```

提交前运行：

```bash
npm run check
```

生成生产文件：

```bash
npm run build
```

## 主要依赖

- [docx-preview](https://github.com/VolodymyrBaydalka/docxjs)
- [pptx-preview](https://www.npmjs.com/package/pptx-preview)
- [SheetJS](https://github.com/SheetJS/sheetjs)

## 许可证

[MIT](LICENSE)
