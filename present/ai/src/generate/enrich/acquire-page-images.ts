/**
 * Fetch real image srcs per page BEFORE canvas authoring.
 * Does not mutate a Presentation (no empty frames, no post-hoc hero insert).
 */

import type { AiConfig } from "../../config/types";
import type { PageJob } from "../../deckgen/jobs.js";
import type { ImageEnrichmentPriority, ImagePromptContext } from "./fetch-enrichment-image";
import {
  DEFAULT_IMAGE_ENRICHMENT_PRIORITY,
  fetchEnrichmentImageDataUrl,
  imageEnrichmentAvailable,
  imageEnrichmentSources,
  resolveImageGenConcurrency,
} from "./fetch-enrichment-image";

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
  onProgress?: (p: { done: number; total: number; skippedAll?: boolean }) => void;
}

/**
 * Every photo costs a stock request plus a data URL in the author prompt, so the organizer's
 * "one photo per 3–4 pages" is capped here: cover + close + one interior per ~3 content pages.
 */
export function maxPhotosForDeck(pages: number): number {
  if (pages <= 1) return 1;
  return 2 + Math.max(0, Math.ceil((pages - 2) / 3));
}

/**
 * The stock / AI query for one photo page. A page the organizer left without an imageIdea
 * borrows the deck's visual world (the cover's idea, else any other photo page's) — searching
 * stock for `topic + title` returns app screenshots and logos, and text in the photo fights the
 * title set on top of it.
 */
export function photoQueryFor(job: PageJob, jobs: readonly PageJob[], topic?: string): string {
  if (job.imageIdea) return job.imageIdea;
  const world = jobs.find((j) => j.job === "cover" && j.imageIdea)?.imageIdea ?? jobs.find((j) => j.wantsPhoto && j.imageIdea)?.imageIdea;
  return world || `${topic ?? ""} ${job.title}`.trim();
}

/** Pages that want a photo, ranked so the cap trims the least important first. */
export function rankPhotoJobs(jobs: PageJob[]): PageJob[] {
  const score = (j: PageJob): number => {
    if (j.job === "cover") return 0;
    if (j.job === "close") return 1;
    if (j.carrier === "photo" && j.imageIdea) return 2;
    if (j.carrier === "photo") return 3;
    if (j.imageIdea && j.rhythm === "anchor") return 4;
    if (j.imageIdea) return 5;
    return 6;
  };
  return jobs
    .filter((j) => j.wantsPhoto && (j.imageIdea || j.carrier === "photo" || j.job === "cover" || j.job === "figure" || j.job === "close"))
    .map((j, i) => ({ j, i, s: score(j) }))
    .sort((a, b) => a.s - b.s || a.i - b.i)
    .map((x) => x.j);
}

export async function acquirePageImages(
  jobs: PageJob[],
  opts: AcquirePageImagesOptions,
): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (!imageEnrichmentAvailable(opts.config)) {
    opts.onProgress?.({ done: 0, total: 0, skippedAll: true });
    return out;
  }
  // Every carrier=photo page is the photograph by the deck's rhythm; the cap only trims optional
  // interior pictures, never an anchor.
  const mustHaveCount = jobs.filter((j) => j.wantsPhoto && j.carrier === "photo").length;
  const cap = Math.max(1, mustHaveCount, opts.maxPhotos ?? maxPhotosForDeck(jobs.length));
  const tasks = rankPhotoJobs(jobs)
    .slice(0, cap)
    .sort((a, b) => a.index - b.index);
  if (!tasks.length) return out;

  const { stock, ai } = imageEnrichmentSources(opts.config);
  const concurrency = Math.max(1, ai ? resolveImageGenConcurrency(opts.config) : 4);
  const priority = opts.imageEnrichmentPriority ?? DEFAULT_IMAGE_ENRICHMENT_PRIORITY;
  const usedUrls = new Set<string>();
  const aiGate = { aiPaused: false, reason: undefined as string | undefined };
  const promptContext: ImagePromptContext = {
    ...(opts.styleFamily ? { styleFamily: opts.styleFamily } : {}),
    ...(opts.accent ? { accent: opts.accent } : {}),
    ...(opts.language ? { language: opts.language } : {}),
    ...(opts.topic ? { deckTopic: opts.topic } : {}),
    vibe: "cinematic photography, full-bleed editorial, shallow depth of field, no text in image",
  };

  let done = 0;
  opts.onProgress?.({ done: 0, total: tasks.length });

  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < tasks.length) {
      const job = tasks[cursor++]!;
      const query = photoQueryFor(job, jobs, opts.topic);
      const ac = new AbortController();
      const onAbort = () => ac.abort();
      opts.signal?.addEventListener("abort", onAbort, { once: true });
      // Cover / close / carrier=photo pages are the photograph — without one the brief fails its
      // gate and the page falls back to a gradient. Stock latency over a proxy swings 2–10s, so
      // give those pages a second, longer attempt instead of accepting one timed-out miss.
      const mustHave = job.job === "cover" || job.job === "close" || job.carrier === "photo";
      try {
        for (let attempt = 0; attempt < (mustHave ? 2 : 1); attempt++) {
          if (ac.signal.aborted) break;
          const result = await fetchEnrichmentImageDataUrl(query, opts.config, {
            kind: "bg",
            priority,
            signal: ac.signal,
            stockTimeoutMs: attempt === 0 ? 8000 : 15000,
            targetAspect: 1280 / 720,
            usedUrls,
            tone: opts.tone ?? "dark",
            promptContext: { ...promptContext, slideTitle: job.title },
            aiGate,
          });
          if (result?.dataUrl) {
            out.set(job.index, result.dataUrl);
            break;
          }
        }
      } finally {
        opts.signal?.removeEventListener("abort", onAbort);
        done += 1;
        opts.onProgress?.({ done, total: tasks.length });
      }
    }
  }

  const n = Math.min(concurrency, tasks.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  void stock;
  return out;
}
