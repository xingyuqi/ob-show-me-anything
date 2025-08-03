// 类型声明文件 for xlsx
declare module 'xlsx' {
    export interface WorkBook {
        SheetNames: string[];
        Sheets: { [key: string]: WorkSheet };
    }

    export interface WorkSheet {
        [key: string]: any;
    }

    export interface Cell {
        v: any;
        t: string;
        f?: string;
        r?: string;
        h?: string;
    }

    export function read(data: any, opts?: any): WorkBook;
    export const utils: {
        sheet_to_json(sheet: WorkSheet, opts?: any): any[];
        sheet_to_html(sheet: WorkSheet, opts?: any): string;
        encode_cell(cell: { c: number; r: number }): string;
        decode_cell(address: string): { c: number; r: number };
        encode_range(range: { s: { c: number; r: number }; e: { c: number; r: number } }): string;
        decode_range(range: string): { s: { c: number; r: number }; e: { c: number; r: number } };
    };
}
