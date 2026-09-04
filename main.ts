import { ItemView, Notice, Platform, Plugin, TFile, WorkspaceLeaf, ViewStateResult } from 'obsidian';
import { PdfAdapter } from './pdf-adapter';
import { PresentationAdapter } from './presentation-adapter';
import { AdapterOptions, PreviewAdapter } from './preview-adapter';
import { WordAdapter } from './word-adapter';
import { WorkbookAdapter } from './workbook-adapter';

export const VIEW_TYPE_FILE_SEARCH = 'file-search-view';

const PREVIEW_EXTENSIONS = ['docx', 'pptx', 'xlsx', 'xls', 'pdf'];
const LEGACY_EXTENSIONS = ['doc', 'ppt'];
const SUPPORTED_EXTENSIONS = [...PREVIEW_EXTENSIONS, ...LEGACY_EXTENSIONS];
const REGISTERED_EXTENSIONS = SUPPORTED_EXTENSIONS.filter((extension) => extension !== 'pdf');

interface FileViewState {
	file?: string;
	filepath?: string;
	filename?: string;
}

interface ToolbarElements {
	open: HTMLButtonElement;
	edit: HTMLButtonElement;
	save: HTMLButtonElement;
	cancel: HTMLButtonElement;
	copy: HTMLButtonElement;
}

interface AppWithDefaultOpen {
	openWithDefaultApp(path: string): Promise<void>;
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
	private adapter: PreviewAdapter | null = null;
	private content: HTMLElement | null = null;
	private toolbar: ToolbarElements | null = null;
	private renderVersion = 0;
	private loadedMtime = 0;
	private loadedSize = 0;
	private opened = false;
	private editing = false;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
		this.navigation = true;
	}

	getViewType(): string {
		return VIEW_TYPE_FILE_SEARCH;
	}

	getDisplayText(): string {
		return this.currentFilename ? `${this.editing ? '编辑' : '查看'}: ${this.currentFilename}` : '文档查看';
	}

	getIcon(): string {
		return this.editing ? 'edit-3' : 'file-text';
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
		this.destroyAdapter();
		this.content = null;
		this.toolbar = null;
		this.contentEl.empty();
	}

	private getExtension(): string {
		return this.currentFilename?.split('.').pop()?.toLowerCase() ?? '';
	}

	private async updateContent(): Promise<void> {
		const version = ++this.renderVersion;
		this.destroyAdapter();
		this.editing = false;
		this.content = null;
		this.toolbar = null;
		this.contentEl.empty();

		if (!this.currentFilename) {
			this.renderMessage('请选择一个文件', '支持 DOCX、PPTX、XLSX、XLS 和 PDF 文件。');
			return;
		}
		const extension = this.getExtension();
		if (!SUPPORTED_EXTENSIONS.includes(extension)) {
			this.renderMessage('不支持该文件', this.currentFilename, true);
			return;
		}
		if (!this.currentFile) {
			this.renderMessage('找不到文件', this.currentFilepath ?? this.currentFilename, true);
			return;
		}

		const content = this.createPreviewLayout();
		if (this.currentFilename.startsWith('~$')) {
			this.renderMessageIn(content, '这是 Office 临时文件', '请打开不以 ~$ 开头的原文件。关闭 Office 后，这个临时文件通常会自动消失。');
			return;
		}
		if (LEGACY_EXTENSIONS.includes(extension)) {
			this.renderLegacyFormatMessage(content, extension);
			return;
		}
		content.createDiv({ cls: 'document-preview-message', text: '正在读取文档…' });
		try {
			const data = await this.app.vault.readBinary(this.currentFile);
			const adapter = await this.createAdapter(extension, data);
			if (version !== this.renderVersion) {
				adapter.destroy();
				return;
			}
			this.adapter = adapter;
			this.loadedMtime = this.currentFile.stat.mtime;
			this.loadedSize = this.currentFile.stat.size;
			this.updateToolbar();
			await this.renderPreview(version);
		} catch (error) {
			if (version !== this.renderVersion) return;
			console.error(`无法打开 ${this.currentFilename}:`, error);
			content.empty();
			this.renderError(content, `无法读取此文件。文件可能已损坏，或内容与 .${extension} 格式不符。可以尝试使用默认应用打开。`);
		}
	}

	private createPreviewLayout(): HTMLElement {
		const toolbar = this.contentEl.createDiv({ cls: 'document-preview-toolbar' });
		toolbar.createDiv({ cls: 'document-preview-filename', text: this.currentFilename ?? '' });
		const open = this.toolbarButton(toolbar, '使用默认应用打开', () => void this.openWithDefaultApp());
		const edit = this.toolbarButton(toolbar, '编辑', () => void this.enterEditMode());
		const save = this.toolbarButton(toolbar, '保存', () => void this.save());
		const cancel = this.toolbarButton(toolbar, '取消', () => void this.cancel());
		const copy = this.toolbarButton(toolbar, '复制全部文本', () => void this.copyAllText());
		this.toolbar = { open, edit, save, cancel, copy };
		const content = this.contentEl.createDiv({ cls: 'document-preview-content' });
		this.content = content;
		this.updateToolbar();
		return content;
	}

	private async renderPreview(version: number): Promise<void> {
		if (!this.adapter || !this.content) return;
		this.content.empty();
		this.content.createDiv({ cls: 'document-preview-message', text: '正在生成预览…' });
		try {
			this.content.empty();
			await this.adapter.renderPreview(this.content);
			if (version !== this.renderVersion) return;
		} catch (error) {
			if (version !== this.renderVersion) return;
			this.content.empty();
			this.renderError(this.content, getErrorMessage(error));
			throw error;
		}
	}

	private async enterEditMode(): Promise<void> {
		if (!this.adapter || !this.content || this.editing) return;
		if (!this.adapter.canEdit) {
			new Notice(this.adapter.editReason ?? '该文件只能预览');
			return;
		}
		const version = ++this.renderVersion;
		this.editing = true;
		this.updateToolbar();
		this.content.empty();
		try {
			await this.adapter.renderEditor(this.content);
			if (version !== this.renderVersion) return;
		} catch (error) {
			this.editing = false;
			this.updateToolbar();
			this.content.empty();
			this.renderError(this.content, getErrorMessage(error));
		}
	}

	private async save(): Promise<void> {
		if (!this.adapter || !this.currentFile || !this.content || !this.editing) return;
		if (!await this.sourceUnchanged()) {
			new Notice('源文件已发生变化，请取消编辑后重新打开');
			return;
		}

		this.setToolbarDisabled(true);
		try {
			const data = await this.adapter.serialize();
			const validation = await this.createAdapter(this.getExtension(), data);
			validation.destroy();
			if (!await this.sourceUnchanged()) throw new Error('源文件已发生变化，请取消编辑后重新打开');
			await this.app.vault.modifyBinary(this.currentFile, data);
			const saved = await this.app.vault.readBinary(this.currentFile);
			const replacement = await this.createAdapter(this.getExtension(), saved);
			this.destroyAdapter();
			this.adapter = replacement;
			this.loadedMtime = this.currentFile.stat.mtime;
			this.loadedSize = this.currentFile.stat.size;
			this.editing = false;
			const version = ++this.renderVersion;
			this.updateToolbar();
			await this.renderPreview(version);
			new Notice('文档已保存');
		} catch (error) {
			console.error(`无法保存 ${this.currentFilename}:`, error);
			new Notice(`保存失败：${getErrorMessage(error)}`);
		} finally {
			this.setToolbarDisabled(false);
			this.updateToolbar();
		}
	}

	private async cancel(): Promise<void> {
		if (!this.currentFile || !this.content || !this.editing) return;
		const version = ++this.renderVersion;
		this.setToolbarDisabled(true);
		try {
			const data = await this.app.vault.readBinary(this.currentFile);
			const replacement = await this.createAdapter(this.getExtension(), data);
			this.destroyAdapter();
			this.adapter = replacement;
			this.loadedMtime = this.currentFile.stat.mtime;
			this.loadedSize = this.currentFile.stat.size;
			this.editing = false;
			this.updateToolbar();
			await this.renderPreview(version);
		} catch (error) {
			this.content.empty();
			this.renderError(this.content, getErrorMessage(error));
		} finally {
			this.setToolbarDisabled(false);
			this.updateToolbar();
		}
	}

	private async createAdapter(extension: string, data: ArrayBuffer): Promise<PreviewAdapter> {
		const options: AdapterOptions = {
			extension,
			fileName: this.currentFilename ?? '',
			mobile: Platform.isMobile || (window.matchMedia?.('(max-width: 768px)').matches ?? false)
		};
		if (extension === 'docx') return WordAdapter.create(data, options);
		if (extension === 'pptx') return PresentationAdapter.create(data, options);
		if (extension === 'xlsx' || extension === 'xls') return WorkbookAdapter.create(data, options);
		if (extension === 'pdf') return new PdfAdapter(data);
		throw new Error(`不支持 .${extension} 文件`);
	}

	private updateToolbar(): void {
		if (!this.toolbar) return;
		const hasAdapter = Boolean(this.adapter);
		this.toolbar.open.toggle(!this.editing && !this.currentFilename?.startsWith('~$'));
		this.toolbar.edit.toggle(!this.editing && hasAdapter);
		this.toolbar.copy.toggle(!this.editing && hasAdapter);
		this.toolbar.save.toggle(this.editing);
		this.toolbar.cancel.toggle(this.editing);
		const editable = this.adapter?.canEdit ?? false;
		this.toolbar.open.title = '使用系统默认应用打开原文件';
		this.toolbar.edit.toggleClass('is-unavailable', Boolean(this.adapter && !editable));
		this.toolbar.edit.setAttr('aria-disabled', String(Boolean(this.adapter && !editable)));
		this.toolbar.edit.title = editable ? '进入简化编辑模式' : this.adapter?.editReason ?? '正在读取文件';
	}

	private setToolbarDisabled(disabled: boolean): void {
		if (!this.toolbar) return;
		this.toolbar.open.disabled = disabled;
		this.toolbar.edit.disabled = disabled;
		this.toolbar.save.disabled = disabled;
		this.toolbar.cancel.disabled = disabled;
		this.toolbar.copy.disabled = disabled;
	}

	private renderLegacyFormatMessage(container: HTMLElement, extension: string): void {
		const modernExtension = extension === 'doc' ? 'docx' : 'pptx';
		const card = container.createDiv({ cls: 'document-preview-card' });
		card.createEl('h3', { text: `暂不能读取 .${extension} 文件` });
		card.createEl('p', { text: `可以使用默认应用打开，或先转换为 .${modernExtension}。插件不会上传文件。` });
	}

	private renderError(container: HTMLElement, detail: string): void {
		const card = container.createDiv({ cls: 'document-preview-card is-error' });
		card.createEl('h3', { text: '无法预览此文件' });
		card.createEl('p', { text: detail });
	}

	private renderMessage(title: string, detail: string, isError = false): void {
		this.renderMessageIn(this.contentEl, title, detail, isError);
	}

	private renderMessageIn(container: HTMLElement, title: string, detail: string, isError = false): void {
		const card = container.createDiv({ cls: `document-preview-card${isError ? ' is-error' : ''}` });
		card.createEl('h3', { text: title });
		card.createEl('p', { text: detail });
	}

	private async openWithDefaultApp(): Promise<void> {
		if (!this.currentFile) return;
		const app = this.app as typeof this.app & Partial<AppWithDefaultOpen>;
		if (typeof app.openWithDefaultApp !== 'function') {
			new Notice('当前版本的 Obsidian 不支持调用默认应用');
			return;
		}
		try {
			await app.openWithDefaultApp(this.currentFile.path);
		} catch (error) {
			new Notice(`无法使用默认应用打开：${getErrorMessage(error)}`);
		}
	}

	private async copyAllText(): Promise<void> {
		const text = (await this.adapter?.getText())?.trim() ?? '';
		if (!text) {
			new Notice('当前文档中没有可复制的文本');
			return;
		}
		try {
			await navigator.clipboard.writeText(text);
			new Notice('已复制文档文本');
		} catch {
			if (this.fallbackCopyText(text)) new Notice('已复制文档文本');
			else new Notice('复制失败，请手动选择文本');
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

	private toolbarButton(container: HTMLElement, label: string, action: () => void): HTMLButtonElement {
		const button = container.createEl('button', { text: label });
		button.type = 'button';
		button.addEventListener('click', action);
		return button;
	}

	private async sourceUnchanged(): Promise<boolean> {
		if (!this.currentFile) return false;
		const stat = await this.app.vault.adapter.stat(this.currentFile.path);
		return Boolean(stat && stat.mtime === this.loadedMtime && stat.size === this.loadedSize);
	}

	private destroyAdapter(): void {
		this.adapter?.destroy();
		this.adapter = null;
	}
}

export default class FileSearchViewPlugin extends Plugin {
	private readonly replacingPdfLeaves = new WeakSet<WorkspaceLeaf>();

	async onload(): Promise<void> {
		this.registerView(VIEW_TYPE_FILE_SEARCH, (leaf) => new FileSearchView(leaf));
		this.registerExtensions(REGISTERED_EXTENSIONS, VIEW_TYPE_FILE_SEARCH);
		this.registerEvent(this.app.workspace.on('file-open', (file) => {
			if (!(file instanceof TFile) || file.extension.toLowerCase() !== 'pdf') return;
			window.setTimeout(() => void this.replacePdfViews(file.path), 0);
		}));
		this.registerEvent(this.app.workspace.on('layout-change', () => void this.replacePdfViews()));

		this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
			if (!(file instanceof TFile) || !SUPPORTED_EXTENSIONS.includes(file.extension.toLowerCase())) return;
			menu.addItem((item) => item
				.setTitle('用 Show Me Anything 打开')
				.setIcon('file-text')
				.onClick(() => void this.activateView(file))
			);
		}));

		this.addCommand({
			id: 'open-current-office-file',
			name: '打开当前 Office 或 PDF 文件',
			checkCallback: (checking) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (!activeFile || !SUPPORTED_EXTENSIONS.includes(activeFile.extension.toLowerCase())) return false;
				if (!checking) void this.activateView(activeFile);
				return true;
			}
		});
	}

	private async activateView(file: TFile): Promise<void> {
		const leaf = this.app.workspace.getLeaf(true);
		await leaf.setViewState({
			type: VIEW_TYPE_FILE_SEARCH,
			active: true,
			state: { file: file.path }
		});
		this.app.workspace.revealLeaf(leaf);
	}

	private async replacePdfViews(filePath?: string): Promise<void> {
		const replacements = this.app.workspace.getLeavesOfType('pdf').map(async (leaf) => {
			if (this.replacingPdfLeaves.has(leaf)) return;
			const state = leaf.getViewState().state;
			const path = isRecord(state) && typeof state.file === 'string' ? state.file : null;
			if (!path || (filePath && path !== filePath)) return;
			this.replacingPdfLeaves.add(leaf);
			try {
				await leaf.setViewState({
					type: VIEW_TYPE_FILE_SEARCH,
					active: true,
					state: { file: path }
				});
			} finally {
				this.replacingPdfLeaves.delete(leaf);
			}
		});
		await Promise.all(replacements);
	}
}
