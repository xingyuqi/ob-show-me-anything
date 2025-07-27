declare module 'pptx-preview' {
  export interface PreviewerOptionsType {
    renderer?: string;
    width?: number;
    height?: number;
    mode?: 'list' | 'slide';
  }

  export class PPTXPreviewer {
    constructor(dom: HTMLElement, options: PreviewerOptionsType);
    preview(file: ArrayBuffer): Promise<unknown>;
    destroy(): void;
    get slideCount(): number;
    renderNextSlide(): void;
    renderPreSlide(): void;
  }

  // 主要的初始化函数
  export function init(dom: HTMLElement, options: PreviewerOptionsType): PPTXPreviewer;
}
