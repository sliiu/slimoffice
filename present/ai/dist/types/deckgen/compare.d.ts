/** Structure compare — ignores ColorTheme tokens. */
import type { FilledSlide } from "./ir.js";
import type { PaintedSlide } from "./apply-theme.js";
export interface StructureNode {
    layout: string;
    variant: string;
    elements: Array<{
        name: string;
        kind: string;
        x: number;
        y: number;
        w: number;
        h: number;
    }>;
}
export declare function structureOf(slides: Array<FilledSlide | PaintedSlide>): StructureNode[];
export declare function structureEqual(a: Array<FilledSlide | PaintedSlide>, b: Array<FilledSlide | PaintedSlide>): boolean;
export declare function structureDiff(a: Array<FilledSlide | PaintedSlide>, b: Array<FilledSlide | PaintedSlide>): string;
