export interface AdapterOptions {
	extension: string;
	mobile: boolean;
}

export interface PreviewAdapter {
	readonly canEdit: boolean;
	readonly editReason?: string;
	renderPreview(container: HTMLElement): Promise<void>;
	renderEditor(container: HTMLElement): Promise<void>;
	serialize(): Promise<ArrayBuffer | null>;
	getText(): string | Promise<string>;
	destroy(): void;
}
