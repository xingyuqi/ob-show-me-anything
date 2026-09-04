import * as JSZip from 'jszip';
import { TextFormatChange } from './format-toolbar';
import { attribute, directChild, parseXml, serializeXml } from './ooxml';

const SHEET_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const OFFICE_REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

export interface XlsxCellChange {
	sheetName: string;
	address: string;
	value?: string | number | boolean;
	formula?: string;
	format?: TextFormatChange;
	numberFormat?: string;
}

export interface XlsxDimensionChange {
	sheetName: string;
	index: number;
	value: number;
}

export interface XlsxChanges {
	cells: XlsxCellChange[];
	rowHeights: XlsxDimensionChange[];
	columnWidths: XlsxDimensionChange[];
}

interface WorkbookParts {
	sheets: Map<string, string>;
	styles: string;
}

export async function patchXlsx(data: ArrayBuffer, changes: XlsxChanges): Promise<ArrayBuffer> {
	if (!changes.cells.length && !changes.rowHeights.length && !changes.columnWidths.length) return data.slice(0);
	const zip = await JSZip.loadAsync(data);
	const parts = await readWorkbookParts(zip);
	const styleFile = zip.file(parts.styles);
	if (!styleFile) throw new Error('XLSX 中缺少样式定义');
	const styles = parseXml(await styleFile.async('string'));
	const grouped = groupCells(changes.cells);

	const changedSheets = new Set<string>(grouped.keys());
	for (const item of [...changes.rowHeights, ...changes.columnWidths]) changedSheets.add(item.sheetName);
	for (const sheetName of changedSheets) {
		const cells = grouped.get(sheetName) ?? [];
		const path = parts.sheets.get(sheetName);
		const file = path ? zip.file(path) : null;
		if (!path || !file) throw new Error(`找不到工作表：${sheetName}`);
		const worksheet = parseXml(await file.async('string'));
		for (const change of cells) patchCell(worksheet, styles, change);
		for (const row of changes.rowHeights.filter((item) => item.sheetName === sheetName)) {
			patchRowHeight(worksheet, row.index, row.value);
		}
		for (const column of changes.columnWidths.filter((item) => item.sheetName === sheetName)) {
			patchColumnWidth(worksheet, column.index, column.value);
		}
		zip.file(path, serializeXml(worksheet));
	}

	if (changes.cells.some((change) => change.format || change.numberFormat !== undefined)) {
		zip.file(parts.styles, serializeXml(styles));
	}
	return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
}

async function readWorkbookParts(zip: JSZip): Promise<WorkbookParts> {
	const workbookFile = zip.file('xl/workbook.xml');
	const relsFile = zip.file('xl/_rels/workbook.xml.rels');
	if (!workbookFile || !relsFile) throw new Error('XLSX 工作簿结构不完整');
	const workbook = parseXml(await workbookFile.async('string'));
	const relationships = parseXml(await relsFile.async('string'));
	const targets = new Map<string, string>();
	let styles = 'xl/styles.xml';

	for (const relationship of Array.from(relationships.documentElement.children)) {
		if (relationship.localName !== 'Relationship') continue;
		const id = relationship.getAttribute('Id');
		const target = relationship.getAttribute('Target');
		if (!id || !target) continue;
		const path = resolvePartPath('xl/workbook.xml', target);
		targets.set(id, path);
		if ((relationship.getAttribute('Type') ?? '').endsWith('/styles')) styles = path;
	}

	const sheets = new Map<string, string>();
	for (const sheet of Array.from(workbook.getElementsByTagNameNS(SHEET_NS, 'sheet'))) {
		const name = sheet.getAttribute('name');
		const relationshipId = sheet.getAttributeNS(OFFICE_REL_NS, 'id') ?? attribute(sheet, 'id');
		const path = relationshipId ? targets.get(relationshipId) : undefined;
		if (name && path) sheets.set(name, path);
	}
	return { sheets, styles };
}

function patchCell(worksheet: XMLDocument, styles: XMLDocument, change: XlsxCellChange): void {
	const cell = ensureCell(worksheet, change.address);
	if (change.formula !== undefined || change.value !== undefined) patchCellValue(worksheet, cell, change);
	if (change.format || change.numberFormat !== undefined) {
		const index = appendCellStyle(styles, Number(cell.getAttribute('s') ?? 0), change);
		cell.setAttribute('s', String(index));
	}
}

function patchCellValue(document: XMLDocument, cell: Element, change: XlsxCellChange): void {
	for (const localName of ['f', 'v', 'is']) directChild(cell, localName)?.remove();
	if (change.formula !== undefined) {
		cell.removeAttribute('t');
		const formula = document.createElementNS(SHEET_NS, 'f');
		formula.textContent = change.formula;
		cell.appendChild(formula);
		return;
	}

	const value = change.value;
	if (typeof value === 'number') {
		cell.removeAttribute('t');
		const number = document.createElementNS(SHEET_NS, 'v');
		number.textContent = String(value);
		cell.appendChild(number);
	} else if (typeof value === 'boolean') {
		cell.setAttribute('t', 'b');
		const boolean = document.createElementNS(SHEET_NS, 'v');
		boolean.textContent = value ? '1' : '0';
		cell.appendChild(boolean);
	} else {
		cell.setAttribute('t', 'inlineStr');
		const inline = document.createElementNS(SHEET_NS, 'is');
		const text = document.createElementNS(SHEET_NS, 't');
		text.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
		text.textContent = value ?? '';
		inline.appendChild(text);
		cell.appendChild(inline);
	}
}

function ensureCell(document: XMLDocument, address: string): Element {
	const sheetData = document.getElementsByTagNameNS(SHEET_NS, 'sheetData')[0];
	if (!sheetData) throw new Error('工作表缺少 sheetData');
	const rowIndex = Number(address.match(/\d+$/)?.[0]);
	if (!rowIndex) throw new Error(`单元格地址无效：${address}`);
	const row = ensureRow(document, rowIndex);
	let cell = Array.from(row.getElementsByTagNameNS(SHEET_NS, 'c'))
		.find((candidate) => candidate.getAttribute('r') === address);
	if (!cell) {
		cell = document.createElementNS(SHEET_NS, 'c');
		cell.setAttribute('r', address);
		const targetColumn = columnNumber(address);
		const next = Array.from(row.children).find(
			(candidate) => candidate.localName === 'c' && columnNumber(candidate.getAttribute('r') ?? '') > targetColumn
		);
		row.insertBefore(cell, next ?? null);
	}
	return cell;
}

function patchRowHeight(document: XMLDocument, zeroBasedIndex: number, value: number): void {
	const row = ensureRow(document, zeroBasedIndex + 1);
	row.setAttribute('ht', String(value));
	row.setAttribute('customHeight', '1');
}

function ensureRow(document: XMLDocument, oneBasedIndex: number): Element {
	const sheetData = document.getElementsByTagNameNS(SHEET_NS, 'sheetData')[0];
	if (!sheetData) throw new Error('工作表缺少 sheetData');
	let row = Array.from(sheetData.getElementsByTagNameNS(SHEET_NS, 'row'))
		.find((candidate) => Number(candidate.getAttribute('r')) === oneBasedIndex);
	if (row) return row;
	row = document.createElementNS(SHEET_NS, 'row');
	row.setAttribute('r', String(oneBasedIndex));
	const next = Array.from(sheetData.children).find((candidate) => Number(candidate.getAttribute('r')) > oneBasedIndex);
	sheetData.insertBefore(row, next ?? null);
	return row;
}

function patchColumnWidth(document: XMLDocument, zeroBasedIndex: number, value: number): void {
	const worksheet = document.documentElement;
	let columns = directChild(worksheet, 'cols');
	if (!columns) {
		columns = document.createElementNS(SHEET_NS, 'cols');
		const sheetData = directChild(worksheet, 'sheetData');
		worksheet.insertBefore(columns, sheetData);
	}
	const oneBased = zeroBasedIndex + 1;
	const covering = Array.from(columns.getElementsByTagNameNS(SHEET_NS, 'col')).find((column) => {
		const min = Number(column.getAttribute('min'));
		const max = Number(column.getAttribute('max'));
		return min <= oneBased && max >= oneBased;
	});
	if (covering) {
		const min = Number(covering.getAttribute('min'));
		const max = Number(covering.getAttribute('max'));
		if (min < oneBased) {
			const before = covering.cloneNode(true) as Element;
			before.setAttribute('max', String(oneBased - 1));
			columns.insertBefore(before, covering);
		}
		if (max > oneBased) {
			const after = covering.cloneNode(true) as Element;
			after.setAttribute('min', String(oneBased + 1));
			columns.insertBefore(after, covering.nextSibling);
		}
		covering.setAttribute('min', String(oneBased));
		covering.setAttribute('max', String(oneBased));
		covering.setAttribute('width', String(value));
		covering.setAttribute('customWidth', '1');
		return;
	}
	const column = document.createElementNS(SHEET_NS, 'col');
	column.setAttribute('min', String(oneBased));
	column.setAttribute('max', String(oneBased));
	column.setAttribute('width', String(value));
	column.setAttribute('customWidth', '1');
	columns.appendChild(column);
}

function appendCellStyle(styles: XMLDocument, baseIndex: number, change: XlsxCellChange): number {
	const cellXfs = styles.getElementsByTagNameNS(SHEET_NS, 'cellXfs')[0];
	const fonts = styles.getElementsByTagNameNS(SHEET_NS, 'fonts')[0];
	const fills = styles.getElementsByTagNameNS(SHEET_NS, 'fills')[0];
	if (!cellXfs || !fonts || !fills) throw new Error('XLSX 样式表结构不完整');
	const base = Array.from(cellXfs.getElementsByTagNameNS(SHEET_NS, 'xf'))[baseIndex]
		?? styles.createElementNS(SHEET_NS, 'xf');
	const style = base.cloneNode(true) as Element;

	if (change.format) {
		const format = change.format;
		if (['bold', 'italic', 'underline', 'fontFamily', 'fontSize', 'color'].some((key) => key in format)) {
			const originalFontId = Number(style.getAttribute('fontId') ?? 0);
			const originalFont = Array.from(fonts.getElementsByTagNameNS(SHEET_NS, 'font'))[originalFontId];
			const font = originalFont?.cloneNode(true) as Element | undefined ?? styles.createElementNS(SHEET_NS, 'font');
			patchFont(styles, font, format);
			fonts.appendChild(font);
			fonts.setAttribute('count', String(fonts.children.length));
			style.setAttribute('fontId', String(fonts.children.length - 1));
			style.setAttribute('applyFont', '1');
		}

		if (format.fill !== undefined) {
			const fill = styles.createElementNS(SHEET_NS, 'fill');
			const pattern = styles.createElementNS(SHEET_NS, 'patternFill');
			pattern.setAttribute('patternType', 'solid');
			const foreground = styles.createElementNS(SHEET_NS, 'fgColor');
			foreground.setAttribute('rgb', `FF${format.fill.replace('#', '').toUpperCase()}`);
			const background = styles.createElementNS(SHEET_NS, 'bgColor');
			background.setAttribute('indexed', '64');
			pattern.append(foreground, background);
			fill.appendChild(pattern);
			fills.appendChild(fill);
			fills.setAttribute('count', String(fills.children.length));
			style.setAttribute('fillId', String(fills.children.length - 1));
			style.setAttribute('applyFill', '1');
		}

		if (format.align !== undefined) {
			let alignment = directChild(style, 'alignment');
			if (!alignment) {
				alignment = styles.createElementNS(SHEET_NS, 'alignment');
				style.appendChild(alignment);
			}
			alignment.setAttribute('horizontal', format.align);
			style.setAttribute('applyAlignment', '1');
		}
	}

	if (change.numberFormat !== undefined) {
		const id = findOrCreateNumberFormat(styles, change.numberFormat);
		style.setAttribute('numFmtId', String(id));
		style.setAttribute('applyNumberFormat', '1');
	}

	cellXfs.appendChild(style);
	cellXfs.setAttribute('count', String(cellXfs.children.length));
	return cellXfs.children.length - 1;
}

function patchFont(document: XMLDocument, font: Element, format: TextFormatChange): void {
	if (format.bold !== undefined) setPresence(document, font, 'b', format.bold);
	if (format.italic !== undefined) setPresence(document, font, 'i', format.italic);
	if (format.underline !== undefined) setPresence(document, font, 'u', format.underline);
	if (format.fontSize !== undefined) setValueChild(document, font, 'sz', String(format.fontSize));
	if (format.fontFamily !== undefined) {
		if (format.fontFamily) setValueChild(document, font, 'name', format.fontFamily);
		else directChild(font, 'name')?.remove();
	}
	if (format.color !== undefined) {
		let color = directChild(font, 'color');
		if (!color) {
			color = document.createElementNS(SHEET_NS, 'color');
			font.appendChild(color);
		}
		for (const item of Array.from(color.attributes)) color.removeAttributeNode(item);
		color.setAttribute('rgb', `FF${format.color.replace('#', '').toUpperCase()}`);
	}
}

function findOrCreateNumberFormat(document: XMLDocument, code: string): number {
	if (!code || code === 'General') return 0;
	let numberFormats = document.getElementsByTagNameNS(SHEET_NS, 'numFmts')[0];
	if (!numberFormats) {
		numberFormats = document.createElementNS(SHEET_NS, 'numFmts');
		const cellStyleXfs = document.getElementsByTagNameNS(SHEET_NS, 'cellStyleXfs')[0];
		document.documentElement.insertBefore(numberFormats, cellStyleXfs ?? null);
	}
	const existing = Array.from(numberFormats.getElementsByTagNameNS(SHEET_NS, 'numFmt'))
		.find((item) => item.getAttribute('formatCode') === code);
	if (existing) return Number(existing.getAttribute('numFmtId'));
	const used = Array.from(numberFormats.getElementsByTagNameNS(SHEET_NS, 'numFmt'))
		.map((item) => Number(item.getAttribute('numFmtId')))
		.filter(Number.isFinite);
	const id = Math.max(163, ...used) + 1;
	const item = document.createElementNS(SHEET_NS, 'numFmt');
	item.setAttribute('numFmtId', String(id));
	item.setAttribute('formatCode', code);
	numberFormats.appendChild(item);
	numberFormats.setAttribute('count', String(numberFormats.children.length));
	return id;
}

function setPresence(document: XMLDocument, parent: Element, localName: string, enabled: boolean): void {
	const child = directChild(parent, localName);
	if (!enabled) {
		child?.remove();
		return;
	}
	if (!child) parent.appendChild(document.createElementNS(SHEET_NS, localName));
}

function setValueChild(document: XMLDocument, parent: Element, localName: string, value: string): void {
	let child = directChild(parent, localName);
	if (!child) {
		child = document.createElementNS(SHEET_NS, localName);
		parent.appendChild(child);
	}
	child.setAttribute('val', value);
}

function groupCells(changes: XlsxCellChange[]): Map<string, XlsxCellChange[]> {
	const grouped = new Map<string, XlsxCellChange[]>();
	for (const change of changes) {
		const group = grouped.get(change.sheetName) ?? [];
		group.push(change);
		grouped.set(change.sheetName, group);
	}
	return grouped;
}

function resolvePartPath(baseFile: string, target: string): string {
	if (target.startsWith('/')) return target.slice(1);
	const segments = baseFile.split('/');
	segments.pop();
	for (const segment of target.replace(/\\/g, '/').split('/')) {
		if (!segment || segment === '.') continue;
		if (segment === '..') segments.pop();
		else segments.push(segment);
	}
	return segments.join('/');
}

function columnNumber(address: string): number {
	const letters = address.match(/^[A-Z]+/i)?.[0].toUpperCase() ?? '';
	let value = 0;
	for (const letter of letters) value = value * 26 + letter.charCodeAt(0) - 64;
	return value;
}
