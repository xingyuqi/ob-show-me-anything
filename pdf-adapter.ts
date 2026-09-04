import {
	getDocument,
	GlobalWorkerOptions,
	TextLayer
} from 'pdfjs-dist/legacy/build/pdf.mjs';
import type {
	PDFDocumentLoadingTask,
	PDFDocumentProxy,
	RenderTask
} from 'pdfjs-dist/types/src/pdf';
import workerSource from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?raw';
import { PreviewAdapter } from './preview-adapter';

interface OutlineItem {
	title: string;
	dest: string | unknown[] | null;
	items: OutlineItem[];
}

interface PageRender {
	task: RenderTask;
	textLayer?: TextLayer;
}

let workerUrl: string | null = null;

function configureWorker(): void {
	if (!workerUrl) {
		workerUrl = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
	}
	GlobalWorkerOptions.workerSrc = workerUrl;
}

export class PdfAdapter implements PreviewAdapter {
	readonly canEdit = false;
	readonly editReason = 'PDF 仅支持预览';
	private loadingTask: PDFDocumentLoadingTask | null = null;
	private pdf: PDFDocumentProxy | null = null;
	private root: HTMLElement | null = null;
	private viewportEl: HTMLElement | null = null;
	private pagesEl: HTMLElement | null = null;
	private sidebarEl: HTMLElement | null = null;
	private pageInput: HTMLInputElement | null = null;
	private pageTotal: HTMLElement | null = null;
	private searchInput: HTMLInputElement | null = null;
	private searchStatus: HTMLElement | null = null;
	private observer: IntersectionObserver | null = null;
	private visibilityObserver: IntersectionObserver | null = null;
	private thumbnailObserver: IntersectionObserver | null = null;
	private readonly pageVisibility = new Map<number, number>();
	private readonly pageElements = new Map<number, HTMLElement>();
	private readonly thumbnailElements = new Map<number, HTMLElement>();
	private readonly renders = new Map<number, PageRender>();
	private readonly pageText = new Map<number, string>();
	private scale = 1;
	private rotation = 0;
	private currentPage = 1;
	private continuous = true;
	private searchResults: number[] = [];
	private searchResultIndex = -1;
	private searchVersion = 0;
	private destroyed = false;

	constructor(private readonly data: ArrayBuffer) {
		configureWorker();
	}

	async renderPreview(container: HTMLElement): Promise<void> {
		this.destroyed = false;
		container.addClass('is-pdf-content');
		this.root = container.createDiv({ cls: 'pdf-viewer' });
		this.createToolbar(this.root);
		const body = this.root.createDiv({ cls: 'pdf-viewer-body' });
		this.sidebarEl = body.createEl('aside', { cls: 'pdf-sidebar' });
		this.viewportEl = body.createDiv({ cls: 'pdf-viewport' });
		this.pagesEl = this.viewportEl.createDiv({ cls: 'pdf-pages' });

		this.loadingTask = getDocument({
			data: new Uint8Array(this.data.slice(0)),
			isEvalSupported: false,
			useWorkerFetch: false
		});
		this.pdf = await this.loadingTask.promise;
		if (this.destroyed) return;
		if (this.pageTotal) this.pageTotal.setText(`/ ${this.pdf.numPages}`);
		if (this.pageInput) this.pageInput.max = String(this.pdf.numPages);
		await this.fitWidth();
		await this.buildPages();
		await this.showThumbnails();
	}

	async renderEditor(_container: HTMLElement): Promise<void> {
		throw new Error(this.editReason);
	}

	async serialize(): Promise<ArrayBuffer> {
		throw new Error(this.editReason);
	}

	async getText(): Promise<string> {
		if (!this.pdf) return '';
		const text: string[] = [];
		for (let pageNumber = 1; pageNumber <= this.pdf.numPages; pageNumber += 1) {
			text.push(await this.readPageText(pageNumber));
		}
		return text.join('\n\n');
	}

	destroy(): void {
		this.destroyed = true;
		this.searchVersion += 1;
		this.observer?.disconnect();
		this.visibilityObserver?.disconnect();
		this.thumbnailObserver?.disconnect();
		this.observer = null;
		this.visibilityObserver = null;
		this.thumbnailObserver = null;
		this.cancelRenders();
		void this.loadingTask?.destroy();
		this.loadingTask = null;
		this.pdf = null;
		this.root = null;
		this.viewportEl = null;
		this.pagesEl = null;
		this.sidebarEl = null;
		this.pageElements.clear();
		this.thumbnailElements.clear();
		this.pageText.clear();
	}

	private createToolbar(container: HTMLElement): void {
		const toolbar = container.createDiv({ cls: 'pdf-toolbar' });
		this.button(toolbar, '缩略图', () => void this.showThumbnails());
		this.button(toolbar, '目录', () => void this.showOutline());
		this.button(toolbar, '上一页', () => void this.goToPage(this.currentPage - 1));
		this.pageInput = toolbar.createEl('input');
		this.pageInput.type = 'number';
		this.pageInput.min = '1';
		this.pageInput.value = '1';
		this.pageInput.setAttr('aria-label', '页码');
		this.pageInput.addEventListener('change', () => void this.goToPage(Number(this.pageInput?.value)));
		this.pageTotal = toolbar.createSpan({ text: '/ 0' });
		this.button(toolbar, '下一页', () => void this.goToPage(this.currentPage + 1));
		this.button(toolbar, '缩小', () => void this.changeScale(this.scale / 1.2));
		this.button(toolbar, '放大', () => void this.changeScale(this.scale * 1.2));
		this.button(toolbar, '适合宽度', () => void this.fitWidth());
		this.button(toolbar, '旋转', () => void this.rotate());
		this.button(toolbar, '连续', (button) => {
			this.continuous = !this.continuous;
			button.setText(this.continuous ? '连续' : '单页');
			void this.buildPages();
		});

		const search = toolbar.createDiv({ cls: 'pdf-search' });
		this.searchInput = search.createEl('input');
		this.searchInput.type = 'search';
		this.searchInput.placeholder = '搜索文字';
		this.searchInput.setAttr('aria-label', '搜索 PDF 文字');
		this.searchInput.addEventListener('keydown', (event) => {
			if (event.key === 'Enter') void this.search(this.searchInput?.value ?? '');
		});
		this.button(search, '查找', () => void this.search(this.searchInput?.value ?? ''));
		this.button(search, '上一个', () => void this.moveSearchResult(-1));
		this.button(search, '下一个', () => void this.moveSearchResult(1));
		this.searchStatus = search.createSpan({ cls: 'pdf-search-status' });

		this.button(toolbar, '全屏', () => void this.root?.requestFullscreen());
		this.button(toolbar, '打印', () => this.print());
	}

	private async buildPages(): Promise<void> {
		if (!this.pdf || !this.pagesEl || !this.viewportEl) return;
		this.observer?.disconnect();
		this.visibilityObserver?.disconnect();
		this.cancelRenders();
		this.pagesEl.empty();
		this.pageElements.clear();
		this.pageVisibility.clear();

		const pageNumbers = this.continuous
			? Array.from({ length: this.pdf.numPages }, (_, index) => index + 1)
			: [this.currentPage];
		const firstPage = await this.pdf.getPage(this.currentPage);
		const defaultViewport = firstPage.getViewport({ scale: this.scale, rotation: this.rotation });

		for (const pageNumber of pageNumbers) {
			const wrapper = this.pagesEl.createDiv({ cls: 'pdf-page' });
			wrapper.dataset.page = String(pageNumber);
			wrapper.style.width = `${defaultViewport.width}px`;
			wrapper.style.height = `${defaultViewport.height}px`;
			wrapper.createDiv({ cls: 'pdf-page-loading', text: `第 ${pageNumber} 页` });
			this.pageElements.set(pageNumber, wrapper);
		}

		this.observer = new IntersectionObserver((entries) => {
			for (const entry of entries) {
				if (!entry.isIntersecting) continue;
				const pageNumber = Number((entry.target as HTMLElement).dataset.page);
				void this.renderPage(pageNumber);
			}
		}, { root: this.viewportEl, rootMargin: '900px 0px' });
		this.visibilityObserver = new IntersectionObserver((entries) => {
			for (const entry of entries) {
				const pageNumber = Number((entry.target as HTMLElement).dataset.page);
				this.pageVisibility.set(pageNumber, entry.isIntersecting ? entry.intersectionRatio : 0);
			}
			let visiblePage = this.currentPage;
			let visibleRatio = 0;
			for (const [pageNumber, ratio] of this.pageVisibility) {
				if (ratio > visibleRatio) {
					visiblePage = pageNumber;
					visibleRatio = ratio;
				}
			}
			if (visibleRatio > 0) this.setCurrentPage(visiblePage);
		}, { root: this.viewportEl, threshold: [0, 0.25, 0.5, 0.75, 1] });
		for (const wrapper of this.pageElements.values()) {
			this.observer.observe(wrapper);
			this.visibilityObserver.observe(wrapper);
		}
		await this.renderPage(this.currentPage);
	}

	private async renderPage(pageNumber: number): Promise<void> {
		if (!this.pdf || this.destroyed || this.renders.has(pageNumber)) return;
		const wrapper = this.pageElements.get(pageNumber);
		if (!wrapper || wrapper.dataset.rendered === `${this.scale}:${this.rotation}`) return;
		const page = await this.pdf.getPage(pageNumber);
		if (this.destroyed || !wrapper.isConnected) return;
		const viewport = page.getViewport({ scale: this.scale, rotation: this.rotation });
		wrapper.empty();
		wrapper.style.width = `${viewport.width}px`;
		wrapper.style.height = `${viewport.height}px`;

		const canvas = wrapper.createEl('canvas');
		const context = canvas.getContext('2d');
		if (!context) throw new Error('浏览器不支持 Canvas 2D');
		const outputScale = Math.min(window.devicePixelRatio || 1, 2);
		canvas.width = Math.floor(viewport.width * outputScale);
		canvas.height = Math.floor(viewport.height * outputScale);
		canvas.style.width = `${viewport.width}px`;
		canvas.style.height = `${viewport.height}px`;
		const task = page.render({
			canvasContext: context,
			viewport,
			transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0]
		});
		const current: PageRender = { task };
		this.renders.set(pageNumber, current);
		try {
			await task.promise;
			if (this.destroyed || !wrapper.isConnected) return;
			const textContent = await page.getTextContent();
			const textLayerEl = wrapper.createDiv({ cls: 'pdf-text-layer textLayer' });
			const textLayer = new TextLayer({ textContentSource: textContent, container: textLayerEl, viewport });
			current.textLayer = textLayer;
			await textLayer.render();
			this.pageText.set(pageNumber, textLayer.textContentItemsStr.join(' '));
			wrapper.dataset.rendered = `${this.scale}:${this.rotation}`;
			this.highlightPage(pageNumber, this.searchInput?.value ?? '');
		} catch (error) {
			if (!(error instanceof Error) || error.name !== 'RenderingCancelledException') throw error;
		} finally {
			if (this.renders.get(pageNumber) === current) this.renders.delete(pageNumber);
		}
	}

	private async showThumbnails(): Promise<void> {
		if (!this.pdf || !this.sidebarEl) return;
		this.thumbnailObserver?.disconnect();
		this.sidebarEl.empty();
		this.sidebarEl.createDiv({ cls: 'pdf-sidebar-title', text: '页面' });
		this.thumbnailElements.clear();
		for (let pageNumber = 1; pageNumber <= this.pdf.numPages; pageNumber += 1) {
			const item = this.sidebarEl.createEl('button', { cls: 'pdf-thumbnail' });
			item.type = 'button';
			item.dataset.page = String(pageNumber);
			item.createDiv({ cls: 'pdf-thumbnail-canvas', text: String(pageNumber) });
			item.createSpan({ text: String(pageNumber) });
			item.addEventListener('click', () => void this.goToPage(pageNumber));
			this.thumbnailElements.set(pageNumber, item);
		}
		this.thumbnailObserver = new IntersectionObserver((entries) => {
			for (const entry of entries) {
				if (entry.isIntersecting) void this.renderThumbnail(Number((entry.target as HTMLElement).dataset.page));
			}
		}, { root: this.sidebarEl, rootMargin: '400px 0px' });
		for (const item of this.thumbnailElements.values()) this.thumbnailObserver.observe(item);
	}

	private async renderThumbnail(pageNumber: number): Promise<void> {
		if (!this.pdf || this.destroyed) return;
		const item = this.thumbnailElements.get(pageNumber);
		if (!item || item.dataset.rendered === 'true') return;
		const page = await this.pdf.getPage(pageNumber);
		const base = page.getViewport({ scale: 1, rotation: this.rotation });
		const viewport = page.getViewport({ scale: 120 / base.width, rotation: this.rotation });
		const canvas = document.createElement('canvas');
		const context = canvas.getContext('2d');
		if (!context) return;
		canvas.width = Math.floor(viewport.width);
		canvas.height = Math.floor(viewport.height);
		await page.render({ canvasContext: context, viewport }).promise;
		const host = item.querySelector('.pdf-thumbnail-canvas');
		if (host && item.isConnected) {
			host.replaceChildren(canvas);
			item.dataset.rendered = 'true';
		}
	}

	private async showOutline(): Promise<void> {
		if (!this.pdf || !this.sidebarEl) return;
		this.thumbnailObserver?.disconnect();
		this.sidebarEl.empty();
		this.sidebarEl.createDiv({ cls: 'pdf-sidebar-title', text: '目录' });
		const outline = await this.pdf.getOutline() as OutlineItem[] | null;
		if (!outline?.length) {
			this.sidebarEl.createDiv({ cls: 'document-preview-message', text: '该 PDF 没有目录' });
			return;
		}
		this.renderOutlineItems(outline, this.sidebarEl, 0);
	}

	private renderOutlineItems(items: OutlineItem[], container: HTMLElement, level: number): void {
		for (const item of items) {
			const button = container.createEl('button', { cls: 'pdf-outline-item', text: item.title || '未命名条目' });
			button.type = 'button';
			button.style.paddingInlineStart = `${10 + level * 14}px`;
			button.addEventListener('click', () => void this.goToDestination(item.dest));
			if (item.items?.length) this.renderOutlineItems(item.items, container, level + 1);
		}
	}

	private async goToDestination(destination: string | unknown[] | null): Promise<void> {
		if (!this.pdf || !destination) return;
		const resolved = typeof destination === 'string'
			? await this.pdf.getDestination(destination)
			: destination;
		if (!resolved?.length) return;
		const target = resolved[0];
		if (typeof target === 'number') {
			await this.goToPage(target + 1);
			return;
		}
		if (typeof target === 'object' && target !== null) {
			const pageIndex = await this.pdf.getPageIndex(target as { num: number; gen: number });
			await this.goToPage(pageIndex + 1);
		}
	}

	private async goToPage(pageNumber: number): Promise<void> {
		if (!this.pdf || !Number.isFinite(pageNumber)) return;
		const target = Math.max(1, Math.min(this.pdf.numPages, Math.round(pageNumber)));
		this.setCurrentPage(target);
		if (!this.continuous) {
			await this.buildPages();
			return;
		}
		await this.renderPage(target);
		this.pageElements.get(target)?.scrollIntoView({ block: 'start' });
	}

	private setCurrentPage(pageNumber: number): void {
		this.currentPage = pageNumber;
		if (this.pageInput) this.pageInput.value = String(pageNumber);
		for (const [number, thumbnail] of this.thumbnailElements) {
			thumbnail.toggleClass('is-active', number === pageNumber);
		}
	}

	private async fitWidth(): Promise<void> {
		if (!this.pdf || !this.viewportEl) return;
		const page = await this.pdf.getPage(this.currentPage);
		const viewport = page.getViewport({ scale: 1, rotation: this.rotation });
		const available = Math.max(260, this.viewportEl.clientWidth - 36);
		await this.changeScale(Math.min(3, Math.max(0.25, available / viewport.width)));
	}

	private async changeScale(scale: number): Promise<void> {
		this.scale = Math.min(4, Math.max(0.25, scale));
		if (this.pdf && this.pagesEl) await this.buildPages();
	}

	private async rotate(): Promise<void> {
		this.rotation = (this.rotation + 90) % 360;
		for (const item of this.thumbnailElements.values()) item.dataset.rendered = '';
		if (this.pdf && this.pagesEl) await this.buildPages();
	}

	private async search(query: string): Promise<void> {
		const normalized = query.trim().toLocaleLowerCase();
		const version = ++this.searchVersion;
		this.searchResults = [];
		this.searchResultIndex = -1;
		if (!normalized || !this.pdf) {
			this.updateSearchStatus();
			this.highlightAllPages('');
			return;
		}
		if (this.searchStatus) this.searchStatus.setText('搜索中…');
		for (let pageNumber = 1; pageNumber <= this.pdf.numPages; pageNumber += 1) {
			const text = await this.readPageText(pageNumber);
			if (version !== this.searchVersion) return;
			if (text.toLocaleLowerCase().includes(normalized)) this.searchResults.push(pageNumber);
		}
		if (this.searchResults.length) {
			this.searchResultIndex = 0;
			await this.goToPage(this.searchResults[0]);
		}
		this.updateSearchStatus();
		this.highlightAllPages(normalized);
	}

	private async moveSearchResult(direction: number): Promise<void> {
		if (!this.searchResults.length) return;
		this.searchResultIndex = (this.searchResultIndex + direction + this.searchResults.length) % this.searchResults.length;
		await this.goToPage(this.searchResults[this.searchResultIndex]);
		this.updateSearchStatus();
	}

	private updateSearchStatus(): void {
		if (!this.searchStatus) return;
		this.searchStatus.setText(this.searchResults.length
			? `${this.searchResultIndex + 1}/${this.searchResults.length}`
			: '0/0');
	}

	private async readPageText(pageNumber: number): Promise<string> {
		const cached = this.pageText.get(pageNumber);
		if (cached !== undefined) return cached;
		if (!this.pdf) return '';
		const page = await this.pdf.getPage(pageNumber);
		const content = await page.getTextContent();
		const text = content.items.map((item) => 'str' in item ? item.str : '').join(' ');
		this.pageText.set(pageNumber, text);
		return text;
	}

	private highlightAllPages(query: string): void {
		for (const pageNumber of this.pageElements.keys()) this.highlightPage(pageNumber, query);
	}

	private highlightPage(pageNumber: number, query: string): void {
		const wrapper = this.pageElements.get(pageNumber);
		if (!wrapper) return;
		const normalized = query.trim().toLocaleLowerCase();
		for (const span of Array.from(wrapper.querySelectorAll('.textLayer span'))) {
			span.toggleClass('is-search-match', Boolean(normalized && span.textContent?.toLocaleLowerCase().includes(normalized)));
		}
	}

	private print(): void {
		const url = URL.createObjectURL(new Blob([this.data], { type: 'application/pdf' }));
		const frame = document.body.createEl('iframe', { cls: 'pdf-print-frame' });
		frame.addEventListener('load', () => {
			try {
				frame.contentWindow?.print();
			} finally {
				window.setTimeout(() => {
					frame.remove();
					URL.revokeObjectURL(url);
				}, 1000);
			}
		});
		frame.src = url;
	}

	private cancelRenders(): void {
		for (const render of this.renders.values()) {
			render.task.cancel();
			render.textLayer?.cancel();
		}
		this.renders.clear();
	}

	private button(
		container: HTMLElement,
		label: string,
		onClick: (button: HTMLButtonElement) => void
	): HTMLButtonElement {
		const button = container.createEl('button', { text: label });
		button.type = 'button';
		button.addEventListener('click', () => onClick(button));
		return button;
	}
}
