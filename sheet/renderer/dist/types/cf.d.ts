import type { SheetCell, Worksheet } from "@sliiu/sheet-core";
/** Resolve conditional-format look for one cell. Later rules override earlier ones for fill/color. */
export declare function cfLook(sheet: Worksheet, row: number, column: number, cell: SheetCell | undefined): {
    fill?: string;
    color?: string;
    bar?: number;
    icon?: string;
};
