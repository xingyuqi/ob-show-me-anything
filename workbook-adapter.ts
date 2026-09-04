import * as XLSX from 'xlsx';
import * as JSZip from 'jszip';
import { applyFormatToElement, defaultTextFormat, FormatToolbar, normalizeColor, TextAlignment, TextFormat, TextFormatChange } from './format-toolbar';
import { AdapterOptions, PreviewAdapter } from './preview-adapter';
import { patchXlsx, XlsxCellChange, XlsxDimensionChange } from './xlsx-patcher';

const ROWS_PER_PAGE = 200;
const COLUMNS_PER_PAGE = 100;

interface CellStyle {
	fgColor?: { rgb?: string };
	font?: {
		bold?: boolean;
		italic?: boolean;
		underline?: boolean | string;
		name?: string;
		sz?: number;
		color?: { rgb?: string };
	};
	fill?: {
		patternType?: string;
		fgColor?: { rgb?: string };
	};
	alignment?: { horizontal?: string };
	numFmt?: string;
}

interface SelectedCell {
	sheetName: string;
	address: string;
	element: HTMLTableCellElement;
}

export class WorkbookAdapter implements PreviewAdapter {
	readonly canEdit: boolean;
	readonly editReason?: string;
	private readonly workbook: XLSX.WorkBook;
	private readonly cellChanges = new Map<string, XlsxCellChange>();
	private readonly rowHeights = new Map<string, XlsxDimensionChange>();
	private readonly columnWidths = new Map<string, XlsxDimensionChange>();

	private constructor(
		private readonly data: ArrayBuffer,
		private readonly options: AdapterOptions,
		workbook: XLSX.WorkBook,
		editReason?: string
	) {
		this.workbook = workbook;
		this.editReason = editReason;
		this.canEdit = !editReason;
	}

	static async create(data: ArrayBuffer, options: AdapterOptions): Promise<WorkbookAdapter> {
		const workbook = XLSX.read(data, {
			type: 'array',
			bookVBA: true,
			cellDates: true,
			cellFormula: true,
			cellNF: true,
			cellStyles: true
		});
		if (!workbook.SheetNames.length) throw new Error('工作簿中没有工作表');
		let editReason: string | undefined;
		if (workbook.SheetNames.some((name) => Boolean(workbook.Sheets[name]['!protect']))) {
			editReason = '包含受保护工作表的文件只能预览';
		}
		if (options.extension === 'xls' && workbook.vbaraw) editReason = '包含宏的 XLS 文件只能预览';
		if (options.extension === 'xlsx') {
			const zip = await JSZip.loadAsync(data);
			const worksheets = Object.values(zip.files).filter((file) =>
				!file.dir && /^xl\/worksheets\/[^/]+\.xml$/i.test(file.name)
			);
			const worksheetXml = await Promise.all(worksheets.map((file) => file.async('string')));
			if (worksheetXml.some((xml) => /<sheetProtection\b/i.test(xml))) {
				editReason = '包含受保护工作表的文件只能预览';
			}
			if (Object.keys(zip.files).some((path) => path.toLowerCase().startsWith('_xmlsignatures/'))) {
				editReason = '带数字签名的工作簿只能预览';
			}
		}
		return new WorkbookAdapter(data, options, workbook, editReason);
	}

	async renderPreview(container: HTMLElement): Promise<void> {
		this.renderWorkbook(container, false);
	}

	async renderEditor(container: HTMLElement): Promise<void> {
		if (!this.canEdit) throw new Error(this.editReason ?? '该工作簿不能编辑');
		container.createDiv({
			cls: 'office-editor-note',
			text: this.options.extension === 'xlsx'
				? '可修改单元格值、公式、常用格式、行高和列宽。合并关系、图表及数据透视表保持原样。'
				: '旧版 XLS 可修改单元格值和公式。其他格式保持原样。'
		});
		this.renderWorkbook(container, true);
	}

	async serialize(): Promise<ArrayBuffer | null> {
		if (!this.canEdit) throw new Error(this.editReason ?? '该工作簿不能编辑');
		if (!this.cellChanges.size && !this.rowHeights.size && !this.columnWidths.size) return null;
		const output = this.options.extension === 'xlsx'
			? await patchXlsx(this.data, {
				cells: Array.from(this.cellChanges.values()),
				rowHeights: Array.from(this.rowHeights.values()),
				columnWidths: Array.from(this.columnWidths.values())
			})
			: XLSX.write(this.workbook, {
				type: 'array',
				bookType: 'xls',
				bookSST: true,
				cellStyles: true
			}) as ArrayBuffer;
		this.verifyOutput(output);
		return output;
	}

	getText(): string {
		return this.workbook.SheetNames.map((name) => {
			const csv = XLSX.utils.sheet_to_csv(this.workbook.Sheets[name], { blankrows: false });
			return `${name}\n${csv}`;
		}).join('\n\n');
	}

	destroy(): void {
		// SheetJS does not retain DOM or worker resources.
	}

	private renderWorkbook(container: HTMLElement, editable: boolean): void {
		const controls = editable && this.options.extension === 'xlsx'
			? container.createDiv({ cls: 'excel-edit-controls' })
			: null;
		let selected: SelectedCell | null = null;
		let formatToolbar: FormatToolbar | null = null;
		let numberFormat: HTMLInputElement | null = null;
		let rowHeight: HTMLInputElement | null = null;
		let columnWidth: HTMLInputElement | null = null;

		if (controls) {
			formatToolbar = new FormatToolbar(controls, (format, change) => {
				if (!selected) return;
				const cell = this.ensureCell(selected.sheetName, selected.address);
				this.applyCellFormat(cell, change);
				const cellChange = this.getCellChange(selected.sheetName, selected.address);
				cellChange.format = { ...cellChange.format, ...change };
				applyFormatToElement(selected.element, format);
			}, { fill: true });
			formatToolbar.setEnabled(false);

			const dimensions = controls.createDiv({ cls: 'excel-dimension-controls' });
			numberFormat = this.createLabeledInput(dimensions, '数字格式', 'text');
			rowHeight = this.createLabeledInput(dimensions, '行高', 'number', '8', '400');
			columnWidth = this.createLabeledInput(dimensions, '列宽', 'number', '2', '100');

			numberFormat.addEventListener('change', () => {
				if (!selected || !numberFormat) return;
				const cell = this.ensureCell(selected.sheetName, selected.address);
				cell.z = numberFormat.value || 'General';
				this.getCellChange(selected.sheetName, selected.address).numberFormat = String(cell.z);
			});
			rowHeight.addEventListener('change', () => {
				if (!selected || !rowHeight) return;
				const value = boundedNumber(rowHeight, 15, 8, 400);
				rowHeight.value = String(value);
				const row = XLSX.utils.decode_cell(selected.address).r;
				const worksheet = this.workbook.Sheets[selected.sheetName];
				worksheet['!rows'] = worksheet['!rows'] ?? [];
				worksheet['!rows'][row] = { ...(worksheet['!rows'][row] ?? {}), hpt: value };
				this.rowHeights.set(this.dimensionKey(selected.sheetName, row), {
					sheetName: selected.sheetName,
					index: row,
					value
				});
			});
			columnWidth.addEventListener('change', () => {
				if (!selected || !columnWidth) return;
				const value = boundedNumber(columnWidth, 10, 2, 100);
				columnWidth.value = String(value);
				const column = XLSX.utils.decode_cell(selected.address).c;
				const worksheet = this.workbook.Sheets[selected.sheetName];
				worksheet['!cols'] = worksheet['!cols'] ?? [];
				worksheet['!cols'][column] = { ...(worksheet['!cols'][column] ?? {}), wch: value };
				this.columnWidths.set(this.dimensionKey(selected.sheetName, column), {
					sheetName: selected.sheetName,
					index: column,
					value
				});
			});
		}

		const tabs = container.createDiv({ cls: 'excel-sheet-tabs' });
		const tableContainer = container.createDiv({ cls: 'excel-table-container' });
		const tabButtons = new Map<string, HTMLButtonElement>();

		const selectCell = (sheetName: string, address: string, element: HTMLTableCellElement): void => {
			selected?.element.removeClass('is-selected');
			selected = { sheetName, address, element };
			element.addClass('is-selected');
			const cell = this.ensureCell(sheetName, address);
			formatToolbar?.setFormat(this.readCellFormat(cell));
			if (numberFormat) numberFormat.value = String(cell.z ?? 'General');
			const location = XLSX.utils.decode_cell(address);
			const worksheet = this.workbook.Sheets[sheetName];
			if (rowHeight) rowHeight.value = String(worksheet['!rows']?.[location.r]?.hpt ?? 15);
			if (columnWidth) columnWidth.value = String(worksheet['!cols']?.[location.c]?.wch ?? 10);
		};

		const showSheet = (sheetName: string): void => {
			for (const [name, button] of tabButtons) {
				button.toggleClass('is-active', name === sheetName);
				button.setAttr('aria-selected', String(name === sheetName));
			}
			selected = null;
			formatToolbar?.setEnabled(false);
			this.renderSheet(sheetName, tableContainer, editable, selectCell);
		};

		for (const sheetName of this.workbook.SheetNames) {
			const tab = tabs.createEl('button', { cls: 'excel-sheet-tab', text: sheetName });
			tab.type = 'button';
			tab.title = sheetName;
			tab.setAttr('role', 'tab');
			tab.addEventListener('click', () => showSheet(sheetName));
			tabButtons.set(sheetName, tab);
		}

		showSheet(this.workbook.SheetNames[0]);
	}

	private renderSheet(
		sheetName: string,
		container: HTMLElement,
		editable: boolean,
		onSelect: (sheetName: string, address: string, element: HTMLTableCellElement) => void
	): void {
		const worksheet = this.workbook.Sheets[sheetName];
		const ref = worksheet['!ref'];
		container.empty();
		if (!ref) {
			container.createDiv({ cls: 'document-preview-message', text: '工作表为空' });
			return;
		}

		const fullRange = XLSX.utils.decode_range(ref);
		const rowPages = Math.max(1, Math.ceil((fullRange.e.r - fullRange.s.r + 1) / ROWS_PER_PAGE));
		const columnPages = Math.max(1, Math.ceil((fullRange.e.c - fullRange.s.c + 1) / COLUMNS_PER_PAGE));
		let rowPage = 0;
		let columnPage = 0;

		const pager = container.createDiv({ cls: 'excel-pager' });
		const previousRows = this.pagerButton(pager, '上一段行');
		const pageLabel = pager.createSpan({ cls: 'excel-page-label' });
		const nextRows = this.pagerButton(pager, '下一段行');
		const previousColumns = this.pagerButton(pager, '上一段列');
		const nextColumns = this.pagerButton(pager, '下一段列');
		const tableHost = container.createDiv();

		const draw = (): void => {
			tableHost.empty();
			const range: XLSX.Range = {
				s: {
					r: fullRange.s.r + rowPage * ROWS_PER_PAGE,
					c: fullRange.s.c + columnPage * COLUMNS_PER_PAGE
				},
				e: {
					r: Math.min(fullRange.e.r, fullRange.s.r + (rowPage + 1) * ROWS_PER_PAGE - 1),
					c: Math.min(fullRange.e.c, fullRange.s.c + (columnPage + 1) * COLUMNS_PER_PAGE - 1)
				}
			};
			this.drawTable(sheetName, worksheet, range, tableHost, editable, onSelect);
			pageLabel.setText(`行 ${range.s.r + 1}-${range.e.r + 1}/${fullRange.e.r + 1}，列 ${XLSX.utils.encode_col(range.s.c)}-${XLSX.utils.encode_col(range.e.c)}`);
			previousRows.disabled = rowPage === 0;
			nextRows.disabled = rowPage === rowPages - 1;
			previousColumns.disabled = columnPage === 0;
			nextColumns.disabled = columnPage === columnPages - 1;
		};

		previousRows.addEventListener('click', () => { rowPage -= 1; draw(); });
		nextRows.addEventListener('click', () => { rowPage += 1; draw(); });
		previousColumns.addEventListener('click', () => { columnPage -= 1; draw(); });
		nextColumns.addEventListener('click', () => { columnPage += 1; draw(); });
		draw();
	}

	private drawTable(
		sheetName: string,
		worksheet: XLSX.WorkSheet,
		range: XLSX.Range,
		container: HTMLElement,
		editable: boolean,
		onSelect: (sheetName: string, address: string, element: HTMLTableCellElement) => void
	): void {
		const scroller = container.createDiv({ cls: 'excel-table-scroller' });
		const table = scroller.createEl('table', { cls: 'excel-preview-table' });
		const headerRow = table.createEl('thead').createEl('tr');
		headerRow.createEl('th', { cls: 'excel-row-number', text: '' });
		for (let column = range.s.c; column <= range.e.c; column += 1) {
			const header = headerRow.createEl('th', { text: XLSX.utils.encode_col(column) });
			const width = worksheet['!cols']?.[column]?.wpx
				?? (worksheet['!cols']?.[column]?.wch ? Number(worksheet['!cols']?.[column]?.wch) * 7 : undefined);
			if (width) header.style.width = `${Math.max(36, width)}px`;
		}

		const body = table.createEl('tbody');
		const covered = new Set<string>();
		for (let row = range.s.r; row <= range.e.r; row += 1) {
			const rowEl = body.createEl('tr');
			const height = worksheet['!rows']?.[row]?.hpx ?? worksheet['!rows']?.[row]?.hpt;
			if (height) rowEl.style.height = `${height}px`;
			rowEl.createEl('th', { cls: 'excel-row-number', text: String(row + 1) });
			for (let column = range.s.c; column <= range.e.c; column += 1) {
				const address = XLSX.utils.encode_cell({ r: row, c: column });
				if (covered.has(address)) continue;
				const cell = worksheet[address];
				const td = rowEl.createEl('td');
				const merge = this.mergeStartingAt(worksheet, row, column);
				if (merge) {
					td.rowSpan = merge.e.r - merge.s.r + 1;
					td.colSpan = merge.e.c - merge.s.c + 1;
					for (let mergedRow = merge.s.r; mergedRow <= merge.e.r; mergedRow += 1) {
						for (let mergedColumn = merge.s.c; mergedColumn <= merge.e.c; mergedColumn += 1) {
							if (mergedRow !== row || mergedColumn !== column) {
								covered.add(XLSX.utils.encode_cell({ r: mergedRow, c: mergedColumn }));
							}
						}
					}
				}
				td.setText(this.displayCell(cell));
				this.applyCellCss(td, cell);
				if (editable) {
					td.contentEditable = 'true';
					td.spellcheck = true;
					td.setAttr('role', 'textbox');
					td.setAttr('aria-label', `${sheetName} ${address}`);
					td.addEventListener('focus', () => onSelect(sheetName, address, td));
					td.addEventListener('pointerdown', () => onSelect(sheetName, address, td));
					const update = (): void => this.updateCellValue(sheetName, address, td.innerText);
					td.addEventListener('input', update);
					td.addEventListener('blur', update);
				}
			}
		}
	}

	private updateCellValue(sheetName: string, address: string, rawValue: string): void {
		const value = rawValue.replace(/\r?\n/g, '\n');
		const cell = this.ensureCell(sheetName, address);
		delete cell.w;
		delete cell.r;
		delete cell.h;
		if (value.startsWith('=') && value.length > 1) {
			cell.f = value.slice(1);
			delete cell.v;
			cell.t = 'n';
			const change = this.getCellChange(sheetName, address);
			change.formula = cell.f;
			delete change.value;
			return;
		}
		delete cell.f;
		if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(value.trim())) {
			cell.t = 'n';
			cell.v = Number(value);
		} else if (/^(true|false)$/i.test(value.trim())) {
			cell.t = 'b';
			cell.v = value.trim().toLowerCase() === 'true';
		} else {
			cell.t = 's';
			cell.v = value;
		}
		const change = this.getCellChange(sheetName, address);
		change.value = cell.v as string | number | boolean;
		delete change.formula;
	}

	private applyCellFormat(cell: XLSX.CellObject, format: TextFormatChange): void {
		const style = this.cellStyle(cell);
		if (['bold', 'italic', 'underline', 'fontFamily', 'fontSize', 'color'].some((key) => key in format)) {
			style.font = { ...(style.font ?? {}) };
			if (format.bold !== undefined) style.font.bold = format.bold;
			if (format.italic !== undefined) style.font.italic = format.italic;
			if (format.underline !== undefined) style.font.underline = format.underline;
			if (format.fontFamily !== undefined) style.font.name = format.fontFamily || undefined;
			if (format.fontSize !== undefined) style.font.sz = format.fontSize;
			if (format.color !== undefined) style.font.color = { rgb: `FF${format.color.replace('#', '').toUpperCase()}` };
		}
		if (format.fill !== undefined) {
			style.fill = {
				...(style.fill ?? {}),
				patternType: 'solid',
				fgColor: { rgb: `FF${format.fill.replace('#', '').toUpperCase()}` }
			};
		}
		if (format.align !== undefined) {
			style.alignment = { ...(style.alignment ?? {}), horizontal: toSheetAlignment(format.align) };
		}
		cell.s = style;
	}

	private readCellFormat(cell: XLSX.CellObject): TextFormat {
		const style = this.cellStyle(cell);
		const format = defaultTextFormat();
		format.bold = Boolean(style.font?.bold);
		format.italic = Boolean(style.font?.italic);
		format.underline = Boolean(style.font?.underline);
		format.fontFamily = style.font?.name ?? '';
		format.fontSize = Number(style.font?.sz) || 11;
		format.color = normalizeSheetColor(style.font?.color?.rgb, '#000000');
		format.fill = normalizeSheetColor(style.fill?.fgColor?.rgb ?? style.fgColor?.rgb, '#ffffff');
		format.align = fromSheetAlignment(style.alignment?.horizontal);
		return format;
	}

	private applyCellCss(element: HTMLTableCellElement, cell: XLSX.CellObject | undefined): void {
		if (!cell) return;
		const style = this.cellStyle(cell);
		if (style.font?.bold) element.style.fontWeight = '700';
		if (style.font?.italic) element.style.fontStyle = 'italic';
		if (style.font?.underline) element.style.textDecoration = 'underline';
		if (style.font?.name) element.style.fontFamily = style.font.name;
		if (style.font?.sz) element.style.fontSize = `${style.font.sz}pt`;
		if (style.font?.color?.rgb) element.style.color = normalizeSheetColor(style.font.color.rgb, '');
		const fill = style.fill?.fgColor?.rgb ?? style.fgColor?.rgb;
		if (fill) element.style.backgroundColor = normalizeSheetColor(fill, '');
		if (style.alignment?.horizontal) element.style.textAlign = fromSheetAlignment(style.alignment.horizontal);
		if (style.numFmt && !cell.z) cell.z = style.numFmt;
	}

	private verifyOutput(output: ArrayBuffer): void {
		const verify = XLSX.read(output, {
			type: 'array',
			cellFormula: true,
			cellNF: true,
			cellStyles: true
		});
		if (verify.SheetNames.join('\n') !== this.workbook.SheetNames.join('\n')) {
			throw new Error('保存校验失败：工作表数量或名称发生变化');
		}
		for (const expected of this.cellChanges.values()) {
			if (expected.formula === undefined && expected.value === undefined) continue;
			const sheetName = expected.sheetName;
			const address = expected.address;
			const actual = verify.Sheets[sheetName]?.[address];
			if (!actual) throw new Error(`保存校验失败：${sheetName} ${address} 丢失`);
			if (expected.formula !== undefined && actual.f !== expected.formula) {
				throw new Error(`保存校验失败：${sheetName} ${address} 公式不一致`);
			}
			if (expected.formula === undefined && String(actual.v ?? '') !== String(expected.value ?? '')) {
				throw new Error(`保存校验失败：${sheetName} ${address} 内容不一致`);
			}
		}
	}

	private displayCell(cell: XLSX.CellObject | undefined): string {
		if (!cell) return '';
		if (cell.f) return `=${cell.f}`;
		return XLSX.utils.format_cell(cell);
	}

	private ensureCell(sheetName: string, address: string): XLSX.CellObject {
		const worksheet = this.workbook.Sheets[sheetName];
		if (!worksheet[address]) worksheet[address] = { t: 's', v: '' };
		return worksheet[address];
	}

	private cellStyle(cell: XLSX.CellObject): CellStyle {
		return (typeof cell.s === 'object' && cell.s ? cell.s : {}) as CellStyle;
	}

	private mergeStartingAt(worksheet: XLSX.WorkSheet, row: number, column: number): XLSX.Range | undefined {
		return worksheet['!merges']?.find((merge) => merge.s.r === row && merge.s.c === column);
	}

	private cellKey(sheetName: string, address: string): string {
		return `${sheetName}\u0000${address}`;
	}

	private getCellChange(sheetName: string, address: string): XlsxCellChange {
		const key = this.cellKey(sheetName, address);
		let change = this.cellChanges.get(key);
		if (!change) {
			change = { sheetName, address };
			this.cellChanges.set(key, change);
		}
		return change;
	}

	private dimensionKey(sheetName: string, index: number): string {
		return `${sheetName}\u0000${index}`;
	}

	private createLabeledInput(
		container: HTMLElement,
		label: string,
		type: string,
		min?: string,
		max?: string
	): HTMLInputElement {
		const wrapper = container.createEl('label');
		wrapper.createSpan({ text: label });
		const input = wrapper.createEl('input');
		input.type = type;
		if (min) input.min = min;
		if (max) input.max = max;
		return input;
	}

	private pagerButton(container: HTMLElement, label: string): HTMLButtonElement {
		const button = container.createEl('button', { text: label });
		button.type = 'button';
		return button;
	}
}

function normalizeSheetColor(value: string | undefined, fallback: string): string {
	if (!value) return fallback;
	return normalizeColor(value.length === 8 ? value.slice(2) : value, fallback);
}

function fromSheetAlignment(value: string | undefined): TextAlignment {
	if (value === 'center') return 'center';
	if (value === 'right') return 'right';
	if (value === 'justify' || value === 'distributed') return 'justify';
	return 'left';
}

function toSheetAlignment(value: TextAlignment): string {
	return value;
}

function boundedNumber(input: HTMLInputElement, fallback: number, min: number, max: number): number {
	return Number.isFinite(input.valueAsNumber)
		? Math.min(max, Math.max(min, input.valueAsNumber))
		: fallback;
}
