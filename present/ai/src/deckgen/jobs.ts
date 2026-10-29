/**
 * Per-page visual job — a hint for the canvas author, not a skeleton lock.
 * With a Design Brief (organize) the job also carries relationships /
 * rhythm / core message / carrier; without one, the heuristics below fill in.
 */

import {
  breakCompositionRuns,
  defaultComposition,
  defaultRhythm,
  inferRelationship,
  type Carrier,
  type Composition,
  type PageBrief,
  type PageRhythm,
  type PhotoRhythm,
  type Relationship,
} from "./brief.js";

export type VisualJob =
  | "cover"
  | "agenda"
  | "section"
  | "claim"
  | "quote"
  | "evidence"
  | "sequence"
  | "compare"
  | "figure"
  | "data"
  | "close";

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

const PHOTO_JOBS = new Set<VisualJob>(["cover", "figure", "claim", "close", "section"]);

export function jobFromOutlineItem(item: PageJobItem, index: number, total: number): VisualJob {
  const hint = (item.layoutHint ?? item.deckgenLayout ?? "").toLowerCase();
  if (hint === "cover" || hint === "hero" || index === 0) return "cover";
  if (hint === "closing" || hint === "close" || (total > 1 && index === total - 1)) return "close";
  if (hint === "agenda" || hint === "toc" || hint === "contents") return "agenda";
  if (hint === "section") return "section";
  if (hint === "quote") return "quote";
  if (hint === "chart" || hint === "metrics" || hint === "table") return "data";
  if (hint === "comparison" || hint === "two-column") return "compare";
  if (hint === "image-text" || hint === "figure") return "figure";
  if (hint === "process" || hint === "timeline") return "sequence";
  if (hint === "cards" || hint === "bullets" || hint === "content") return "evidence";
  if (item.relationships === "order" || item.relationships === "flow") return "sequence";
  if (item.relationships === "contrast") return "compare";
  if (item.carrier === "chart" || item.carrier === "table") return "data";
  if (item.carrier === "photo" && index > 0) return "figure";
  if (/\?\s*$/.test(item.title) || [...item.title].length > 42) return "quote";
  return "evidence";
}

export function jobsFromPages(items: PageJobItem[], deckTitle = ""): PageJob[] {
  const total = items.length;
  const jobs: PageJob[] = [];
  let prevComposition: Composition | undefined;
  items.forEach((item, index) => {
    const job = jobFromOutlineItem(item, index, total);
    const bullets = (item.bullets ?? []).map((b) => b.trim()).filter(Boolean);
    const imageIdea = item.imageIdea?.trim();
    const relationships = item.relationships ?? inferRelationship(bullets, job);
    const rhythm = item.rhythm ?? defaultRhythm(index, total, job);
    const carrier = item.carrier;
    // carrier=photo always wants one; an imageIdea wants one unless the page is a chart/table page;
    // without a brief, fall back to the job heuristic.
    const wantsPhoto = carrier
      ? carrier === "photo" || (Boolean(imageIdea) && carrier !== "chart" && carrier !== "table")
      : PHOTO_JOBS.has(job) || Boolean(imageIdea);
    const composition = item.composition ?? defaultComposition(job, rhythm, carrier, prevComposition, index);
    prevComposition = composition;
    jobs.push({
      index,
      job,
      title: item.title.trim() || deckTitle,
      bullets,
      ...(imageIdea ? { imageIdea } : {}),
      wantsPhoto,
      ...(item.coreMessage ? { coreMessage: item.coreMessage } : {}),
      ...(item.audienceMove ? { audienceMove: item.audienceMove } : {}),
      relationships,
      rhythm,
      ...(carrier ? { carrier } : {}),
      composition,
    });
  });
  // Organizer-authored compositions may still repeat back to back; break the runs.
  const fixed = breakCompositionRuns(
    jobs.map((j) => j.composition),
    jobs.map((j) => j.job),
  );
  fixed.forEach((c, i) => {
    jobs[i]!.composition = c;
  });
  return jobs;
}

/** Jobs whose page is an anchor by role, whatever rhythm the organizer wrote. */
const ANCHOR_JOBS = new Set<VisualJob>(["cover", "close", "section"]);

/**
 * Enforce the deck's photo decision over the page jobs (mutates in place). Photo pages get
 * carrier=photo + wantsPhoto; every other page loses both, so a stray interior photograph or a
 * paper section page cannot break the rhythm. `editorial` leaves the organizer's per-page picks.
 * Compositions are re-derived for the pages whose carrier changed, then de-duplicated again.
 */
export function applyPhotoRhythm(jobs: PageJob[], rhythm: PhotoRhythm): void {
  if (rhythm === "editorial") return;
  const isPhotoPage = (j: PageJob): boolean => {
    if (rhythm === "none") return false;
    // A chart / table / diagram / device anchor keeps its figure; only type pages become photographs.
    if (j.carrier != null && j.carrier !== "photo" && j.carrier !== "typeOnly") return false;
    if (ANCHOR_JOBS.has(j.job)) return rhythm === "anchors" || j.job !== "section";
    if (rhythm === "bookends") return false;
    return j.rhythm === "anchor";
  };
  let prev: Composition | undefined;
  jobs.forEach((j, i) => {
    const photo = isPhotoPage(j);
    const nextCarrier: Carrier | undefined = photo ? "photo" : j.carrier === "photo" ? "typeOnly" : j.carrier;
    if (nextCarrier !== j.carrier) {
      if (nextCarrier) j.carrier = nextCarrier;
      j.composition = defaultComposition(j.job, j.rhythm, nextCarrier, prev, i);
    }
    j.wantsPhoto = photo;
    prev = j.composition;
  });
  const fixed = breakCompositionRuns(
    jobs.map((j) => j.composition),
    jobs.map((j) => j.job),
  );
  fixed.forEach((c, i) => {
    jobs[i]!.composition = c;
  });
}

/** Page briefs in slide order (for reflectCanvas). */
export function briefsFromJobs(jobs: PageJob[]): PageBrief[] {
  return jobs.map((j) => ({
    ...(j.coreMessage ? { coreMessage: j.coreMessage } : {}),
    ...(j.audienceMove ? { audienceMove: j.audienceMove } : {}),
    relationships: j.relationships,
    rhythm: j.rhythm,
    ...(j.carrier ? { carrier: j.carrier } : {}),
    composition: j.composition,
  }));
}
