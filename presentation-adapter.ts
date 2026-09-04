import * as JSZip from 'jszip';
import { init as initPptxPreview } from 'pptx-preview';
import { applyFormatToElement, defaultTextFormat, FormatToolbar, normalizeColor, TextAlignment, TextFormat } from './format-toolbar';
import { AdapterOptions, PreviewAdapter } from './preview-adapter';
import { attribute, directChild, normalizeEditorText, parseXml, serializeXml } from './ooxml';

const DRAWING_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const PRESENTATION_NS = 'http://schemas.openxmlformats.org/presentationml/2006/main';
type PPTXPreviewer = ReturnType<typeof initPptxPreview>;

interface SlideTextBlock {
	paragraph: Element;
	originalText: string;
	text: string;
	format: TextFormat;
	textDirty: boolean;
	formatDirty: boolean;
	editor?: HTMLElement;
}

interface SlideShape {
	name: string;
	blocks: SlideTextBlock[];
}

interface SlideDocument {
	path: string;
	number: number;
	document: XMLDocument;
	shapes: SlideShape[];
}

export class PresentationAdapter implements PreviewAdapter {
	readonly canEdit: boolean;
	readonly editReason?: string;
	private previewer: PPTXPreviewer | null = null;

	private constructor(
		private readonly data: ArrayBuffer,
		private readonly zip: JSZip,
		private readonly slides: SlideDocument[],
		editReason?: string
	) {
		const textCount = slides.reduce(
			(total, slide) => total + slide.shapes.reduce((sum, shape) => sum + shape.blocks.length, 0),
			0
		);
		this.editReason = editReason ?? (textCount ? undefined : '演示文稿中没有可编辑的文本框');
		this.canEdit = !this.editReason;
	}

	static async create(data: ArrayBuffer, _options: AdapterOptions): Promise<PresentationAdapter> {
		const zip = await JSZip.loadAsync(data);
		const paths = Object.keys(zip.files)
			.filter((path) => /^ppt\/slides\/slide\d+\.xml$/i.test(path))
			.sort((left, right) => slideNumber(left) - slideNumber(right));
		if (!paths.length) throw new Error('PPTX 中没有幻灯片');

		const slides: SlideDocument[] = [];
		for (const path of paths) {
			const source = await zip.file(path)?.async('string');
			if (!source) continue;
			const document = parseXml(source);
			slides.push({
				path,
				number: slideNumber(path),
				document,
				shapes: collectShapes(document)
			});
		}

		const signed = Object.keys(zip.files).some((path) => path.toLowerCase().startsWith('_xmlsignatures/'));
		return new PresentationAdapter(data, zip, slides, signed ? '带数字签名的演示文稿只能预览' : undefined);
	}

	async renderPreview(container: HTMLElement): Promise<void> {
		this.destroyPreviewer();
		const width = Math.max(320, Math.min(container.clientWidth || 960, 1400));
		this.previewer = initPptxPreview(container, {
			width,
			height: Math.round(width * 9 / 16),
			mode: 'list'
		});
		await this.previewer.preview(this.data);
	}

	async renderEditor(container: HTMLElement): Promise<void> {
		if (!this.canEdit) throw new Error(this.editReason ?? '该演示文稿不能编辑');
		this.destroyPreviewer();
		container.createDiv({
			cls: 'office-editor-note',
			text: '简化编辑模式只修改现有文本框。图片、形状位置、图表和动画保持原样。'
		});

		let active: SlideTextBlock | null = null;
		const toolbar = new FormatToolbar(container, (format) => {
			if (!active) return;
			active.format = format;
			active.formatDirty = true;
			if (active.editor) applyFormatToElement(active.editor, format);
		});
		const editor = container.createDiv({ cls: 'presentation-simple-editor' });

		const activate = (block: SlideTextBlock): void => {
			active?.editor?.removeClass('is-active');
			active = block;
			block.editor?.addClass('is-active');
			toolbar.setFormat(block.format);
		};

		for (const slide of this.slides) {
			const section = editor.createEl('section', { cls: 'presentation-edit-slide' });
			section.createEl('h3', { text: `第 ${slide.number} 页` });
			for (const shape of slide.shapes) {
				const shapeEl = section.createDiv({ cls: 'presentation-edit-shape' });
				shapeEl.createDiv({ cls: 'office-editor-section-title', text: shape.name });
				for (const block of shape.blocks) {
					const field = shapeEl.createDiv({ cls: 'presentation-edit-paragraph' });
					field.contentEditable = 'true';
					field.spellcheck = true;
					field.setAttr('role', 'textbox');
					field.setAttr('aria-label', `${shape.name}文本`);
					field.setText(block.text);
					block.editor = field;
					applyFormatToElement(field, block.format);
					field.addEventListener('focus', () => activate(block));
					field.addEventListener('pointerdown', () => activate(block));
					field.addEventListener('input', () => {
						block.text = normalizeEditorText(field.innerText);
						block.textDirty = block.text !== block.originalText;
					});
				}
			}
		}

		const first = this.slides[0]?.shapes[0]?.blocks[0];
		if (first) activate(first);
	}

	async serialize(): Promise<ArrayBuffer> {
		if (!this.canEdit) throw new Error(this.editReason ?? '该演示文稿不能编辑');
		const changed = this.slides.some((slide) => slide.shapes.some(
			(shape) => shape.blocks.some((block) => block.textDirty || block.formatDirty)
		));
		if (!changed) return this.data.slice(0);
		for (const slide of this.slides) {
			for (const shape of slide.shapes) {
				for (const block of shape.blocks) {
					if (block.textDirty) writeText(slide.document, block);
					if (block.formatDirty) writeFormat(slide.document, block);
				}
			}
			this.zip.file(slide.path, serializeXml(slide.document));
		}
		return this.zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
	}

	getText(): string {
		return this.slides.flatMap((slide) => slide.shapes.flatMap((shape) => shape.blocks.map((block) => block.text)))
			.filter(Boolean)
			.join('\n');
	}

	destroy(): void {
		this.destroyPreviewer();
		for (const slide of this.slides) {
			for (const shape of slide.shapes) {
				for (const block of shape.blocks) block.editor = undefined;
			}
		}
	}

	private destroyPreviewer(): void {
		if (!this.previewer) return;
		try {
			this.previewer.destroy();
		} catch (error) {
			console.debug('清理 PowerPoint 预览器时出现问题:', error);
		}
		this.previewer = null;
	}
}

function collectShapes(document: XMLDocument): SlideShape[] {
	const shapes: SlideShape[] = [];
	for (const shape of Array.from(document.getElementsByTagNameNS(PRESENTATION_NS, 'sp'))) {
		const textBody = shape.getElementsByTagNameNS(PRESENTATION_NS, 'txBody')[0];
		if (!textBody) continue;
		const paragraphs = Array.from(textBody.getElementsByTagNameNS(DRAWING_NS, 'p'));
		const blocks = paragraphs.map((paragraph) => createBlock(paragraph));
		const properties = shape.getElementsByTagNameNS(PRESENTATION_NS, 'cNvPr')[0];
		shapes.push({
			name: attribute(properties ?? null, 'name') ?? `文本框 ${shapes.length + 1}`,
			blocks
		});
	}
	return shapes;
}

function createBlock(paragraph: Element): SlideTextBlock {
	const text = Array.from(paragraph.getElementsByTagNameNS(DRAWING_NS, 't'))
		.map((node) => node.textContent ?? '')
		.join('');
	return {
		paragraph,
		originalText: text,
		text,
		format: readFormat(paragraph),
		textDirty: false,
		formatDirty: false
	};
}

function readFormat(paragraph: Element): TextFormat {
	const format = defaultTextFormat();
	const run = Array.from(paragraph.getElementsByTagNameNS(DRAWING_NS, 'r'))
		.find((candidate) => candidate.getElementsByTagNameNS(DRAWING_NS, 't').length);
	const properties = run ? directChild(run, 'rPr') : directChild(paragraph, 'endParaRPr');
	if (properties) {
		format.bold = attribute(properties, 'b') === '1';
		format.italic = attribute(properties, 'i') === '1';
		format.underline = ['sng', 'dbl'].includes(attribute(properties, 'u') ?? '');
		const size = Number(attribute(properties, 'sz'));
		if (Number.isFinite(size) && size > 0) format.fontSize = size / 100;
		const family = properties.getElementsByTagNameNS(DRAWING_NS, 'latin')[0];
		format.fontFamily = attribute(family ?? null, 'typeface') ?? '';
		const color = properties.getElementsByTagNameNS(DRAWING_NS, 'srgbClr')[0];
		if (color) format.color = normalizeColor(attribute(color, 'val') ?? '', format.color);
	}
	format.align = fromPresentationAlignment(attribute(directChild(paragraph, 'pPr'), 'algn'));
	return format;
}

function writeText(document: XMLDocument, block: SlideTextBlock): void {
	let textNodes = Array.from(block.paragraph.getElementsByTagNameNS(DRAWING_NS, 't'));
	if (!textNodes.length) {
		const run = document.createElementNS(DRAWING_NS, 'a:r');
		const text = document.createElementNS(DRAWING_NS, 'a:t');
		run.appendChild(text);
		block.paragraph.insertBefore(run, directChild(block.paragraph, 'endParaRPr'));
		textNodes = [text];
	}
	textNodes[0].textContent = block.text;
	for (let index = 1; index < textNodes.length; index += 1) textNodes[index].textContent = '';
}

function writeFormat(document: XMLDocument, block: SlideTextBlock): void {
	const runs = Array.from(block.paragraph.getElementsByTagNameNS(DRAWING_NS, 'r'))
		.filter((run) => run.getElementsByTagNameNS(DRAWING_NS, 't').length);
	for (const run of runs) {
		let properties = directChild(run, 'rPr');
		if (!properties) {
			properties = document.createElementNS(DRAWING_NS, 'a:rPr');
			run.insertBefore(properties, run.firstElementChild);
		}
		setBooleanAttribute(properties, 'b', block.format.bold);
		setBooleanAttribute(properties, 'i', block.format.italic);
		if (block.format.underline) properties.setAttribute('u', 'sng');
		else properties.removeAttribute('u');
		properties.setAttribute('sz', String(Math.round(block.format.fontSize * 100)));
		if (block.format.fontFamily) setTypeface(document, properties, block.format.fontFamily);
		setColor(document, properties, block.format.color);
	}
	let paragraphProperties = directChild(block.paragraph, 'pPr');
	if (!paragraphProperties) {
		paragraphProperties = document.createElementNS(DRAWING_NS, 'a:pPr');
		block.paragraph.insertBefore(paragraphProperties, block.paragraph.firstElementChild);
	}
	paragraphProperties.setAttribute('algn', toPresentationAlignment(block.format.align));
}

function setTypeface(document: XMLDocument, properties: Element, family: string): void {
	for (const localName of ['latin', 'ea', 'cs']) {
		let font = directChild(properties, localName);
		if (!font) {
			font = document.createElementNS(DRAWING_NS, `a:${localName}`);
			properties.appendChild(font);
		}
		font.setAttribute('typeface', family);
	}
}

function setColor(document: XMLDocument, properties: Element, color: string): void {
	directChild(properties, 'solidFill')?.remove();
	const fill = document.createElementNS(DRAWING_NS, 'a:solidFill');
	const rgb = document.createElementNS(DRAWING_NS, 'a:srgbClr');
	rgb.setAttribute('val', color.replace('#', '').toUpperCase());
	fill.appendChild(rgb);
	properties.appendChild(fill);
}

function setBooleanAttribute(element: Element, name: string, enabled: boolean): void {
	if (enabled) element.setAttribute(name, '1');
	else element.removeAttribute(name);
}

function fromPresentationAlignment(value: string | null): TextAlignment {
	if (value === 'ctr') return 'center';
	if (value === 'r') return 'right';
	if (value === 'just' || value === 'dist') return 'justify';
	return 'left';
}

function toPresentationAlignment(value: TextAlignment): string {
	if (value === 'center') return 'ctr';
	if (value === 'right') return 'r';
	if (value === 'justify') return 'just';
	return 'l';
}

function slideNumber(path: string): number {
	return Number(path.match(/slide(\d+)\.xml$/i)?.[1] ?? 0);
}
