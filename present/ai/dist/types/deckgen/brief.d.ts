/**
 * Design Brief vocabulary — the planning layer between organize and author.
 *
 * ppt-master keeps this in design_spec.md (Relationships / Composition /
 * Core message / page_rhythm) and spec_lock.md. Here it is a small typed
 * record the organizer emits alongside key points; the author binds to it
 * and the canvas reflect asks "you said order — where is the geometry?".
 * Type / spacing anchors are not authored: the VisualSystem owns them.
 */
import type { CanvasSystemId } from "./ids.js";
/** Argument skeleton for the whole deck (decides title voice and page order). */
export declare const DECK_MODES: readonly ["pyramid", "narrative", "instructional", "showcase", "briefing"];
export type DeckMode = (typeof DECK_MODES)[number];
export declare const DECK_MODE_HINTS: Record<DeckMode, string>;
/** How the points on one page relate — the author must carry this in geometry. */
export declare const RELATIONSHIPS: readonly ["none", "order", "link", "parent", "membership", "contrast", "overlap", "flow"];
export type Relationship = (typeof RELATIONSHIPS)[number];
/** Geometry the author is expected to use per relationship (checked by reflect). */
export declare const RELATIONSHIP_CARRIERS: Record<Relationship, string>;
/** Page density rhythm — consecutive dense pages ≤ 3, anchor pages carry display type or a photo. */
export declare const PAGE_RHYTHMS: readonly ["anchor", "dense", "breathing"];
export type PageRhythm = (typeof PAGE_RHYTHMS)[number];
/** Primary carrier the page should lead with; drives image acquisition. */
export declare const CARRIERS: readonly ["photo", "chart", "table", "diagram", "device", "typeOnly"];
export type Carrier = (typeof CARRIERS)[number];
/**
 * Page composition — where the title sits and how the field splits. Assigned so that
 * consecutive pages never share one; the author must follow it and reflect checks the
 * header run. This is what stops "eight pages with the same eyebrow/title/deck stack".
 */
export declare const COMPOSITIONS: readonly ["header-stack", "split", "statement", "full-bleed", "grid", "band", "sidebar"];
export type Composition = (typeof COMPOSITIONS)[number];
export declare const COMPOSITION_HINTS: Record<Composition, string>;
export interface PageBrief {
    /** One-sentence assertion the page must land (title candidate). */
    coreMessage?: string;
    /** "reader goes from A to B" — feeds notes and title voice. */
    audienceMove?: string;
    relationships?: Relationship;
    rhythm?: PageRhythm;
    carrier?: Carrier;
    composition?: Composition;
}
export interface DeckBrief {
    mode?: DeckMode;
    systemId?: CanvasSystemId;
    /** One line: warm/cool, brand hex, paper tone — the author turns it into hex. */
    paletteIntent?: string;
    /** Cross-page motif (a rule position, a numeral style, a corner mark). */
    motif?: string;
    /**
     * Page numerals on content pages. Decided per deck (formal / long / instructional → on;
     * showcase / narrative / short → off) unless the user asked; snap enforces it either way.
     */
    folio?: boolean;
    /**
     * Where photographs go, decided once per deck. Per-page carrier choices left a deck with a photo
     * on pages 1, 3, 11, 13 and paper everywhere else — readers see "two decks". `applyPhotoRhythm`
     * enforces the decision over the page jobs.
     */
    photoRhythm?: PhotoRhythm;
}
/** Deck-level photo placement. */
export declare const PHOTO_RHYTHMS: readonly ["anchors", "bookends", "editorial", "none"];
export type PhotoRhythm = (typeof PHOTO_RHYTHMS)[number];
export declare const PHOTO_RHYTHM_HINTS: Record<PhotoRhythm, string>;
/** Loose enum from organizer JSON or user prose: "anchors", "bookends", "cover-close", "editorial", "none"/"no photos". */
export declare function coercePhotoRhythm(raw: unknown): PhotoRhythm | undefined;
/**
 * Does the user's own brief rule photography in or out? "不要配图" / "no photos" / "text only" →
 * none; "多用图片" / "photo-heavy" → editorial; silence → undefined (the organizer decides).
 */
export declare function photoRhythmFromNotes(...blobs: Array<string | undefined>): PhotoRhythm | undefined;
/**
 * Does the brief ask for photographs at all ("封面用全屏摄影", "full-bleed photography on the
 * cover")? Not a rhythm by itself — the organizer still picks where — but it rules out `none`.
 */
export declare function notesWantPhotos(...blobs: Array<string | undefined>): boolean;
/** Deck-level default: showcase decks let pictures lead; everything else keeps them to the anchor pages. */
export declare function defaultPhotoRhythm(mode: DeckMode | undefined): PhotoRhythm;
/** Loose boolean from organizer JSON or user prose: true/false, "on"/"off", "yes"/"no", "显示"/"不要". */
export declare function coerceFolio(raw: unknown): boolean | undefined;
/**
 * Does the user's own brief ask for or against page numbers? "加页码" / "with page numbers" →
 * true; "不要页码" / "no page numbers" → false; silence → undefined (the organizer decides).
 */
export declare function folioFromNotes(...blobs: Array<string | undefined>): boolean | undefined;
/**
 * Deck-level default when neither the user nor the organizer decided: numerals help a reader
 * navigate long, formal, or instructional decks; they are noise on a short showcase.
 */
export declare function defaultFolio(mode: DeckMode | undefined, pageCount: number): boolean;
export declare function coercePageBrief(raw: unknown): PageBrief;
/**
 * Deterministic composition when the organizer left it blank — and the guard that
 * consecutive pages never repeat one, even when the organizer did fill it in.
 */
export declare function defaultComposition(job: string, rhythm: PageRhythm, carrier: Carrier | undefined, prev: Composition | undefined, index: number): Composition;
/** Enforce "no two consecutive pages share a composition" over an already-assigned list. */
export declare function breakCompositionRuns(list: Composition[], jobs: string[]): Composition[];
export declare function coerceDeckBrief(raw: unknown): DeckBrief;
/**
 * Deterministic rhythm when the organizer left it blank: cover / section /
 * close anchor, every fourth content page breathes, the rest are dense.
 */
export declare function defaultRhythm(index: number, total: number, job: string): PageRhythm;
/** Relationship guess from the points when the organizer left it blank. */
export declare function inferRelationship(points: string[], job: string): Relationship;
/** Builtin + registered custom system ids (custom ids use `_`, so no hyphen normalisation is applied to them). */
export declare function systemIdsPromptLine(): string;
