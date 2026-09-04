import { ItemView, Notice, Plugin, TFile, WorkspaceLeaf, ViewStateResult } from 'obsidian';
import * as docxPreview from 'docx-preview';
import { init as initPptxPreview } from 'pptx-preview';
import type { PPTXPreviewer } from 'pptx-preview';
import * as XLSX from 'xlsx';

export const VIEW_TYPE_FILE_SEARCH = 'file-search-view';

const PREVIEW_EXTENSIONS = ['docx', 'pptx', 'xlsx', 'xls'];
const LEGACY_EXTENSIONS = ['doc', 'ppt'];
const OFFICE_EXTENSIONS = [...PREVIEW_EXTENSIONS, ...LEGACY_EXTENSIONS];
const MAX_EXCEL_ROWS = 200;
const MAX_EXCEL_COLUMNS = 100;

interface FileViewState {
	file?: string;
	filepath?: string;
	filename?: string;
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

class FileSearchView extends ItemView {
	private currentFile: TFile | null = null;
	private currentFilepath: string | null = null;
	private currentFilename: string | null = null;
	private renderedContentEl: HTMLElement | null = null;
	private pptxPreviewer: PPTXPreviewer | null = null;
	private renderVersion = 0;
	private opened = false;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
		this.navigation = true;
	}

	getViewType(): string {
		return VIEW_TYPE_FILE_SEARCH;
	}

	getDisplayText(): string {
		if (!this.currentFilename) return '文档预览';
		return this.isPreviewable() ? `预览: ${this.currentFilename}` : `搜索: ${this.currentFilename}`;
	}

	getIcon(): string {
		return this.isPreviewable() ? 'file-text' : 'search';
	}

	getState(): Record<string, unknown> {
		return this.currentFilepath ? { file: this.currentFilepath } : {};
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		await super.setState(state, result);

		const viewState = isRecord(state) ? state as FileViewState : {};
		const filePath = typeof viewState.file === 'string'
			? viewState.file
			: typeof viewState.filepath === 'string'
				? viewState.filepath
				: null;
		const abstractFile = filePath ? this.app.vault.getAbstractFileByPath(filePath) : null;

		this.currentFile = abstractFile instanceof TFile ? abstractFile : null;
		this.currentFilepath = this.currentFile?.path ?? filePath;
		this.currentFilename = this.currentFile?.name
			?? (typeof viewState.filename === 'string' ? viewState.filename : null);

		if (this.opened) await this.updateContent();
	}

	async onOpen(): Promise<void> {
		this.opened = true;
		this.contentEl.addClass('document-preview-view');
		await this.updateContent();
	}

	async onClose(): Promise<void> {
		this.opened = false;
		this.renderVersion += 1;
		this.destroyPptxPreviewer();
		this.renderedContentEl = null;
		this.contentEl.empty();
	}

	private getExtension(): string {
		return this.currentFilename?.split('.').pop()?.toLowerCase() ?? '';
	}

	private isPreviewable(): boolean {
		return PREVIEW_EXTENSIONS.includes(this.getExtension());
	}

	private async updateContent(): Promise<void> {
		const version = ++this.renderVersion;
		this.destroyPptxPreviewer();
		this.renderedContentEl = null;
		this.contentEl.empty();

		if (!this.currentFilename) {
			this.renderMessage('请选择一个文件', '支持 DOCX、PPTX、XLSX 和 XLS 文件。');
			return;
		}

		const extension = this.getExtension();
		if (LEGACY_EXTENSIONS.includes(extension)) {
			this.renderLegacyFormatMessage(extension);
			return;
		}

		if (!PREVIEW_EXTENSIONS.includes(extension)) {
			this.renderSearch();
			return;
		}

		if (!this.currentFile) {
			this.renderMessage('找不到文件', this.currentFilepath ?? this.currentFilename, true);
			return;
		}

		await this.renderPreview(extension, version);
	}

	private createPreviewLayout(): HTMLElement {
		const toolbar = this.contentEl.createDiv({ cls: 'document-preview-toolbar' });
		toolbar.createDiv({ cls: 'document-preview-filename', text: this.currentFilename ?? '' });

		const copyButton = toolbar.createEl('button', { cls: 'document-preview-copy', text: '复制全部文本' });
		copyButton.type = 'button';
		copyButton.addEventListener('click', () => void this.copyAllText());

		const content = this.contentEl.createDiv({ cls: 'document-preview-content' });
		this.renderedContentEl = content;
		return content;
	}

	private async renderPreview(extension: string, version: number): Promise<void> {
		const content = this.createPreviewLayout();
		const loading = content.createDiv({ cls: 'document-preview-message', text: '正在读取文档…' });

		try {
			const fileBuffer = await this.app.vault.readBinary(this.currentFile as TFile);
			if (version !== this.renderVersion) return;
			loading.remove();

			if (extension === 'docx') {
				await this.renderDocx(fileBuffer, content);
			} else if (extension === 'pptx') {
				await this.renderPptx(fileBuffer, content, version);
			} else {
				this.renderWorkbook(fileBuffer, content);
			}
		} catch (error) {
			if (version !== this.renderVersion) return;
			console.error(`无法预览 ${this.currentFilename}:`, error);
			content.empty();
			this.renderError(content, getErrorMessage(error));
		}
	}

	private async renderDocx(fileBuffer: ArrayBuffer, content: HTMLElement): Promise<void> {
		const compact = window.matchMedia?.('(max-width: 768px)').matches ?? false;
		await docxPreview.renderAsync(fileBuffer, content, content, {
			ignoreWidth: compact,
			ignoreHeight: compact,
			breakPages: !compact,
			useBase64URL: true
		});
	}

	private async renderPptx(fileBuffer: ArrayBuffer, content: HTMLElement, version: number): Promise<void> {
		const width = Math.max(320, Math.min(content.clientWidth || 960, 1200));
		const previewer = initPptxPreview(content, {
			width,
			height: Math.round(width * 9 / 16),
			mode: 'list'
		});
		this.pptxPreviewer = previewer;
		await previewer.preview(fileBuffer);

		if (version !== this.renderVersion) {
			previewer.destroy();
			if (this.pptxPreviewer === previewer) this.pptxPreviewer = null;
		}
	}

	private renderWorkbook(fileBuffer: ArrayBuffer, content: HTMLElement): void {
		const workbook = XLSX.read(fileBuffer, { type: 'array' });
		if (workbook.SheetNames.length === 0) {
			this.renderMessageIn(content, '工作簿中没有工作表');
			return;
		}

		const tabs = content.createDiv({ cls: 'excel-sheet-tabs' });
		const tableContainer = content.createDiv({ cls: 'excel-table-container' });
		const tabButtons = new Map<string, HTMLButtonElement>();

		const showSheet = (sheetName: string): void => {
			for (const [name, button] of tabButtons) {
				button.toggleClass('is-active', name === sheetName);
				button.setAttr('aria-selected', String(name === sheetName));
			}
			this.renderSheet(workbook.Sheets[sheetName], tableContainer);
		};

		for (const sheetName of workbook.SheetNames) {
			const tab = tabs.createEl('button', { cls: 'excel-sheet-tab', text: sheetName });
			tab.type = 'button';
			tab.title = sheetName;
			tab.setAttr('role', 'tab');
			tab.addEventListener('click', () => showSheet(sheetName));
			tabButtons.set(sheetName, tab);
		}

		showSheet(workbook.SheetNames[0]);
	}

	private renderSheet(worksheet: XLSX.WorkSheet, container: HTMLElement): void {
		container.empty();
		const ref = worksheet['!ref'];
		if (!ref) {
			this.renderMessageIn(container, '工作表为空');
			return;
		}

		const fullRange = XLSX.utils.decode_range(ref);
		const totalRows = fullRange.e.r - fullRange.s.r + 1;
		const totalColumns = fullRange.e.c - fullRange.s.c + 1;
		const visibleRange = {
			s: { ...fullRange.s },
			e: {
				r: Math.min(fullRange.e.r, fullRange.s.r + MAX_EXCEL_ROWS - 1),
				c: Math.min(fullRange.e.c, fullRange.s.c + MAX_EXCEL_COLUMNS - 1)
			}
		};
		const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
			header: 1,
			defval: '',
			raw: false,
			range: visibleRange
		});
		const visibleColumns = visibleRange.e.c - visibleRange.s.c + 1;

		const tableScroller = container.createDiv({ cls: 'excel-table-scroller' });
		const table = tableScroller.createEl('table', { cls: 'excel-preview-table' });
		const headerRow = table.createEl('thead').createEl('tr');
		headerRow.createEl('th', { cls: 'excel-row-number', text: '' });
		for (let column = 0; column < visibleColumns; column += 1) {
			headerRow.createEl('th', { text: XLSX.utils.encode_col(visibleRange.s.c + column) });
		}

		const body = table.createEl('tbody');
		rows.forEach((row, rowIndex) => {
			const tr = body.createEl('tr');
			tr.createEl('th', {
				cls: 'excel-row-number',
				text: String(visibleRange.s.r + rowIndex + 1)
			});
			for (let column = 0; column < visibleColumns; column += 1) {
				const value = row[column];
				tr.createEl('td', { text: value == null ? '' : String(value) });
			}
		});

		const summary = container.createDiv({ cls: 'excel-preview-summary' });
		summary.setText(`显示 ${rows.length}/${totalRows} 行，${visibleColumns}/${totalColumns} 列`);
	}

	private renderLegacyFormatMessage(extension: string): void {
		const modernExtension = extension === 'doc' ? 'docx' : 'pptx';
		const card = this.contentEl.createDiv({ cls: 'document-preview-card' });
		card.createEl('h3', { text: `暂不能读取 .${extension} 文件` });
		card.createEl('p', { text: `请先用 Office 或 WPS 另存为 .${modernExtension}，再回到 Obsidian 打开。` });
		this.addSearchLink(card);
	}

	private renderSearch(): void {
		const card = this.contentEl.createDiv({ cls: 'document-preview-card' });
		card.createEl('h3', { text: this.currentFilename ?? '搜索文件' });
		card.createEl('p', { text: '该文件类型没有内置预览，可搜索同名内容。' });
		this.addSearchLink(card);
	}

	private addSearchLink(container: HTMLElement): void {
		const query = this.currentFile?.basename
			?? this.currentFilename?.replace(/\.[^/.]+$/, '')
			?? '';
		const link = container.createEl('a', { cls: 'document-preview-search-link', text: '在百度搜索' });
		link.setAttr('href', `https://www.baidu.com/s?wd=${encodeURIComponent(query)}`);
		link.setAttr('target', '_blank');
		link.setAttr('rel', 'noopener noreferrer');
	}

	private renderError(container: HTMLElement, detail: string): void {
		const card = container.createDiv({ cls: 'document-preview-card is-error' });
		card.createEl('h3', { text: '文档预览失败' });
		card.createEl('p', { text: detail });
		this.addSearchLink(card);
	}

	private renderMessage(title: string, detail: string, isError = false): void {
		const card = this.contentEl.createDiv({ cls: `document-preview-card${isError ? ' is-error' : ''}` });
		card.createEl('h3', { text: title });
		card.createEl('p', { text: detail });
	}

	private renderMessageIn(container: HTMLElement, message: string): void {
		container.createDiv({ cls: 'document-preview-message', text: message });
	}

	private async copyAllText(): Promise<void> {
		const text = this.renderedContentEl?.innerText.trim() ?? '';
		if (!text) {
			new Notice('当前预览中没有可复制的文本');
			return;
		}

		try {
			await navigator.clipboard.writeText(text);
			new Notice('已复制预览文本');
		} catch {
			if (this.fallbackCopyText(text)) {
				new Notice('已复制预览文本');
			} else {
				new Notice('复制失败，请手动选择文本');
			}
		}
	}

	private fallbackCopyText(text: string): boolean {
		const textArea = document.body.createEl('textarea');
		textArea.value = text;
		textArea.addClass('document-preview-copy-source');
		textArea.focus();
		textArea.select();

		try {
			return document.execCommand('copy');
		} finally {
			textArea.remove();
		}
	}

	private destroyPptxPreviewer(): void {
		if (!this.pptxPreviewer) return;
		try {
			this.pptxPreviewer.destroy();
		} catch (error) {
			console.debug('清理 PowerPoint 预览器时出现问题:', error);
		}
		this.pptxPreviewer = null;
	}
}

export default class FileSearchViewPlugin extends Plugin {
	async onload(): Promise<void> {
		this.registerView(VIEW_TYPE_FILE_SEARCH, (leaf) => new FileSearchView(leaf));
		this.registerExtensions(OFFICE_EXTENSIONS, VIEW_TYPE_FILE_SEARCH);

		this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
			if (!(file instanceof TFile)) return;
			const isOfficeFile = OFFICE_EXTENSIONS.includes(file.extension.toLowerCase());
			menu.addItem((item) => item
				.setTitle(isOfficeFile ? '预览此文档' : '搜索此文件')
				.setIcon(isOfficeFile ? 'file-text' : 'search')
				.onClick(() => void this.activateView(file))
			);
		}));

		this.addCommand({
			id: 'preview-or-search-current-file',
			name: '预览或搜索当前文件',
			checkCallback: (checking) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (!activeFile) return false;
				if (!checking) void this.activateView(activeFile);
				return true;
			}
		});
	}

	private async activateView(file: TFile): Promise<void> {
		const { workspace } = this.app;
		const existingLeaf = workspace.getLeavesOfType(VIEW_TYPE_FILE_SEARCH)[0];
		const leaf = existingLeaf ?? workspace.getLeaf(true);

		await leaf.setViewState({
			type: VIEW_TYPE_FILE_SEARCH,
			active: true,
			state: { file: file.path }
		});
		workspace.revealLeaf(leaf);
	}
}
