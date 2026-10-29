/**
 * LLM authors each page as a complete SlimPPT canvas (ppt-master method, our IR).
 *
 * The model outputs semantics: system, palette hex, and per page the carriers
 * (text runs, presets, icons, diagrams, devices). Geometry expansion, type
 * ramp, scrim direction, and whitelists are deterministic (snap / emit).
 */
import type { LanguageModel } from "ai";
import type { FilledSlide } from "../deckgen/ir.js";
import type { PageJob } from "../deckgen/jobs.js";
import type { CanvasSystemId } from "../deckgen/ids.js";
import { type DeckBrief } from "../deckgen/brief.js";
import { type CanvasDeck } from "./canvas-schema.js";
import type { LlmUsage } from "../llm/usage.js";
import type { HostSkillStore } from "../skills/types.js";
export interface AuthorCanvasInput {
    model: LanguageModel;
    topic: string;
    jobs: PageJob[];
    /** slideIdx → real data URL / https src already fetched. */
    images: Map<number, string>;
    brand?: string;
    /** Deck-level Design Brief from organize (mode, system preference, palette intent, motif). */
    brief?: DeckBrief;
    /** Repair pass: keep the look the first author picked. */
    lock?: {
        systemId: CanvasSystemId;
        palette?: CanvasDeck["palette"];
    };
    /** Enabled user skills: their slide-stage sections are appended to the system prompt. */
    host?: HostSkillStore;
    signal?: AbortSignal;
    onUsage?: (usage: LlmUsage) => void;
    repair?: string;
    /** 样稿构图说明。有它时视觉以它为准。 */
    sampleComposition?: string;
    /**
     * Page-scoped repair: author ONLY these page indices (subset of jobs[].index), in ascending
     * order. The other pages stay as the first pass wrote them; `unchanged` describes them so the
     * model keeps folio numbering, header stack and composition variety consistent with them.
     */
    only?: number[];
    unchanged?: string;
    /** Debug tap: raw model JSON before normalize / zod. */
    onRaw?: (parsed: unknown) => void;
}
export interface AuthorCanvasResult {
    systemId: CanvasSystemId;
    slides: FilledSlide[];
    palette?: CanvasDeck["palette"];
    themeId?: CanvasDeck["themeId"];
}
export declare function canvasAuthorSystemPrompt(brand?: string, lock?: AuthorCanvasInput["lock"], brief?: DeckBrief, host?: HostSkillStore, sample?: boolean): string;
export declare function toFilled(deck: CanvasDeck, jobs: PageJob[], images: Map<number, string>): FilledSlide[];
/** 少于此页数仍一次写完。再短的稿分段没有收益。 */
export declare const CANVAS_CHUNK_MIN_PAGES = 10;
/** 分段多出来的写作次数。留给几何修补、文案改写和艺术总监。 */
export declare const CANVAS_CHUNK_MAX_EXTRA = 2;
/** 第一次画布写作之后还要留出的调用：几何修补、文案改写、艺术总监。 */
export declare const CANVAS_RESERVED_AFTER_AUTHOR = 3;
/**
 * 长稿可以再分几段写。`remainingBeforeAuthor` 是还没扣掉这一次画布写作时的剩余次数。
 * 短稿、或剩余次数不够留给后面三步时，返回 0（仍一次写完）。
 */
export declare function canvasExtraChunks(pageCount: number, remainingBeforeAuthor: number): number;
/** 把 0..pageCount-1 切成 `1 + extraChunks` 段，每段连续、尽量等长。 */
export declare function canvasChunkIndexes(pageCount: number, extraChunks: number): number[][];
export declare function authorCanvasDeck(input: AuthorCanvasInput): Promise<AuthorCanvasResult>;
