import type { TextRun } from "./shape.js";
export interface FieldResolveContext {
    slideIndex: number;
    slideCount?: number;
    now?: Date;
}
/** Resolve OOXML-style field types (slidenum, datetime*, etc.) for display. */
export declare function resolveFieldText(field: string, ctx: FieldResolveContext): string;
export declare function runDisplayText(run: TextRun, ctx: FieldResolveContext): string;
