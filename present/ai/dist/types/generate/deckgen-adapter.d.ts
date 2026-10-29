/**
 * Adapter: live generate entry (topic / outline) → canvas author (or no-key fill)
 * → polish (research/organize/images/QA/art director) → editable SlimPPT Presentation.
 *
 * Does not reimplement the catalog. Pairing / layout / variant ids are
 * imported from `packages/ai/src/deckgen` and re-asserted at this boundary.
 *
 * Product generate is always this path. `useDeckgen` is ignored.
 */
import { type Presentation } from "@sliiu/present-core";
import { type ColorThemeId, type FilledSlide, type GenerateDeckInput, type GenerateDeckResult, type ReflectFinding, type VisualSystem, type VisualSystemId } from "../deckgen/index.js";
import { type PageJob } from "../deckgen/jobs.js";
import { type DeckBrief } from "../deckgen/brief.js";
import type { GuidanceInput, Outline } from "./schema.js";
import type { GenerateOptions } from "./types.js";
/** Live generate is always deckgen. `useDeckgen` is a no-op kept for call-site compatibility. */
export declare function isDeckgenGenerateEnabled(_opts?: Pick<GenerateOptions, "useDeckgen">): boolean;
/**
 * Map leftover styleFamily / visualSystem hints onto the two-id whitelist.
 * Used by the no-key fill fallback. Live author picks systemId itself.
 */
export declare function resolveDeckgenSystem(guidance: GuidanceInput): VisualSystemId;
/**
 * Named ColorTheme is a seed. Unpaired ids are allowed on the canvas path;
 * fill fallback remaps to the system default.
 */
export declare function resolveDeckgenTheme(systemId: VisualSystemId, themeHint?: string): ColorThemeId;
export declare function fillThemeId(systemId: VisualSystemId, themeId?: string): ColorThemeId;
export declare function materialsFromGuidance(guidance: GuidanceInput, outline?: Outline): string[];
/** Map generate guidance (+ optional user outline) onto deckgen fill input. */
export declare function toDeckgenInput(guidance: GuidanceInput, outline?: Outline): GenerateDeckInput;
/** Fill-path boundary: system exists; outline pages still whitelist. Pairing is remapped, not thrown. */
export declare function assertDeckgenBoundary(input: GenerateDeckInput): void;
/** Debug-only: one line per canvas pass so live runs show vocabulary hit-rate and what the gate rejected. */
interface CanvasPass {
    compiled: GenerateDeckResult;
    slides: FilledSlide[];
}
/**
 * Per-page best-of between the author pass and the repair pass: a page comes from the repair
 * pass unless the author's version had fewer page-level findings. Returns undefined when the
 * merge would equal the repair pass (nothing to recompile) or the page counts differ.
 */
export declare function mergeCanvasPages(first: CanvasPass, second: CanvasPass): FilledSlide[] | undefined;
/**
 * Pages a repair pass must touch, or undefined when a deck-level finding does not name its pages
 * (then the whole deck is re-authored). Also undefined when the scope would be the whole deck
 * anyway (≥ 60 % of pages) — one coherent pass beats stitching most of the deck back together.
 */
export declare function repairScope(findings: ReflectFinding[], pageCount: number): number[] | undefined;
/**
 * Folio decision, in priority order: explicit `guidance.pageNumbers` → the user's own words in
 * extraNotes / goals ("加页码", "no page numbers") → the organizer's Design Brief → a deck-mode /
 * length default. The result is always a boolean so snap can enforce it.
 */
export declare function withFolioDecision(brief: DeckBrief, guidance: GuidanceInput, pageCount: number): DeckBrief;
/**
 * Photo decision, in priority order: the user's own words ("不要配图", "photo-heavy") → the
 * organizer's Design Brief → a deck-mode default. Always set, so `applyPhotoRhythm` can enforce it.
 */
export declare function withPhotoDecision(brief: DeckBrief, guidance: GuidanceInput): DeckBrief;
/**
 * Photo pages whose fetch missed borrow the nearest fetched photograph (cover first, then by page
 * distance). Cover and close sharing one picture is an editorial convention; a paper page between
 * photo anchors is not. Returns the pages that were filled.
 */
export declare function fillMissingPhotos(jobs: PageJob[], images: Map<number, string>): number[];
/** One line per page the later pass must leave alone: index · job · title · composition · folio, plus a short "says" so the next chunk does not repeat those facts. */
export declare function describeUnchangedPages(slides: Array<FilledSlide | undefined>, jobs: PageJob[], scope: number[], system: VisualSystem): string;
/**
 * Sync compile only (no LLM, no images, no QA, no motion). Tests that need a
 * locked Presentation IR without polish should call this.
 */
export declare function compileDeckgenPresentation(guidance: GuidanceInput, outline: Outline | undefined): Presentation;
/**
 * Run deckgen and return the same Presentation IR the editor already loads
 * (`loadPresentation` / `previewGeneratedPresentation`).
 *
 * With a usable text config: research + organize the outline, then compile,
 * enrich images, QA-repair, art-director recolor, motion.
 * Without a key: compile the reviewed outline (or narrative template) only.
 */
export declare function generatePresentationViaDeckgen(guidance: GuidanceInput, outline: Outline | undefined, opts?: GenerateOptions): Promise<Presentation>;
export declare const DECKGEN_CANVAS: {
    readonly width: 1280;
    readonly height: 720;
};
/** Outline rows → per-page visual jobs (title, bullets, imageIdea, layout hints, Design Brief). Shared with the offline replay tool. */
export declare function jobsFromOutline(outline: Pick<Outline, "title" | "slides">): PageJob[];
export {};
