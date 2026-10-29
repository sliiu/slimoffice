/**
 * Offline replay of a raw canvas-author dump (what `onCanvasAuthored` wrote) through
 * normalize → zod → toFilled → snap/reflect. No LLM call. This is how a live-run
 * finding gets turned into a normalizer / gate fix without paying for another run:
 * every "why did this element drop" or "why did the gate fire" is answerable here.
 */
import type { GenerateDeckResult } from "../deckgen/pipeline.js";
import { type CanvasStats } from "../deckgen/pipeline.js";
import type { Outline } from "./schema.js";
export interface ReplayCanvasInput {
    /** Raw model JSON as dumped (pre-normalize). */
    raw: unknown;
    /** The outline the author was given (dump dir `outline.json`). */
    outline: Pick<Outline, "title" | "slides">;
    /** Optional page → image src map; missing entries mean "no photo for this page". */
    images?: Map<number, string>;
    brand?: string;
}
export interface ReplayCanvasResult {
    systemId: string;
    compiled: GenerateDeckResult;
    stats: CanvasStats;
    /** Zod issues (empty when the dump validated after normalize). */
    schemaIssues: string[];
}
export declare function replayCanvasDump(input: ReplayCanvasInput): ReplayCanvasResult;
export declare class ReplaySchemaError extends Error {
    readonly issues: string[];
    constructor(issues: string[]);
}
