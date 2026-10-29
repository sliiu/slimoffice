import type { FieldResolveContext, TextParagraph, TextRun } from "@sliiu/present-core";
import type { ParaOverride } from "./scene-node.js";
export interface StackedGlyph {
    ch: string;
    run: TextRun;
    fontSize: number;
    stepY: number;
    upright: boolean;
}
export declare function buildStackedGlyphs(p: TextParagraph, para: ParaOverride | undefined, vert: "wordArtVert" | "wordArtVertRtl" | "eaVert" | "mongolianVert", fieldCtx?: FieldResolveContext): StackedGlyph[];
export declare function wrapGlyphsIntoColumns(glyphs: StackedGlyph[], maxH: number): StackedGlyph[][];
