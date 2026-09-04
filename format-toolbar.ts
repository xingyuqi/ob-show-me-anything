export type TextAlignment = 'left' | 'center' | 'right' | 'justify';

export interface TextFormat {
	bold: boolean;
	italic: boolean;
	underline: boolean;
	fontFamily: string;
	fontSize: number;
	color: string;
	fill?: string;
	align: TextAlignment;
}

interface FormatToolbarOptions {
	fill?: boolean;
}

export class FormatToolbar {
	private readonly root: HTMLElement;
	private readonly boldButton: HTMLButtonElement;
	private readonly italicButton: HTMLButtonElement;
	private readonly underlineButton: HTMLButtonElement;
	private readonly fontFamily: HTMLSelectElement;
	private readonly fontSize: HTMLInputElement;
	private readonly color: HTMLInputElement;
	private readonly fill: HTMLInputElement | null;
	private readonly align: HTMLSelectElement;
	private format: TextFormat;
	private enabled = false;

	constructor(
		container: HTMLElement,
		private readonly onChange: (format: TextFormat) => void,
		options: FormatToolbarOptions = {}
	) {
		this.root = container.createDiv({ cls: 'format-toolbar' });
		this.format = defaultTextFormat();

		this.boldButton = this.createToggle('B', '粗体', 'bold');
		this.italicButton = this.createToggle('I', '斜体', 'italic');
		this.underlineButton = this.createToggle('U', '下划线', 'underline');

		this.fontFamily = this.root.createEl('select', { attr: { 'aria-label': '字体' } });
		for (const [value, label] of [
			['', '原字体'],
			['Calibri', 'Calibri'],
			['Arial', 'Arial'],
			['Microsoft YaHei', '微软雅黑'],
			['SimSun', '宋体']
		]) this.fontFamily.createEl('option', { value, text: label });
		this.fontFamily.addEventListener('change', () => this.update({ fontFamily: this.fontFamily.value }));

		this.fontSize = this.root.createEl('input', {
			type: 'number',
			attr: { min: '6', max: '96', step: '1', 'aria-label': '字号' }
		});
		this.fontSize.addEventListener('change', () => {
			const value = Number(this.fontSize.value);
			if (Number.isFinite(value)) this.update({ fontSize: Math.min(96, Math.max(6, value)) });
		});

		this.color = this.createColorInput('文字颜色');
		this.color.addEventListener('input', () => this.update({ color: this.color.value }));

		this.fill = options.fill ? this.createColorInput('填充颜色') : null;
		this.fill?.addEventListener('input', () => this.update({ fill: this.fill?.value }));

		this.align = this.root.createEl('select', { attr: { 'aria-label': '对齐' } });
		for (const [value, label] of [
			['left', '左对齐'],
			['center', '居中'],
			['right', '右对齐'],
			['justify', '两端对齐']
		]) this.align.createEl('option', { value, text: label });
		this.align.addEventListener('change', () => this.update({ align: this.align.value as TextAlignment }));

		this.setEnabled(false);
	}

	setFormat(format: TextFormat): void {
		this.format = { ...format };
		this.boldButton.toggleClass('is-active', format.bold);
		this.italicButton.toggleClass('is-active', format.italic);
		this.underlineButton.toggleClass('is-active', format.underline);
		this.boldButton.setAttr('aria-pressed', String(format.bold));
		this.italicButton.setAttr('aria-pressed', String(format.italic));
		this.underlineButton.setAttr('aria-pressed', String(format.underline));
		this.fontFamily.value = format.fontFamily;
		this.fontSize.value = String(format.fontSize);
		this.color.value = normalizeColor(format.color, '#000000');
		if (this.fill) this.fill.value = normalizeColor(format.fill, '#ffffff');
		this.align.value = format.align;
		this.setEnabled(true);
	}

	setEnabled(enabled: boolean): void {
		this.enabled = enabled;
		for (const control of Array.from(this.root.querySelectorAll('button, input, select'))) {
			(control as HTMLButtonElement | HTMLInputElement | HTMLSelectElement).disabled = !enabled;
		}
	}

	private createToggle(label: string, title: string, key: 'bold' | 'italic' | 'underline'): HTMLButtonElement {
		const button = this.root.createEl('button', { text: label, attr: { title, 'aria-label': title } });
		button.type = 'button';
		button.addEventListener('click', () => this.update({ [key]: !this.format[key] }));
		return button;
	}

	private createColorInput(label: string): HTMLInputElement {
		return this.root.createEl('input', { type: 'color', attr: { title: label, 'aria-label': label } });
	}

	private update(change: Partial<TextFormat>): void {
		if (!this.enabled) return;
		this.format = { ...this.format, ...change };
		this.setFormat(this.format);
		this.onChange({ ...this.format });
	}
}

export function defaultTextFormat(): TextFormat {
	return {
		bold: false,
		italic: false,
		underline: false,
		fontFamily: '',
		fontSize: 11,
		color: '#000000',
		align: 'left'
	};
}

export function applyFormatToElement(element: HTMLElement, format: TextFormat): void {
	element.style.fontWeight = format.bold ? '700' : '400';
	element.style.fontStyle = format.italic ? 'italic' : 'normal';
	element.style.textDecoration = format.underline ? 'underline' : 'none';
	element.style.fontFamily = format.fontFamily || '';
	element.style.fontSize = `${format.fontSize}pt`;
	element.style.color = normalizeColor(format.color, '#000000');
	element.style.textAlign = format.align;
	if (format.fill) element.style.backgroundColor = normalizeColor(format.fill, '#ffffff');
}

export function normalizeColor(color: string | undefined, fallback: string): string {
	if (!color) return fallback;
	const value = color.startsWith('#') ? color : `#${color}`;
	return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;
}
