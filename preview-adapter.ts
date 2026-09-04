export interface AdapterOptions {
	extension: string;
	fileName: string;
	mobile: boolean;
}

export interface PreviewAdapter {
	readonly canEdit: boolean;
	readonly editReason?: string;
	renderPreview(container: HTMLElement): Promise<void>;
	renderEditor(container: HTMLElement): Promise<void>;
	serialize(): Promise<ArrayBuffer>;
	getText(): string | Promise<string>;
	destroy(): void;
}

export type AdapterFactory = (
	data: ArrayBuffer,
	options: AdapterOptions
) => PreviewAdapter | Promise<PreviewAdapter>;
