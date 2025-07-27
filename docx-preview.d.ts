// 类型声明文件 for docx-preview
declare module 'docx-preview' {
    export function renderAsync(
        file: ArrayBuffer | Uint8Array,
        container: HTMLElement,
        options?: {
            className?: string;
            inWrapper?: boolean;
            ignoreWidth?: boolean;
            ignoreHeight?: boolean;
            ignoreFonts?: boolean;
            breakPages?: boolean;
            ignoreLastRenderedPageBreak?: boolean;
            experimental?: boolean;
            trimXmlDeclaration?: boolean;
            useBase64URL?: boolean;
        }
    ): Promise<void>;
}
