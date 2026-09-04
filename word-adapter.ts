import * as docxPreview from 'docx-preview';
import * as JSZip from 'jszip';
import { applyFormatToElement, defaultTextFormat, FormatToolbar, normalizeColor, TextAlignment, TextFormat, TextFormatChange } from './format-toolbar';
import { AdapterOptions, PreviewAdapter } from './preview-adapter';
import { attribute, directChild, normalizeEditorText, parseXml, serializeXml } from './ooxml';

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';

interface WordBlock {
	paragraph: Element;
	originalText: string;
	text: string;
	format: TextFormat;
	textDirty: boolean;
	formatChanges: TextFormatChange;
	editor?: HTMLElement;
}

export class WordAdapter implements PreviewAdapter {
	readonly canEdit: boolean;
	readonly editReason?: string;
	private readonly blocks: WordBlock[];

	private constructor(
		private readonly data: ArrayBuffer,
		private readonly options: AdapterOptions,
		private readonly zip: JSZip,
		private readonly documentXml: XMLDocument,
		editReason?: string
	) {
		this.blocks = this.collectBlocks();
		this.editReason = editReason ?? (this.blocks.length ? undefined : '文档中没有可编辑的正文');
		this.canEdit = !this.editReason;
	}

	static async create(data: ArrayBuffer, options: AdapterOptions): Promise<WordAdapter> {
		const zip = await JSZip.loadAsync(data);
		const documentFile = zip.file('word/document.xml');
		if (!documentFile) throw new Error('DOCX 中缺少 word/document.xml');
		const documentXml = parseXml(await documentFile.async('string'));
		let editReason: string | undefined;

		const settingsFile = zip.file('word/settings.xml');
		if (settingsFile) {
			const settings = parseXml(await settingsFile.async('string'));
			if (settings.getElementsByTagNameNS(WORD_NS, 'documentProtection').length) {
				editReason = '文档已启用编辑保护';
			} else if (settings.getElementsByTagNameNS(WORD_NS, 'trackRevisions').length) {
				editReason = '包含修订记录的文档只能预览';
			}
		}

		if (
			documentXml.getElementsByTagNameNS(WORD_NS, 'ins').length
			|| documentXml.getElementsByTagNameNS(WORD_NS, 'del').length
			|| documentXml.getElementsByTagNameNS(WORD_NS, 'moveFrom').length
			|| documentXml.getElementsByTagNameNS(WORD_NS, 'moveTo').length
		) editReason = '包含修订内容的文档只能预览';

		const signed = Object.keys(zip.files).some((path) => path.toLowerCase().startsWith('_xmlsignatures/'));
		if (signed) editReason = '带数字签名的文档只能预览';
		return new WordAdapter(data, options, zip, documentXml, editReason);
	}

	async renderPreview(container: HTMLElement): Promise<void> {
		await docxPreview.renderAsync(this.data, container, container, {
			ignoreWidth: this.options.mobile,
			ignoreHeight: this.options.mobile,
			breakPages: !this.options.mobile,
			renderAltChunks: false,
			renderChanges: false,
			renderComments: false,
			useBase64URL: true
		});
	}

	async renderEditor(container: HTMLElement): Promise<void> {
		if (!this.canEdit) throw new Error(this.editReason ?? '该 Word 文档不能编辑');
		const intro = container.createDiv({ cls: 'office-editor-note' });
		intro.setText('简化编辑模式只修改正文和简单表格，图片、页眉页脚及分页设置保持原样。');

		let active: WordBlock | null = null;
		const toolbar = new FormatToolbar(container, (format, change) => {
			if (!active) return;
			active.format = format;
			Object.assign(active.formatChanges, change);
			if (active.editor) applyFormatToElement(active.editor, format);
		});

		const editor = container.createDiv({ cls: 'word-simple-editor' });
		const body = this.documentXml.getElementsByTagNameNS(WORD_NS, 'body')[0];
		if (!body) throw new Error('Word 正文结构无效');
		const rendered = new Set<Element>();

		const activate = (block: WordBlock): void => {
			active?.editor?.removeClass('is-active');
			active = block;
			block.editor?.addClass('is-active');
			toolbar.setFormat(block.format);
		};

		const renderParagraph = (paragraph: Element, parent: HTMLElement): void => {
			const block = this.blocks.find((candidate) => candidate.paragraph === paragraph);
			if (!block) return;
			rendered.add(paragraph);
			const field = parent.createDiv({ cls: 'word-edit-paragraph' });
			field.contentEditable = 'true';
			field.spellcheck = true;
			field.setAttr('role', 'textbox');
			field.setAttr('aria-label', 'Word 段落');
			field.setText(block.text || '');
			if (this.isListParagraph(paragraph)) field.addClass('is-list-item');
			const heading = this.headingLevel(paragraph);
			if (heading) field.addClass(`is-heading-${heading}`);
			block.editor = field;
			applyFormatToElement(field, block.format);
			field.addEventListener('focus', () => activate(block));
			field.addEventListener('pointerdown', () => activate(block));
			field.addEventListener('input', () => {
				block.text = normalizeEditorText(field.innerText);
				block.textDirty = block.text !== block.originalText;
			});
		};

		for (const child of Array.from(body.children)) {
			if (child.namespaceURI !== WORD_NS) continue;
			if (child.localName === 'p') {
				renderParagraph(child, editor);
			} else if (child.localName === 'tbl') {
				const table = editor.createEl('table', { cls: 'word-edit-table' });
				for (const rowXml of this.wordChildren(child, 'tr')) {
					const row = table.createEl('tr');
					for (const cellXml of this.wordChildren(rowXml, 'tc')) {
						const cell = row.createEl('td');
						for (const paragraph of Array.from(cellXml.getElementsByTagNameNS(WORD_NS, 'p'))) {
							renderParagraph(paragraph, cell);
						}
					}
				}
			}
		}

		const remaining = this.blocks.filter((block) => !rendered.has(block.paragraph));
		if (remaining.length) {
			const extra = editor.createDiv({ cls: 'word-edit-extra' });
			extra.createDiv({ cls: 'office-editor-section-title', text: '其他正文内容' });
			for (const block of remaining) renderParagraph(block.paragraph, extra);
		}

		if (this.blocks[0]) activate(this.blocks[0]);
	}

	async serialize(): Promise<ArrayBuffer | null> {
		if (!this.canEdit) throw new Error(this.editReason ?? '该 Word 文档不能编辑');
		if (!this.blocks.some((block) => block.textDirty || Object.keys(block.formatChanges).length)) return null;
		for (const block of this.blocks) {
			if (block.textDirty) this.writeText(block);
			if (Object.keys(block.formatChanges).length) this.writeFormat(block);
		}
		this.zip.file('word/document.xml', serializeXml(this.documentXml));
		return this.zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
	}

	getText(): string {
		return this.blocks.map((block) => block.text).filter(Boolean).join('\n');
	}

	destroy(): void {
		for (const block of this.blocks) block.editor = undefined;
	}

	private collectBlocks(): WordBlock[] {
		const body = this.documentXml.getElementsByTagNameNS(WORD_NS, 'body')[0];
		if (!body) return [];
		return Array.from(body.getElementsByTagNameNS(WORD_NS, 'p')).map((paragraph) => {
			const text = Array.from(paragraph.getElementsByTagNameNS(WORD_NS, 't'))
				.map((node) => node.textContent ?? '')
				.join('');
			return {
				paragraph,
				originalText: text,
				text,
				format: this.readFormat(paragraph),
				textDirty: false,
				formatChanges: {}
			};
		});
	}

	private readFormat(paragraph: Element): TextFormat {
		const format = defaultTextFormat();
		const run = Array.from(paragraph.getElementsByTagNameNS(WORD_NS, 'r'))
			.find((candidate) => candidate.getElementsByTagNameNS(WORD_NS, 't').length);
		const runProperties = run ? directChild(run, 'rPr') : null;
		if (runProperties) {
			format.bold = this.isEnabled(directChild(runProperties, 'b'));
			format.italic = this.isEnabled(directChild(runProperties, 'i'));
			format.underline = this.isEnabled(directChild(runProperties, 'u'));
			const size = Number(attribute(directChild(runProperties, 'sz'), 'val'));
			if (Number.isFinite(size) && size > 0) format.fontSize = size / 2;
			const color = attribute(directChild(runProperties, 'color'), 'val');
			if (color && color !== 'auto') format.color = normalizeColor(color, format.color);
			const fonts = directChild(runProperties, 'rFonts');
			format.fontFamily = attribute(fonts, 'eastAsia')
				?? attribute(fonts, 'ascii')
				?? attribute(fonts, 'hAnsi')
				?? '';
		}
		const alignment = attribute(directChild(directChild(paragraph, 'pPr') ?? paragraph, 'jc'), 'val');
		format.align = this.fromWordAlignment(alignment);
		return format;
	}

	private writeText(block: WordBlock): void {
		let textNodes = Array.from(block.paragraph.getElementsByTagNameNS(WORD_NS, 't'));
		if (!textNodes.length) {
			const run = this.createWordElement('r');
			const text = this.createWordElement('t');
			run.appendChild(text);
			const paragraphProperties = directChild(block.paragraph, 'pPr');
			block.paragraph.insertBefore(run, paragraphProperties?.nextSibling ?? block.paragraph.firstChild);
			textNodes = [text];
		}
		textNodes[0].textContent = block.text;
		textNodes[0].setAttributeNS(XML_NS, 'xml:space', 'preserve');
		for (let index = 1; index < textNodes.length; index += 1) textNodes[index].textContent = '';
	}

	private writeFormat(block: WordBlock): void {
		const changes = block.formatChanges;
		const runFormatChanged = ['bold', 'italic', 'underline', 'fontSize', 'color', 'fontFamily']
			.some((key) => key in changes);
		const runs = Array.from(block.paragraph.getElementsByTagNameNS(WORD_NS, 'r'))
			.filter((run) => run.getElementsByTagNameNS(WORD_NS, 't').length);
		if (runFormatChanged) {
			for (const run of runs) {
				const first = run.firstElementChild;
				const runProperties = directChild(run, 'rPr') ?? this.insertWordElement(run, 'rPr', first);
				if ('bold' in changes) this.setToggle(runProperties, 'b', block.format.bold);
				if ('italic' in changes) this.setToggle(runProperties, 'i', block.format.italic);
				if ('underline' in changes) this.setToggle(runProperties, 'u', block.format.underline, 'single');
				if ('fontSize' in changes) {
					this.setValue(runProperties, 'sz', String(Math.round(block.format.fontSize * 2)));
					this.setValue(runProperties, 'szCs', String(Math.round(block.format.fontSize * 2)));
				}
				if ('color' in changes) this.setValue(runProperties, 'color', block.format.color.replace('#', '').toUpperCase());
				if ('fontFamily' in changes) {
					if (!block.format.fontFamily) {
						directChild(runProperties, 'rFonts')?.remove();
						continue;
					}
					const fonts = directChild(runProperties, 'rFonts') ?? this.insertWordElement(runProperties, 'rFonts');
					for (const name of ['ascii', 'hAnsi', 'eastAsia', 'cs']) {
						fonts.setAttributeNS(WORD_NS, `w:${name}`, block.format.fontFamily);
					}
				}
			}
		}
		if ('align' in changes) {
			const paragraphProperties = directChild(block.paragraph, 'pPr')
				?? this.insertWordElement(block.paragraph, 'pPr', block.paragraph.firstElementChild);
			this.setValue(paragraphProperties, 'jc', this.toWordAlignment(block.format.align));
		}
	}

	private wordChildren(parent: Element, localName: string): Element[] {
		return Array.from(parent.children).filter(
			(child) => child.namespaceURI === WORD_NS && child.localName === localName
		);
	}

	private isListParagraph(paragraph: Element): boolean {
		const paragraphProperties = directChild(paragraph, 'pPr');
		return Boolean(paragraphProperties && directChild(paragraphProperties, 'numPr'));
	}

	private headingLevel(paragraph: Element): number | null {
		const style = attribute(directChild(directChild(paragraph, 'pPr') ?? paragraph, 'pStyle'), 'val') ?? '';
		const match = style.match(/(?:heading|标题)\s*([1-6])/i);
		return match ? Number(match[1]) : null;
	}

	private isEnabled(element: Element | null): boolean {
		if (!element) return false;
		const value = attribute(element, 'val');
		return value !== '0' && value !== 'false' && value !== 'off' && value !== 'none';
	}

	private setToggle(parent: Element, localName: string, enabled: boolean, value?: string): void {
		const existing = directChild(parent, localName);
		if (!enabled) {
			existing?.remove();
			return;
		}
		const element = existing ?? this.insertWordElement(parent, localName);
		if (value) element.setAttributeNS(WORD_NS, 'w:val', value);
	}

	private setValue(parent: Element, localName: string, value: string): void {
		const element = directChild(parent, localName) ?? this.insertWordElement(parent, localName);
		element.setAttributeNS(WORD_NS, 'w:val', value);
	}

	private insertWordElement(parent: Element, localName: string, before?: Element | null): Element {
		const element = this.createWordElement(localName);
		parent.insertBefore(element, before ?? null);
		return element;
	}

	private createWordElement(localName: string): Element {
		return this.documentXml.createElementNS(WORD_NS, `w:${localName}`);
	}

	private fromWordAlignment(value: string | null): TextAlignment {
		if (value === 'center') return 'center';
		if (value === 'right' || value === 'end') return 'right';
		if (value === 'both' || value === 'distribute') return 'justify';
		return 'left';
	}

	private toWordAlignment(value: TextAlignment): string {
		return value === 'justify' ? 'both' : value;
	}
}
