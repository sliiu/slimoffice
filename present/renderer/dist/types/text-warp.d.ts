import type { TextRun, TextShape } from "@sliiu/present-core";
export interface WarpSample {
    x: number;
    y: number;
    angle: number;
    /** Pour 内外路径间距（px）。有值时 glyph 沿法向拉伸填满环带。 */
    radial?: number;
}
export interface WarpGlyph {
    ch: string;
    x: number;
    y: number;
    angle: number;
    scaleY: number;
    run: TextRun;
    fontSize: number;
}
export declare function warpActive(s: TextShape): boolean;
/** 在文字框内生成 warp 基线采样（沿路径从左到右）。 */
export declare function sampleWarpPath(prst: string, box: {
    x: number;
    y: number;
    w: number;
    h: number;
}, avLst?: Record<string, number>): WarpSample[];
export declare function placeGlyphsOnWarp(glyphs: Array<{
    ch: string;
    width: number;
    run: TextRun;
    fontSize: number;
}>, samples: WarpSample[], prst?: string): WarpGlyph[];
export declare function flattenWarpGlyphs(s: TextShape, measure: (run: TextRun, text: string) => number): Array<{
    ch: string;
    width: number;
    run: TextRun;
    fontSize: number;
}>;
