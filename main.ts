import { ItemView, Plugin, TFile, WorkspaceLeaf, ViewStateResult } from 'obsidian';
import * as docxPreview from 'docx-preview';
import { init as initPptxPreview } from 'pptx-preview';
import * as XLSX from 'xlsx';

// --- 常量定义 ---

// 1. 
// 自定义视图的唯一标识符
// 这个字符串插件中必须是唯一的
export const VIEW_TYPE_FILE_SEARCH = "file-search-view";

// 2. 定义插件支持的文件后缀列表 (可自行增删)
// 后缀请使用小写
const SUPPORTED_EXTENSIONS = ['docx', 'doc', 'pptx', 'ppt', 'xlsx', 'xls', 'testshow'];

// 3. 定义可以预览的文件类型
const PREVIEW_EXTENSIONS = ['docx', 'doc', 'pptx', 'ppt', 'xlsx', 'xls'];


// --- 自定义视图类 ---
// 这个类负责在 Obsidian 中创建一个新的标签页，并展示一个网页或文档预览
class FileSearchView extends ItemView {
    // 这个属性用来存储当前正在搜索的文件名
    private currentFilename: string | null = null;
    // 存储文件路径
    private currentFilepath: string | null = null;
    // 存储文件对象
    private currentFile: TFile | null = null;
    // 存储iframe元素的引用
    private iframe: HTMLIFrameElement | null = null;
    // 存储容器元素的引用
    private contentContainer: HTMLElement | null = null;
    // 存储预览容器的引用
    private previewContainer: HTMLElement | null = null;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    // 返回视图的唯一标识符
    getViewType(): string {
        return VIEW_TYPE_FILE_SEARCH;
    }

    // 返回显示在标签页顶部的标题文字
    getDisplayText(): string {
        if (this.currentFilename) {
            // 检查是否是预览模式
            const ext = this.currentFilename.split('.').pop()?.toLowerCase();
            if (ext && PREVIEW_EXTENSIONS.includes(ext)) {
                return `预览: ${this.currentFilename}`;
            } else {
                return `搜索: ${this.currentFilename}`;
            }
        }
        return "文件搜索/预览";
    }

    // 返回显示在标签页顶部的图标
    // 你可以在这里使用 Obsidian 内置的任何图标名称
    // 图标列表: https://lucide.dev/
    getIcon(): string {
        return "search"; // 使用 "search" 搜索图标
    }

    // 当视图的状态需要改变时，此方法会被调用
    // (例如，首次打开并传入文件名，或点击另一个文件需要更新时)
    // 这是处理数据更新的最佳位置
    async setState(state: { filename?: string, filepath?: string, file?: TFile }, result: ViewStateResult): Promise<void> {
        // 检查传入的状态对象中是否包含我们需要的信息
        if (state?.filename) {
            this.currentFilename = state.filename;
            this.currentFilepath = state.filepath || null;
            this.currentFile = state.file || null;

            // 确保视图已经初始化后再更新内容
            if (this.contentContainer) {
                await this.updateContent();
            }
            // 如果容器还没创建，文件信息会在onOpen中使用
        }

        // 调用父类的方法以完成状态设置
        return super.setState(state, result);
    }

    // 当视图第一次被打开时，此方法会被调用一次
    // 它的主要职责是构建视图的静态 HTML 结构
    async onOpen(): Promise<void> {
        // 获取视图的内容容器
        this.contentContainer = this.containerEl.children[1] as HTMLElement;
        this.contentContainer.empty(); // 清空所有旧内容

        // 添加一些基本样式
        this.contentContainer.style.display = 'flex';
        this.contentContainer.style.flexDirection = 'column';
        this.contentContainer.style.height = '100%';

        // 创建加载提示
        const loadingDiv = this.contentContainer.createDiv();
        loadingDiv.setText('正在加载搜索结果...');
        loadingDiv.style.textAlign = 'center';
        loadingDiv.style.padding = '20px';
        loadingDiv.style.color = '#888888'; // 使用具体颜色值而不是CSS变量

        // 创建一个 iframe 元素来承载网页
        this.iframe = this.contentContainer.createEl('iframe');
        this.iframe.setAttribute('width', '100%');
        this.iframe.setAttribute('height', '100%');
        this.iframe.setAttribute('frameborder', '0');
        this.iframe.style.flexGrow = '1';
        // 添加一个 class，方便未来用 CSS 进行样式美化
        this.iframe.addClass('file-search-iframe');

        // 添加错误处理
        this.iframe.addEventListener('load', () => {
            loadingDiv.remove(); // 加载完成后移除加载提示
        });

        this.iframe.addEventListener('error', () => {
            loadingDiv.setText('加载失败，请检查网络连接');
            loadingDiv.style.color = '#ff4444'; // 使用具体颜色值
        });

        // 如果已经有文件名，立即更新内容
        if (this.currentFilename) {
            await this.updateContent();
        } else {
            // 如果没有文件名，显示默认页面
            loadingDiv.setText('请选择一个文件进行搜索或预览');
            loadingDiv.style.color = '#888888'; // 使用具体颜色值
        }
    }

    // 当视图被关闭时调用的方法
    async onClose(): Promise<void> {
        // 清理资源
        this.iframe = null;
        this.contentContainer = null;
        this.previewContainer = null;
        this.currentFilename = null;
        this.currentFilepath = null;
        this.currentFile = null;
    }

    // 根据文件类型更新内容（预览或搜索）
    async updateContent() {
        if (!this.currentFilename || !this.contentContainer) {
            return;
        }

        // 获取文件扩展名
        const ext = this.currentFilename.split('.').pop()?.toLowerCase();
        
        if (ext && PREVIEW_EXTENSIONS.includes(ext)) {
            // 如果是文档文件，显示预览
            await this.showPreview();
        } else {
            // 其他文件类型，显示搜索结果
            this.showSearch();
        }
    }

    // 显示文档预览
    async showPreview() {
        if (!this.currentFile || !this.contentContainer) {
            console.warn('缺少文件信息或容器，无法显示预览');
            return;
        }

        try {
            // 清空容器
            this.contentContainer.empty();
            
            // 创建预览容器
            this.previewContainer = this.contentContainer.createDiv();
            this.previewContainer.style.width = '100%';
            this.previewContainer.style.height = '100%';
            this.previewContainer.style.overflow = 'auto';
            this.previewContainer.style.padding = '20px';
            this.previewContainer.style.boxSizing = 'border-box';
            this.previewContainer.style.display = 'flex';
            this.previewContainer.style.flexDirection = 'column';
            this.previewContainer.style.position = 'relative'; // 为复制按钮定位
            
            // 添加CSS类以支持文本选择
            this.previewContainer.addClass('document-preview-container');

            // 添加复制按钮
            const copyButton = this.previewContainer.createEl('button');
            copyButton.textContent = '复制全部文本';
            copyButton.addClass('copy-text-button');
            copyButton.onclick = () => this.copyAllText();

            // 显示加载提示
            const loadingDiv = this.previewContainer.createDiv();
            loadingDiv.setText('正在加载文档预览...');
            loadingDiv.style.textAlign = 'center';
            loadingDiv.style.padding = '20px';
            loadingDiv.style.color = '#888888';

            // 读取文件内容
            const fileBuffer = await this.app.vault.readBinary(this.currentFile);
            
            // 清除加载提示
            loadingDiv.remove();

            // 根据文件扩展名选择合适的预览器
            const ext = this.currentFilename?.split('.').pop()?.toLowerCase();
            
            if (ext === 'docx' || ext === 'doc') {
                // 使用 docx-preview 渲染文档
                await docxPreview.renderAsync(fileBuffer, this.previewContainer);
                
                // 确保docx内容可以选择文本
                const docxWrapper = this.previewContainer.querySelector('.docx-wrapper');
                if (docxWrapper) {
                    (docxWrapper as HTMLElement).style.userSelect = 'text';
                    (docxWrapper as HTMLElement).style.webkitUserSelect = 'text';
                    (docxWrapper as HTMLElement).style.cursor = 'text';
                }
                
                // 移动端样式优化 - 在文档渲染后应用
                setTimeout(() => {
                    if (window.matchMedia && window.matchMedia('(max-width: 768px)').matches) {
                        // 为整个预览容器添加移动端样式
                        if (this.previewContainer) {
                            this.previewContainer.style.overflow = 'auto';
                            this.previewContainer.style.padding = '2px'; // 进一步减少容器padding
                            
                            // 添加CSS样式来处理Word文档的移动端适配
                            const style = document.createElement('style');
                            style.textContent = `
                                .docx-wrapper {
                                    max-width: 100% !important;
                                    overflow-x: auto !important;
                                    padding: 2px !important;
                                    margin: 0 !important;
                                    font-size: 14px !important;
                                }
                                .docx-wrapper * {
                                    max-width: 100% !important;
                                    word-wrap: break-word !important;
                                    overflow-wrap: break-word !important;
                                    font-size: inherit !important;
                                    line-height: 1.4 !important;
                                }
                                .docx-wrapper p {
                                    margin: 0.3em 0 !important;
                                    padding: 0 !important;
                                    font-size: 14px !important;
                                }
                                .docx-wrapper div {
                                    margin: 0 !important;
                                    padding: 0 2px !important;
                                }
                                .docx-wrapper table {
                                    width: 100% !important;
                                    table-layout: fixed !important;
                                    margin: 0.3em 0 !important;
                                    font-size: 12px !important;
                                }
                                .docx-wrapper td, .docx-wrapper th {
                                    word-wrap: break-word !important;
                                    overflow-wrap: break-word !important;
                                    max-width: 120px !important;
                                    padding: 2px !important;
                                    font-size: 12px !important;
                                }
                                .docx-wrapper img {
                                    max-width: 100% !important;
                                    height: auto !important;
                                    margin: 0.3em 0 !important;
                                }
                                .docx-wrapper h1, .docx-wrapper h2, .docx-wrapper h3,
                                .docx-wrapper h4, .docx-wrapper h5, .docx-wrapper h6 {
                                    font-size: 16px !important;
                                    margin: 0.5em 0 0.2em 0 !important;
                                    padding: 0 !important;
                                }
                                .docx-wrapper span {
                                    font-size: inherit !important;
                                }
                            `;
                            document.head.appendChild(style);
                            
                            console.log('移动端Word文档样式优化已应用');
                        }
                    }
                }, 500); // 给文档渲染一些时间
                
                console.log(`DOCX文档预览加载完成: ${this.currentFilename}`);
            } else if (ext === 'pptx' || ext === 'ppt') {
                // 使用 pptx-preview 渲染PPT
                const pptxPreviewer = initPptxPreview(this.previewContainer, {
                    width: this.previewContainer.clientWidth || 800,
                    height: this.previewContainer.clientHeight || 600,
                    mode: 'list' // 连续滚动模式，可滚轮翻页
                });
                await pptxPreviewer.preview(fileBuffer);
                
                // 确保PPT内容可以选择文本
                setTimeout(() => {
                    // 为PPT预览内容添加文本选择支持
                    const pptElements = this.previewContainer?.querySelectorAll('*');
                    if (pptElements) {
                        pptElements.forEach((element: Element) => {
                            const htmlElement = element as HTMLElement;
                            htmlElement.style.userSelect = 'text';
                            htmlElement.style.webkitUserSelect = 'text';
                            htmlElement.style.cursor = 'text';
                        });
                    }
                    
                    // 添加PPT专用的文本选择样式
                    const pptStyle = document.createElement('style');
                    pptStyle.textContent = `
                        .pptx-preview, .pptx-preview * {
                            user-select: text !important;
                            -webkit-user-select: text !important;
                            -moz-user-select: text !important;
                            cursor: text !important;
                        }
                        .pptx-slide, .pptx-slide * {
                            user-select: text !important;
                            -webkit-user-select: text !important;
                            cursor: text !important;
                        }
                    `;
                    document.head.appendChild(pptStyle);
                    console.log('PPT文本选择支持已启用');
                }, 1000); // 给PPT渲染更多时间
                
                console.log(`PPTX文档预览加载完成: ${this.currentFilename}`);
            } else if (ext === 'xlsx' || ext === 'xls') {
                // 使用 xlsx 库解析Excel并自定义显示
                this.previewContainer.style.padding = '15px';
                this.previewContainer.style.height = '100%';
                this.previewContainer.style.maxHeight = '95vh';
                this.previewContainer.style.overflow = 'auto';
                
                try {
                    // 使用XLSX库解析文件
                    const workbook = XLSX.read(fileBuffer, { type: 'array' });
                    
                    // 创建工作表选择器 - 使用标签页形式
                    let currentSheetName = workbook.SheetNames[0];
                    let tabContainer: HTMLDivElement | null = null;
                    
                    if (workbook.SheetNames.length > 1) {
                        tabContainer = this.previewContainer.createDiv();
                        tabContainer.style.marginBottom = '10px';
                        tabContainer.style.borderBottom = '2px solid #e0e0e0';
                        tabContainer.style.display = 'flex';
                        tabContainer.style.flexWrap = 'wrap';
                        tabContainer.style.gap = '2px';
                        
                        workbook.SheetNames.forEach((sheetName, index) => {
                            const tab = tabContainer?.createDiv();
                            if (!tab) return;
                            
                            tab.textContent = sheetName;
                            tab.style.padding = '8px 16px';
                            tab.style.cursor = 'pointer';
                            tab.style.borderRadius = '4px 4px 0 0';
                            tab.style.fontSize = '12px';
                            tab.style.fontWeight = '500';
                            tab.style.transition = 'all 0.2s ease';
                            tab.style.maxWidth = '150px';
                            tab.style.overflow = 'hidden';
                            tab.style.textOverflow = 'ellipsis';
                            tab.style.whiteSpace = 'nowrap';
                            tab.style.minHeight = '32px'; // 确保触摸友好的最小高度
                            tab.style.display = 'flex';
                            tab.style.alignItems = 'center';
                            tab.style.justifyContent = 'center';
                            tab.title = sheetName; // 悬停显示完整名称
                            
                            // 移动端触摸优化
                            tab.style.touchAction = 'manipulation';
                            tab.style.userSelect = 'none';
                            
                            // 设置初始样式
                            if (index === 0) {
                                tab.style.backgroundColor = '#007acc';
                                tab.style.color = '#fff';
                                tab.style.borderBottom = '2px solid #007acc';
                            } else {
                                tab.style.backgroundColor = '#f5f5f5';
                                tab.style.color = '#333';
                                tab.style.border = '1px solid #ddd';
                                tab.style.borderBottom = 'none';
                            }
                            
                            // 悬停效果 (仅在非触摸设备上启用)
                            if (window.matchMedia && !window.matchMedia('(pointer: coarse)').matches) {
                                tab.addEventListener('mouseenter', () => {
                                    if (currentSheetName !== sheetName) {
                                        tab.style.backgroundColor = '#e8e8e8';
                                    }
                                });
                                
                                tab.addEventListener('mouseleave', () => {
                                    if (currentSheetName !== sheetName) {
                                        tab.style.backgroundColor = '#f5f5f5';
                                    }
                                });
                            }
                            
                            // 点击切换工作表
                            tab.addEventListener('click', () => {
                                // 更新所有标签的样式
                                if (tabContainer) {
                                    tabContainer.querySelectorAll('div').forEach((t: HTMLDivElement) => {
                                        t.style.backgroundColor = '#f5f5f5';
                                        t.style.color = '#333';
                                        t.style.border = '1px solid #ddd';
                                        t.style.borderBottom = 'none';
                                    });
                                }
                                
                                // 设置当前标签为活跃状态
                                tab.style.backgroundColor = '#007acc';
                                tab.style.color = '#fff';
                                tab.style.border = '2px solid #007acc';
                                tab.style.borderBottom = '2px solid #007acc';
                                
                                currentSheetName = sheetName;
                                renderSheet(sheetName);
                            });
                        });
                    }
                    
                    // 创建表格容器
                    const tableContainer = this.previewContainer.createDiv();
                    tableContainer.style.width = '100%';
                    tableContainer.style.maxHeight = '800px';
                    tableContainer.style.overflow = 'auto';
                    tableContainer.style.border = '1px solid #ddd';
                    tableContainer.style.borderRadius = '4px';
                    tableContainer.style.backgroundColor = '#fff';
                    
                    // 添加CSS类以支持文本选择
                    tableContainer.addClass('excel-preview-table');
                    
                    // 渲染第一个工作表
                    const renderSheet = (sheetName: string) => {
                        tableContainer.innerHTML = '';
                        const worksheet = workbook.Sheets[sheetName];
                        
                        // 将工作表转换为JSON数组
                        const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
                            header: 1, 
                            defval: '', 
                            raw: false 
                        });
                        
                        if (jsonData.length === 0) {
                            tableContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">工作表为空</div>';
                            return;
                        }
                        
                        // 创建HTML表格
                        const table = tableContainer.createEl('table');
                        table.style.width = '100%';
                        table.style.borderCollapse = 'collapse';
                        table.style.fontSize = '12px';
                        // 启用表格文本选择
                        table.style.userSelect = 'text';
                        table.style.webkitUserSelect = 'text';
                        
                        // 移动端响应式优化
                        if (window.matchMedia && window.matchMedia('(max-width: 768px)').matches) {
                            table.style.fontSize = '10px';
                            tableContainer.style.fontSize = '10px';
                        }
                        
                        // 限制显示的行数，但确保至少显示50行
                        const maxRows = Math.max(50, Math.min(200, jsonData.length));
                        const displayData = jsonData.slice(0, maxRows);
                        
                        // 找出最大列数
                        const maxCols = Math.max(...displayData.map((row: unknown[]) => row.length));
                        
                        displayData.forEach((rowData: unknown[], rowIndex: number) => {
                            const tr = table.createEl('tr');
                            
                            // 第一行作为表头
                            if (rowIndex === 0) {
                                tr.style.backgroundColor = '#f5f5f5';
                                tr.style.fontWeight = 'bold';
                            }
                            
                            // 添加行号列
                            const rowNumTd = tr.createEl('td');
                            rowNumTd.textContent = (rowIndex + 1).toString();
                            rowNumTd.style.padding = '4px 8px';
                            rowNumTd.style.border = '1px solid #ddd';
                            rowNumTd.style.backgroundColor = '#f9f9f9';
                            rowNumTd.style.fontWeight = 'bold';
                            rowNumTd.style.textAlign = 'center';
                            rowNumTd.style.minWidth = '40px';
                            // 启用行号列的文本选择
                            rowNumTd.style.userSelect = 'text';
                            rowNumTd.style.webkitUserSelect = 'text';
                            rowNumTd.style.cursor = 'text';
                            
                            // 移动端优化行号列
                            if (window.matchMedia && window.matchMedia('(max-width: 768px)').matches) {
                                rowNumTd.style.minWidth = '30px';
                                rowNumTd.style.padding = '2px 4px';
                            }
                            
                            // 确保每行都有相同的列数
                            for (let colIndex = 0; colIndex < maxCols; colIndex++) {
                                const td = tr.createEl('td');
                                const cellValue = rowData[colIndex];
                                td.textContent = cellValue !== undefined && cellValue !== null ? String(cellValue) : '';
                                td.style.padding = '4px 8px';
                                td.style.border = '1px solid #ddd';
                                td.style.minWidth = '80px';
                                td.style.maxWidth = '200px';
                                td.style.wordWrap = 'break-word';
                                td.style.verticalAlign = 'top';
                                // 启用单元格文本选择
                                td.style.userSelect = 'text';
                                td.style.webkitUserSelect = 'text';
                                td.style.cursor = 'text';
                                
                                // 移动端优化单元格
                                if (window.matchMedia && window.matchMedia('(max-width: 768px)').matches) {
                                    td.style.padding = '2px 4px';
                                    td.style.minWidth = '60px';
                                    td.style.maxWidth = '120px';
                                    td.style.fontSize = '10px';
                                }
                                
                                // 交替行颜色
                                if (rowIndex % 2 === 0) {
                                    td.style.backgroundColor = '#fafafa';
                                }
                            }
                        });
                        
                        // 显示统计信息
                        const info = tableContainer.createDiv();
                        info.style.padding = '10px';
                        info.style.backgroundColor = '#f0f0f0';
                        info.style.borderTop = '1px solid #ddd';
                        info.style.fontSize = '11px';
                        info.style.color = '#666';
                        info.textContent = `显示 ${displayData.length} 行 × ${maxCols} 列 (总计 ${jsonData.length} 行数据)`;
                    };
                    
                    // 渲染第一个工作表
                    renderSheet(workbook.SheetNames[0]);
                    
                    console.log(`Excel文档预览加载完成: ${this.currentFilename}`);
                    
                } catch (error) {
                    console.error('Excel预览失败:', error);
                    this.previewContainer.innerHTML = `
                        <div style="padding: 20px; text-align: center; color: #666;">
                            <p>Excel预览加载失败</p>
                            <p>错误: ${error.message}</p>
                            <p>将使用搜索模式...</p>
                        </div>
                    `;
                    // fallback到搜索
                    setTimeout(() => {
                        this.updateContent();
                    }, 2000);
                }
            }
            
        } catch (error) {
            console.error('预览文档时出错:', error);
            
            if (this.previewContainer) {
                this.previewContainer.empty();
                const errorDiv = this.previewContainer.createDiv();
                errorDiv.setText(`预览失败: ${error.message || '未知错误'}`);
                errorDiv.style.textAlign = 'center';
                errorDiv.style.padding = '20px';
                errorDiv.style.color = '#ff4444';
                
                // 提供备选方案：搜索
                const fallbackDiv = this.previewContainer.createDiv();
                fallbackDiv.style.textAlign = 'center';
                fallbackDiv.style.marginTop = '10px';
                
                const fallbackBtn = fallbackDiv.createEl('button');
                fallbackBtn.setText('改为搜索此文件');
                fallbackBtn.style.padding = '8px 16px';
                fallbackBtn.style.backgroundColor = '#007ACC';
                fallbackBtn.style.color = 'white';
                fallbackBtn.style.border = 'none';
                fallbackBtn.style.borderRadius = '4px';
                fallbackBtn.style.cursor = 'pointer';
                fallbackBtn.onclick = () => this.showSearch();
            }
        }
    }

    // 显示搜索结果
    showSearch() {
        if (!this.contentContainer) {
            console.warn('容器不存在，无法显示搜索结果');
            return;
        }

        try {
            // 清空容器并重新创建iframe结构
            this.contentContainer.empty();
            this.contentContainer.style.display = 'flex';
            this.contentContainer.style.flexDirection = 'column';
            this.contentContainer.style.height = '100%';

            // 创建加载提示
            const loadingDiv = this.contentContainer.createDiv();
            loadingDiv.setText('正在加载搜索结果...');
            loadingDiv.style.textAlign = 'center';
            loadingDiv.style.padding = '20px';
            loadingDiv.style.color = '#888888';

            // 创建 iframe
            this.iframe = this.contentContainer.createEl('iframe');
            this.iframe.setAttribute('width', '100%');
            this.iframe.setAttribute('height', '100%');
            this.iframe.setAttribute('frameborder', '0');
            this.iframe.style.flexGrow = '1';
            this.iframe.addClass('file-search-iframe');

            // 添加事件监听器
            this.iframe.addEventListener('load', () => {
                loadingDiv.remove();
            });

            this.iframe.addEventListener('error', () => {
                loadingDiv.setText('加载失败，请检查网络连接');
                loadingDiv.style.color = '#ff4444';
            });

            // 执行搜索
            this.updateSearch();
        } catch (error) {
            console.error('显示搜索结果时出错:', error);
        }
    }

    // 自定义的辅助方法，用于更新 iframe 的搜索链接
    updateSearch() {
        // 检查iframe是否存在
        if (!this.iframe) {
            console.warn('iframe 尚未创建，无法更新搜索内容');
            return;
        }

        if (!this.currentFilename) {
            console.warn('没有文件名，无法进行搜索');
            return;
        }

        try {
            // 构建搜索查询
            let searchQuery = '';
            
            if (this.currentFilepath) {
                // 如果有完整路径，使用完整路径作为搜索关键词
                // 移除文件扩展名，保留路径信息
                const pathWithoutExtension = this.currentFilepath.replace(/\.[^/.]+$/, "");
                searchQuery = pathWithoutExtension;
                console.log(`使用完整路径搜索: ${searchQuery}`);
            } else {
                // 如果没有路径信息，只使用文件名（移除扩展名）
                const nameWithoutExtension = this.currentFilename.replace(/\.[^/.]+$/, "");
                searchQuery = nameWithoutExtension;
                console.log(`使用文件名搜索: ${searchQuery}`);
            }
            
            // 对搜索查询进行 URL 编码
            const encodedQuery = encodeURIComponent(searchQuery);
            const searchUrl = `https://www.baidu.com/s?wd=${encodedQuery}`;
            
            // 设置 iframe 的 src 属性，使其加载搜索结果页面
            this.iframe.src = searchUrl;
            
            console.log(`正在搜索: ${searchQuery}`);
        } catch (error) {
            console.error('更新搜索内容时出错:', error);
            
            // 显示错误信息
            if (this.contentContainer) {
                const errorDiv = this.contentContainer.createDiv();
                errorDiv.setText(`搜索时出现错误: ${error.message}`);
                errorDiv.style.textAlign = 'center';
                errorDiv.style.padding = '20px';
                errorDiv.style.color = '#ff4444'; // 使用具体颜色值
            }
        }
    }

    // 复制预览容器中的所有文本
    copyAllText() {
        if (!this.previewContainer) {
            console.warn('预览容器不存在，无法复制文本');
            return;
        }

        try {
            // 获取预览容器中的所有文本内容
            const textContent = this.previewContainer.innerText || this.previewContainer.textContent || '';
            
            if (!textContent.trim()) {
                console.warn('没有找到可复制的文本内容');
                // 可以显示一个提示
                this.showCopyStatus('没有找到可复制的文本', false);
                return;
            }

            // 使用现代浏览器的 Clipboard API
            if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(textContent).then(() => {
                    console.log('文本已复制到剪贴板 (使用 Clipboard API)');
                    this.showCopyStatus('文本已复制到剪贴板', true);
                }).catch((error) => {
                    console.error('复制失败:', error);
                    this.fallbackCopyText(textContent);
                });
            } else {
                // 回退到传统方法
                this.fallbackCopyText(textContent);
            }
        } catch (error) {
            console.error('复制文本时出错:', error);
            this.showCopyStatus('复制失败: ' + error.message, false);
        }
    }

    // 传统的文本复制方法（回退方案）
    fallbackCopyText(text: string) {
        try {
            // 创建临时的文本区域
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            textArea.style.top = '-999999px';
            document.body.appendChild(textArea);
            
            // 选择文本
            textArea.focus();
            textArea.select();
            
            // 执行复制命令
            const successful = document.execCommand('copy');
            document.body.removeChild(textArea);
            
            if (successful) {
                console.log('文本已复制到剪贴板 (使用 execCommand)');
                this.showCopyStatus('文本已复制到剪贴板', true);
            } else {
                console.error('复制命令执行失败');
                this.showCopyStatus('复制失败，请手动选择文本复制', false);
            }
        } catch (error) {
            console.error('回退复制方法失败:', error);
            this.showCopyStatus('复制失败，请手动选择文本复制', false);
        }
    }

    // 显示复制状态提示
    showCopyStatus(message: string, success: boolean) {
        if (!this.previewContainer) return;

        // 移除之前的状态提示
        const existingStatus = this.previewContainer.querySelector('.copy-status');
        if (existingStatus) {
            existingStatus.remove();
        }

        // 创建状态提示
        const statusDiv = this.previewContainer.createDiv();
        statusDiv.addClass('copy-status');
        statusDiv.textContent = message;
        statusDiv.style.position = 'fixed';
        statusDiv.style.top = '20px';
        statusDiv.style.left = '50%';
        statusDiv.style.transform = 'translateX(-50%)';
        statusDiv.style.padding = '8px 16px';
        statusDiv.style.borderRadius = '4px';
        statusDiv.style.fontSize = '14px';
        statusDiv.style.fontWeight = '500';
        statusDiv.style.zIndex = '10000';
        statusDiv.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
        statusDiv.style.transition = 'opacity 0.3s ease';
        
        if (success) {
            statusDiv.style.backgroundColor = '#4caf50';
            statusDiv.style.color = 'white';
        } else {
            statusDiv.style.backgroundColor = '#f44336';
            statusDiv.style.color = 'white';
        }

        // 3秒后自动消失
        setTimeout(() => {
            statusDiv.style.opacity = '0';
            setTimeout(() => {
                if (statusDiv.parentNode) {
                    statusDiv.remove();
                }
            }, 300);
        }, 3000);
    }
}


// --- 主插件类 ---
// 这是插件的入口点，所有注册和初始化都在这里完成
export default class FileSearchViewPlugin extends Plugin {
	private clickHandler: (event: MouseEvent) => void;

	// 插件加载时执行的生命周期方法
	async onload() {
		try {
			console.log('正在加载 [文件搜索视图] 插件');

			// 1. 注册我们的自定义视图
			this.registerView(
				VIEW_TYPE_FILE_SEARCH,
				(leaf) => new FileSearchView(leaf)
			);
			console.log('自定义视图注册成功');

			// 2. 添加文件菜单项
			this.registerEvent(
				this.app.workspace.on('file-menu', (menu, file) => {
					if (file instanceof TFile && SUPPORTED_EXTENSIONS.includes(file.extension.toLowerCase())) {
						const ext = file.extension.toLowerCase();
						const isPreviewFile = PREVIEW_EXTENSIONS.includes(ext);
						
						menu.addItem((item) => {
							item
								.setTitle(isPreviewFile ? '预览此文档' : '搜索此文件')
								.setIcon(isPreviewFile ? 'file-text' : 'search')
								.onClick(async () => {
									console.log(`通过菜单${isPreviewFile ? '预览' : '搜索'}文件: ${file.name}`);
									await this.activateView(file);
								});
						});
					}
				})
			);

			// 3. 添加命令面板命令
			this.addCommand({
				id: 'preview-or-search-current-file',
				name: '预览/搜索当前文件',
				checkCallback: (checking: boolean) => {
					const activeFile = this.app.workspace.getActiveFile();
					if (activeFile && SUPPORTED_EXTENSIONS.includes(activeFile.extension.toLowerCase())) {
						if (!checking) {
							this.activateView(activeFile);
						}
						return true;
					}
					return false;
				}
			});

			// 5. 重写文件点击行为
			this.setupFileClickHandler();

			console.log('事件监听器注册成功');
			console.log('[文件搜索视图] 插件加载完成');
		} catch (error) {
			console.error('[文件搜索视图] 插件加载失败:', error);
		}
	}

	// 设置文件点击处理器
	setupFileClickHandler() {
		this.clickHandler = (event: MouseEvent) => {
			const target = event.target as HTMLElement;
			
			// 查找最近的文件项元素
			const fileItem = target.closest('.nav-file, .tree-item-self');
			if (!fileItem) return;

			// 获取文件路径
			const filePath = fileItem.getAttribute('data-path');
			if (!filePath) return;

			// 获取文件对象
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (!(file instanceof TFile)) return;

			// 检查文件扩展名
			if (SUPPORTED_EXTENSIONS.includes(file.extension.toLowerCase())) {
				// 阻止默认行为
				event.preventDefault();
				event.stopPropagation();
				
				console.log(`拦截文件点击: ${file.name}`);
				
				// 激活搜索视图
				this.activateView(file);
			}
		};

		// 添加事件监听器到文档
		document.addEventListener('click', this.clickHandler, true);
	}

	// 插件卸载时执行的生命周期方法
	onunload() {
		console.log('正在卸载 [文件搜索视图] 插件');
		
		// 移除点击事件监听器
		if (this.clickHandler) {
			document.removeEventListener('click', this.clickHandler, true);
		}
	}

    // 激活或更新搜索视图的辅助函数
	async activateView(file: TFile) {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		// 查找工作区中是否已经存在我们的自定义视图
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_FILE_SEARCH);

		if (leaves.length > 0) {
			// 如果已存在，就重用第一个找到的视图，避免打开多个相同的标签页
			leaf = leaves[0];
		} else {
			// 在主工作区创建一个新的标签页
			leaf = workspace.getLeaf(true); // true 表示创建新的标签页
		}

        // 设置视图的状态，把文件信息传递进去
        // 这会触发 FileSearchView 类中的 setState 方法
        await leaf.setViewState({
            type: VIEW_TYPE_FILE_SEARCH,
            active: true, // 激活这个标签页，让它显示在最前面
            state: { 
                filename: file.name,
                filepath: file.path,
                file: file
            }
        });

		// 确保我们的视图是可见的
		workspace.revealLeaf(leaf);
	}
}
