import { ItemView, Plugin, TFile, WorkspaceLeaf, ViewStateResult } from 'obsidian';

// --- 常量定义 ---

// 1. 定义我们自定义视图的唯一标识符
// 这个字符串在你的插件中必须是唯一的
export const VIEW_TYPE_FILE_SEARCH = "file-search-view";

// 2. 定义插件支持的文件后缀列表 (可自行增删)
// 后缀请使用小写
const SUPPORTED_EXTENSIONS = ['pptx', 'docx', 'xlsx', 'pdf', 'key', 'pages', 'numbers'];


// --- 自定义视图类 ---
// 这个类负责在 Obsidian 中创建一个新的标签页，并展示一个网页
class FileSearchView extends ItemView {
    // 这个属性用来存储当前正在搜索的文件名
    private currentFilename: string | null = null;
    // 存储文件路径
    private currentFilepath: string | null = null;
    // 存储iframe元素的引用
    private iframe: HTMLIFrameElement | null = null;
    // 存储容器元素的引用
    private contentContainer: HTMLElement | null = null;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    // 返回视图的唯一标识符
    getViewType(): string {
        return VIEW_TYPE_FILE_SEARCH;
    }

    // 返回显示在标签页顶部的标题文字
    getDisplayText(): string {
        // 如果有文件名，就显示文件名，否则显示默认文字
        return this.currentFilename || "文件搜索";
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
    async setState(state: { filename?: string, filepath?: string }, result: ViewStateResult): Promise<void> {
        // 检查传入的状态对象中是否包含我们需要的信息
        if (state?.filename) {
            this.currentFilename = state.filename;
            this.currentFilepath = state.filepath || null;

            // 确保视图已经初始化后再更新搜索内容
            if (this.iframe) {
                this.updateSearch();
            }
            // 如果iframe还没创建，文件信息会在onOpen中使用
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

        // 如果已经有文件名，立即更新搜索
        if (this.currentFilename) {
            this.updateSearch();
        } else {
            // 如果没有文件名，显示默认页面
            loadingDiv.setText('请选择一个文件进行搜索');
            loadingDiv.style.color = '#888888'; // 使用具体颜色值
        }
    }

    // 当视图被关闭时调用的方法
    async onClose(): Promise<void> {
        // 清理资源
        this.iframe = null;
        this.contentContainer = null;
        this.currentFilename = null;
        this.currentFilepath = null;
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
						menu.addItem((item) => {
							item
								.setTitle('搜索此文件')
								.setIcon('search')
								.onClick(async () => {
									console.log(`通过菜单搜索文件: ${file.name}`);
									await this.activateView(file);
								});
						});
					}
				})
			);

			// 3. 添加命令面板命令
			this.addCommand({
				id: 'search-current-file',
				name: '搜索当前文件',
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

			// 4. 重写文件点击行为
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
                filepath: file.path
            }
        });

		// 确保我们的视图是可见的
		workspace.revealLeaf(leaf);
	}
}
