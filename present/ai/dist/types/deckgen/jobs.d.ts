/**
 * Per-page visual job — a hint for the canvas author, not a skeleton lock.
 * With a Design Brief (organize) the job also carries relationships /
 * rhythm / core message / carrier; without one, the heuristics below fill in.
 */
import { type Carrier, type Composition, type PageBrief, type PageRhythm, type PhotoRhythm, type Relationship } from "./brief.js";
export type VisualJob = "cover" | "agenda" | "section" | "claim" | "quote" | "evidence" | "sequence" | "compare" | "figure" | "data" | "close";
export interface PageJobItem extends PageBrief {
    title: string;
    bullets?: string[];
    imageIdea?: string;
    layoutHint?: string;
    deckgenLayout?: string;
}
export interface PageJob {
    index: number;
    job: VisualJob;
    title: string;
    bullets: string[];
    imageIdea?: string;
    /** Prefer a full-bleed photo field when a real src is available. */
    wantsPhoto: boolean;
    coreMessage?: string;
    audienceMove?: string;
    relationships: Relationship;
    rhythm: PageRhythm;
    carrier?: Carrier;
    composition: Composition;
}
export declare function jobFromOutlineItem(item: PageJobItem, index: number, total: number): VisualJob;
export declare function jobsFromPages(items: PageJobItem[], deckTitle?: string): PageJob[];
/**
 * Enforce the deck's photo decision over the page jobs (mutates in place). Photo pages get
 * carrier=photo + wantsPhoto; every other page loses both, so a stray interior photograph or a
 * paper section page cannot break the rhythm. `editorial` leaves the organizer's per-page picks.
 * Compositions are re-derived for the pages whose carrier changed, then de-duplicated again.
 */
export declare function applyPhotoRhythm(jobs: PageJob[], rhythm: PhotoRhythm): void;
/** Page briefs in slide order (for reflectCanvas). */
export declare function briefsFromJobs(jobs: PageJob[]): PageBrief[];
