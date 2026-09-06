# Show Me Anything

Show Me Anything 在 Obsidian 标签页内查看 PDF 和常见 Office 文件。读取、预览和保存都在当前设备完成，不需要 Office、WPS 或服务器。

当前版本为 2.0.2。

## 支持范围

| 格式 | 查看 | 编辑 |
| --- | --- | --- |
| `.docx` | 分页、表格、图片、页眉页脚 | 正文、标题、列表、简单表格、常用文字格式 |
| `.pptx` | 连续显示幻灯片 | 现有文本框及其常用文字格式 |
| `.xlsx` | 工作表、合并单元格、常用样式、分页浏览 | 单元格、公式、常用格式、行高、列宽 |
| `.xls` | 工作表分页浏览 | 单元格和公式 |
| `.pdf` | 缩略图、目录、跳页、缩放、旋转、搜索、复制、单页、连续阅读、全屏、打印 | 不支持 |
| `.doc`、`.ppt` | 转换提示，可交给默认应用打开 | 不支持 |

插件可以安装在 Windows、macOS、Linux、Android 和 iOS 版 Obsidian。移动端使用紧凑布局。使用默认应用打开是否可用，取决于设备的文件关联设置。

## 使用

在文件列表中点击受支持的文件即可打开查看页。右键菜单中的用 Show Me Anything 打开也能进入同一页面。

查看页顶部有使用默认应用打开按钮。DOCX、PPTX、XLSX 和 XLS 还会显示编辑按钮。编辑完成后点击保存写入原文件，点击取消放弃本次修改。

插件不会自动保存，也不会生成备份。如果编辑期间源文件被其他程序修改，本次保存会停止，需要重新打开文件。

## 限制

- DOCX 和 PPTX 只修改现有文字节点。图片、版式、动画等内容保持原样。
- 带修订记录、编辑保护或数字签名的文件只能查看。
- XLS 是旧版二进制格式。保存时会重新生成文件，复杂样式、图表等内容可能无法保留；含宏的 XLS 只能查看。
- PDF 表单、批注、图表、数据透视表和 Office 动画不提供编辑功能。
- 加密文件不能打开，宏不会运行。
- 名称以 `~$` 开头的是 Office 临时文件，请打开对应的原文件。
- 预览排版可能与 Microsoft Office 略有差异，设备缺少原字体时更明显。

## 安装

从 [GitHub Releases](https://github.com/xingyuqi/ob-show-me-anything/releases) 下载当前版本的 `main.js`、`manifest.json` 和 `styles.css`，放入：

```text
<Obsidian 仓库>/.obsidian/plugins/ob-show-me-anything/
```

重启 Obsidian，然后在第三方插件设置中启用 Show Me Anything。

## 测试仓库

[obetst.zip](obetst.zip) 是可直接打开的 Obsidian 测试仓库，内含 DOCX、PPTX 和 XLSX 示例文件，插件版本为 2.0.2。压缩包不包含个人笔记和账号信息。

下载并解压后，在 Obsidian 中打开 `obetst` 文件夹即可测试查看和编辑。

## 开发

需要 Node.js 20 或更高版本。

```bash
npm install
npm run dev
```

检查代码并生成生产文件：

```bash
npm run check
```

部署到测试仓库：

```bash
npm run deploy -- <Obsidian 仓库路径>
```

同步 GitHub Release 文件：

```bash
npm run release:prepare
```

发布文件位于 `release/ob-show-me-anything/`。

## 依赖

- [docx-preview](https://github.com/VolodymyrBaydalka/docxjs)
- [pptx-preview](https://www.npmjs.com/package/pptx-preview)
- [SheetJS](https://docs.sheetjs.com/)
- [PDF.js](https://mozilla.github.io/pdf.js/)
- [JSZip](https://stuk.github.io/jszip/)

## 许可证

[0BSD](LICENSE)
