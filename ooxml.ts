export function parseXml(source: string): XMLDocument {
	const document = new DOMParser().parseFromString(source, 'application/xml');
	const error = document.getElementsByTagName('parsererror')[0];
	if (error) throw new Error(error.textContent || 'Office XML 无法解析');
	return document;
}

export function serializeXml(document: XMLDocument): string {
	return new XMLSerializer().serializeToString(document);
}

function elementChildren(parent: Element, localName?: string): Element[] {
	return Array.from(parent.children).filter((child) => !localName || child.localName === localName);
}

export function directChild(parent: Element, localName: string): Element | null {
	return elementChildren(parent, localName)[0] ?? null;
}

export function attribute(element: Element | null, localName: string): string | null {
	if (!element) return null;
	for (const item of Array.from(element.attributes)) {
		if (item.localName === localName) return item.value;
	}
	return null;
}

export function normalizeEditorText(value: string): string {
	return value.replace(/\r?\n/g, ' ').replace(/\u00a0/g, ' ');
}
