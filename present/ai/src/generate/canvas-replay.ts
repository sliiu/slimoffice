/**
 * Offline replay of a raw canvas-author dump (what `onCanvasAuthored` wrote) through
 * normalize → zod → toFilled → snap/reflect. No LLM call. This is how a live-run
 * finding gets turned into a normalizer / gate fix without paying for another run:
 * every "why did this element drop" or "why did the gate fire" is answerable here.
 */

import type { GenerateDeckResult } from "../deckgen/pipeline.js";
import { compileCanvasDeck, type CanvasStats } from "../deckgen/pipeline.js";
import { resolveVisualSystem } from "../deckgen/visual-system.js";
import { themeFromAuthoredLook } from "../deckgen/color-theme.js";
import { briefsFromJobs } from "../deckgen/jobs.js";
import { CanvasDeckSchema, normalizeCanvasDeck } from "./canvas-schema.js";
import { toFilled } from "./canvas-author.js";
import { jobsFromOutline } from "./deckgen-adapter.js";
import type { Outline } from "./schema.js";

/** 1×1 transparent PNG; only has to pass `realImageSrc`. */
const PLACEHOLDER_PHOTO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

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

export function replayCanvasDump(input: ReplayCanvasInput): ReplayCanvasResult {
  const jobs = jobsFromOutline(input.outline);
  const briefs = briefsFromJobs(jobs);
  const normalized = normalizeCanvasDeck(input.raw);
  const parsed = CanvasDeckSchema.safeParse(normalized);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 20).map((iss) => `${iss.path.join(".")}: ${iss.message}`);
    throw new ReplaySchemaError(issues);
  }
  const deck = parsed.data;
  // Live runs hand the author real photos; offline we have none, so stand in a 1×1 PNG on every
  // page the model made a photo page. Otherwise every photo-dependent gate (full-bleed, anchor
  // weight, scrim) fires spuriously and the replay stops matching the live findings.
  const images = input.images ?? new Map<number, string>();
  if (!input.images) {
    deck.slides.forEach((s, i) => {
      if (s.background?.kind === "image") images.set(jobs[i]?.index ?? i, PLACEHOLDER_PHOTO);
    });
  }
  const slides = toFilled(deck, jobs, images);
  const system = resolveVisualSystem(deck.systemId);
  const theme = themeFromAuthoredLook({
    systemId: deck.systemId,
    ...(deck.themeId ? { themeId: deck.themeId } : {}),
    ...(deck.palette ? { palette: deck.palette } : {}),
    ...(input.brand ? { brand: input.brand } : {}),
  });
  const compiled = compileCanvasDeck({ system, theme, slides, title: input.outline.title, briefs });
  const meta = (compiled.presentation.meta ?? {}) as { deckgen?: { canvasStats?: CanvasStats } };
  const stats = meta.deckgen?.canvasStats ?? { pages: slides.length, kinds: {}, devices: {}, scrimPages: 0, photoPages: 0, drops: [], findings: compiled.reflect.findings.length };
  return { systemId: deck.systemId, compiled, stats, schemaIssues: [] };
}

export class ReplaySchemaError extends Error {
  constructor(public readonly issues: string[]) {
    super(`canvas dump failed schema validation after normalize:\n${issues.map((i) => `  - ${i}`).join("\n")}`);
    this.name = "ReplaySchemaError";
  }
}
