export function parseXml(source: string): XMLDocument {
	const document = new DOMParser().parseFromString(source, 'application/xml');
	const error = document.getElementsByTagName('parsererror')[0];
	if (error) throw new Error(error.textContent || 'Office XML 无法解析');
	return document;
}

export function serializeXml(document: XMLDocument): string {
	return new XMLSerializer().serializeToString(document);
}

export function elementChildren(parent: Element, localName?: string): Element[] {
	return Array.from(parent.children).filter((child) => !localName || child.localName === localName);
}

export function descendants(parent: Element | XMLDocument, localName: string): Element[] {
	return Array.from(parent.getElementsByTagNameNS('*', localName));
}

export function firstDescendant(parent: Element | XMLDocument, localName: string): Element | null {
	return parent.getElementsByTagNameNS('*', localName)[0] ?? null;
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

export function setAttribute(element: Element, namespace: string, name: string, value: string): void {
	element.setAttributeNS(namespace, name, value);
}

export function removeAttribute(element: Element, localName: string): void {
	for (const item of Array.from(element.attributes)) {
		if (item.localName === localName) element.removeAttributeNode(item);
	}
}

export function createElement(
	document: XMLDocument,
	namespace: string,
	qualifiedName: string
): Element {
	return document.createElementNS(namespace, qualifiedName);
}

export function ensureDirectChild(
	parent: Element,
	namespace: string,
	qualifiedName: string,
	localName: string,
	before?: Element | null
): Element {
	const existing = directChild(parent, localName);
	if (existing) return existing;
	const child = createElement(parent.ownerDocument, namespace, qualifiedName);
	parent.insertBefore(child, before ?? parent.firstElementChild);
	return child;
}

export function removeDirectChildren(parent: Element, localName: string): void {
	for (const child of elementChildren(parent, localName)) child.remove();
}

export function textOf(parent: Element, localName = 't'): string {
	return descendants(parent, localName).map((node) => node.textContent ?? '').join('');
}

export function normalizeEditorText(value: string): string {
	return value.replace(/\r?\n/g, ' ').replace(/\u00a0/g, ' ');
}
