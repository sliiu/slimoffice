/**
 * Fetch real image srcs per page BEFORE canvas authoring.
 * Does not mutate a Presentation (no empty frames, no post-hoc hero insert).
 */
import type { AiConfig } from "../../config/types.js";
import type { PageJob } from "../../deckgen/jobs.js";
import type { ImageEnrichmentPriority } from "./fetch-enrichment-image.js";
export interface AcquirePageImagesOptions {
    config: AiConfig;
    topic?: string;
    styleFamily?: string;
    language?: string;
    accent?: string;
    signal?: AbortSignal;
    imageEnrichmentPriority?: ImageEnrichmentPriority;
    /** Upper bound on photos per deck; defaults to `maxPhotosForDeck(jobs.length)`. */
    maxPhotos?: number;
    /**
     * Deck tone the photographs must share. Full-bleed photos sit under a scrim, so `dark`
     * (muted, low-key pictures) is the default; a light-paper system can ask for `light`.
     */
    tone?: "dark" | "light";
    onProgress?: (p: {
        done: number;
        total: number;
        skippedAll?: boolean;
    }) => void;
}
/**
 * Every photo costs a stock request plus a data URL in the author prompt, so the organizer's
 * "one photo per 3–4 pages" is capped here: cover + close + one interior per ~3 content pages.
 */
export declare function maxPhotosForDeck(pages: number): number;
/**
 * The stock / AI query for one photo page. A page the organizer left without an imageIdea
 * borrows the deck's visual world (the cover's idea, else any other photo page's) — searching
 * stock for `topic + title` returns app screenshots and logos, and text in the photo fights the
 * title set on top of it.
 */
export declare function photoQueryFor(job: PageJob, jobs: readonly PageJob[], topic?: string): string;
/** Pages that want a photo, ranked so the cap trims the least important first. */
export declare function rankPhotoJobs(jobs: PageJob[]): PageJob[];
export declare function acquirePageImages(jobs: PageJob[], opts: AcquirePageImagesOptions): Promise<Map<number, string>>;
