declare module '@js-preview/excel' {
  export interface Options {
    minColLength?: number;
    minRowLength?: number;
    showContextmenu?: boolean;
  }

  export interface JsExcelPreview {
    preview: (src: string | ArrayBuffer | Blob) => Promise<unknown>;
    save: (fileName?: string) => void;
    setOptions: (options: Options) => void;
    setRequestOptions: (requestOptions?: unknown) => void;
    destroy: () => void;
  }

  const jsPreviewExcel: {
    init: (container: HTMLElement, options?: Options, requestOptions?: unknown) => JsExcelPreview;
  };

  export default jsPreviewExcel;
}
