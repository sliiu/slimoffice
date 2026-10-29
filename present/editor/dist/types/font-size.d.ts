export declare const MIN_FONT_PT = 6;
export declare const MAX_FONT_PT = 96;
export declare const DEFAULT_FONT_PT = 18;
export declare function ptToPx(pt: number): number;
export declare function pxToPt(px: number): number;
export declare function formatFontPt(px: number): string;
export declare function fontPxFromPt(pt: number, min?: number, max?: number): number;
