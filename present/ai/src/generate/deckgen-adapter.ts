/**
 * Adapter: live generate entry (topic / outline) → canvas author (or no-key fill)
 * → polish (research/organize/images/QA/art director) → editable SlimPPT Presentation.
 *
 * Does not reimplement the catalog. Pairing / layout / variant ids are
 * imported from `packages/ai/src/deckgen` and re-asserted at this boundary.
 *
 * Product generate is always this path. `useDeckgen` is ignored.
 */

import {
  applyInitialEntranceState,
  computeInitialEntranceState,
  type Presentation,
} from "@ppt/core";
import {
  CANVAS,
  DEFAULT_COLOR_THEME,
  LAYOUT_IDS,
  LAYOUT_VARIANTS,
  assertThemePairing,
  compileCanvasDeck,
  emitPresentation,
  findContentTitle,
  generateDeck,
  isColorThemeId,
  isLayoutId,
  isVariantForLayout,
  isVisualSystemId,
  parseBrandHex,
  resolveVisualSystem,
  themeFromAuthoredLook,
  type CanvasStats,
  type ColorThemeId,
  type FilledSlide,
  type GenerateDeckInput,
  type GenerateDeckResult,
  type ReflectFinding,
  reflectCanvas,
  type VisualSystem,
  type VisualSystemId,
} from "../deckgen/index.js";
import { applyPhotoRhythm, briefsFromJobs, jobsFromPages, type PageJob } from "../deckgen/jobs.js";
import { coerceDeckBrief, coercePageBrief, defaultFolio, defaultPhotoRhythm, folioFromNotes, notesWantPhotos, photoRhythmFromNotes, type DeckBrief } from "../deckgen/brief.js";
import { authorCanvasDeck, canvasChunkIndexes, canvasExtraChunks } from "./canvas-author.js";
import { copyTargetsFromSlides, isCopyVoiceIssue, mirrorOutlineCopy, rewriteCopyVoice } from "./copy-rewrite.js";
import { acquirePageImages } from "./enrich/acquire-page-images.js";
import { defaultConfig } from "../config/types.js";
import { isConfigUsable } from "../config/presets.js";
import { createLlm } from "../llm/client.js";
import { autoAnimatePresentation } from "../animations.js";
import { speechPlanFromOutlineItem } from "./reveal-order.js";
import {
  DeckgenUserError,
  formatDeckgenUserError,
  pagesFromOutline,
} from "./deckgen-ui.js";
import { rethrowIfAborted, shouldCommitGeneratedDeck, throwIfAborted } from "./abort.js";
import { throwIfPipelineP2Inject, resumeSkipFlags } from "./qa/pipeline-p2-policy.js";
import { UsageCounter } from "./usage-counter.js";
import {
  createPolishContext,
  enrichOutlineContent,
  polishGeneratedDeck,
} from "./polish.js";
import type { GuidanceInput, Outline } from "./schema.js";
import type { GenerateOptions, PipelineEvent } from "./types.js";

/** Live generate is always deckgen. `useDeckgen` is a no-op kept for call-site compatibility. */
export function isDeckgenGenerateEnabled(_opts?: Pick<GenerateOptions, "useDeckgen">): boolean {
  return true;
}

/**
 * Map leftover styleFamily / visualSystem hints onto the two-id whitelist.
 * Used by the no-key fill fallback. Live author picks systemId itself.
 */
export function resolveDeckgenSystem(guidance: GuidanceInput): VisualSystemId {
  const family = (guidance.styleFamily ?? "").trim().toLowerCase();
  if (isVisualSystemId(family)) return family;
  if (family.includes("swiss")) return "swiss";
  if (family.includes("editorial")) return "editorial";
  const vs = String(guidance.visualSystem ?? "").trim().toLowerCase();
  if (isVisualSystemId(vs)) return vs;
  // Design P1: B = light magazine → editorial. A / unset → editorial default.
  if (guidance.visualSystem === "B") return "editorial";
  return "editorial";
}

/**
 * Named ColorTheme is a seed. Unpaired ids are allowed on the canvas path;
 * fill fallback remaps to the system default.
 */
export function resolveDeckgenTheme(systemId: VisualSystemId, themeHint?: string): ColorThemeId {
  const hint = (themeHint ?? "").trim();
  if (hint && isColorThemeId(hint)) return hint;
  return DEFAULT_COLOR_THEME[systemId];
}

export function fillThemeId(systemId: VisualSystemId, themeId?: string): ColorThemeId {
  const id = resolveDeckgenTheme(systemId, themeId);
  try {
    assertThemePairing(systemId, id);
    return id;
  } catch {
    return DEFAULT_COLOR_THEME[systemId];
  }
}

export function materialsFromGuidance(guidance: GuidanceInput, outline?: Outline): string[] {
  const fromOutline =
    outline?.slides.flatMap((s) => [s.title, ...(s.bullets ?? [])].map((t) => t.trim()).filter(Boolean)) ?? [];
  const fromGuidance = [guidance.goals, guidance.scenario, guidance.extraNotes]
    .map((t) => (t ?? "").trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of [...fromOutline, ...fromGuidance]) {
    if (seen.has(line)) continue;
    seen.add(line);
    out.push(line);
  }
  return out;
}

/** Map generate guidance (+ optional user outline) onto deckgen fill input. */
export function toDeckgenInput(guidance: GuidanceInput, outline?: Outline): GenerateDeckInput {
  const systemId = resolveDeckgenSystem(guidance);
  const themeId = fillThemeId(systemId, guidance.themeId);
  const topic = (outline?.title || guidance.topic || "").trim() || "Untitled";
  const materials = materialsFromGuidance(guidance, outline);
  const audience = (guidance.audience ?? outline?.subtitle)?.trim();
  const language = guidance.language?.trim();
  const pages = outline?.slides.length ? pagesFromOutline(outline) : undefined;
  return {
    topic,
    systemId,
    themeId,
    ...(materials.length ? { materials } : {}),
    ...(audience ? { audience } : {}),
    ...(language ? { language } : {}),
    ...(pages?.length ? { pages } : {}),
  };
}

/** Fill-path boundary: system exists; outline pages still whitelist. Pairing is remapped, not thrown. */
export function assertDeckgenBoundary(input: GenerateDeckInput): void {
  if (!isVisualSystemId(input.systemId)) {
    throw new DeckgenUserError("pairing", `Unknown VisualSystem "${input.systemId}".`);
  }
  const themeId = input.themeId ?? DEFAULT_COLOR_THEME[input.systemId];
  if (!isColorThemeId(themeId)) {
    throw new DeckgenUserError("pairing", `Unknown ColorTheme "${themeId}".`);
  }
  for (const page of input.pages ?? []) {
    if (!isLayoutId(page.layout)) {
      throw new DeckgenUserError("invented-page-type", `Unknown Layout "${page.layout}".`);
    }
    if (!isVariantForLayout(page.layout, page.variant)) {
      throw new DeckgenUserError("invented-variant", `Variant "${page.variant}" is not valid for ${page.layout}.`);
    }
  }
}

function emitProgress(opts: GenerateOptions, event: PipelineEvent): void {
  opts.onProgress?.(event);
}

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
export function mergeCanvasPages(first: CanvasPass, second: CanvasPass): FilledSlide[] | undefined {
  if (first.slides.length !== second.slides.length) return undefined;
  const perPage = (pass: CanvasPass): number[] => {
    const counts = new Array<number>(pass.slides.length).fill(0);
    for (const f of pass.compiled.reflect.findings) {
      if (f.slideIdx >= 0 && f.slideIdx < counts.length) counts[f.slideIdx]! += 1;
    }
    return counts;
  };
  const a = perPage(first);
  const b = perPage(second);
  let tookFirst = 0;
  const merged = second.slides.map((s, i) => {
    if (a[i]! < b[i]!) {
      tookFirst += 1;
      return first.slides[i]!;
    }
    return s;
  });
  return tookFirst ? merged : undefined;
}

/**
 * Pages a repair pass must touch, or undefined when a deck-level finding does not name its pages
 * (then the whole deck is re-authored). Also undefined when the scope would be the whole deck
 * anyway (≥ 60 % of pages) — one coherent pass beats stitching most of the deck back together.
 */
export function repairScope(findings: ReflectFinding[], pageCount: number): number[] | undefined {
  const pages = new Set<number>();
  for (const f of findings) {
    if (f.slideIdx >= 0 && f.slideIdx < pageCount) {
      pages.add(f.slideIdx);
      continue;
    }
    if (!f.pages?.length) return undefined;
    for (const p of f.pages) if (p >= 0 && p < pageCount) pages.add(p);
  }
  if (!pages.size || pages.size >= Math.ceil(pageCount * 0.6)) return undefined;
  return [...pages].sort((a, b) => a - b);
}

/**
 * Folio decision, in priority order: explicit `guidance.pageNumbers` → the user's own words in
 * extraNotes / goals ("加页码", "no page numbers") → the organizer's Design Brief → a deck-mode /
 * length default. The result is always a boolean so snap can enforce it.
 */
export function withFolioDecision(brief: DeckBrief, guidance: GuidanceInput, pageCount: number): DeckBrief {
  const folio = guidance.pageNumbers ?? folioFromNotes(guidance.extraNotes, guidance.goals) ?? brief.folio ?? defaultFolio(brief.mode, pageCount);
  return { ...brief, folio };
}

/**
 * Photo decision, in priority order: the user's own words ("不要配图", "photo-heavy") → the
 * organizer's Design Brief → a deck-mode default. Always set, so `applyPhotoRhythm` can enforce it.
 */
export function withPhotoDecision(brief: DeckBrief, guidance: GuidanceInput): DeckBrief {
  const fromNotes = photoRhythmFromNotes(guidance.extraNotes, guidance.goals);
  // The organizer may answer "none" to a brief that asked for photographs on the cover (a
  // white-paper skill nudges it there); the user's ask wins, at the anchor-page default.
  const organizer = brief.photoRhythm === "none" && notesWantPhotos(guidance.extraNotes, guidance.goals) ? "anchors" : brief.photoRhythm;
  const photoRhythm = fromNotes ?? organizer ?? defaultPhotoRhythm(brief.mode);
  return { ...brief, photoRhythm };
}

/**
 * Photo pages whose fetch missed borrow the nearest fetched photograph (cover first, then by page
 * distance). Cover and close sharing one picture is an editorial convention; a paper page between
 * photo anchors is not. Returns the pages that were filled.
 */
export function fillMissingPhotos(jobs: PageJob[], images: Map<number, string>): number[] {
  const have = jobs.filter((j) => images.has(j.index)).map((j) => j.index);
  if (!have.length) return [];
  const filled: number[] = [];
  for (const j of jobs) {
    if (j.carrier !== "photo" || images.has(j.index)) continue;
    const donor = have.includes(0) ? 0 : have.reduce((best, i) => (Math.abs(i - j.index) < Math.abs(best - j.index) ? i : best), have[0]!);
    images.set(j.index, images.get(donor)!);
    filled.push(j.index);
  }
  return filled;
}

/** One line per page the later pass must leave alone: index · job · title · composition · folio, plus a short "says" so the next chunk does not repeat those facts. */
export function describeUnchangedPages(
  slides: Array<FilledSlide | undefined>,
  jobs: PageJob[],
  scope: number[],
  system: VisualSystem,
): string {
  const skip = new Set(scope);
  return slides
    .map((s, i) => {
      if (!s || skip.has(i)) return "";
      const job = jobs[i];
      const title = findContentTitle(s.elements, system)?.text ?? s.elements.find((e) => e.kind === "text" && e.text)?.text ?? "";
      const folio = s.elements.find((e) => e.kind === "text" && e.text && /^\d{1,2}$/.test(e.text.trim()) && e.bbox.y < CANVAS.height / 3)?.text;
      const said = s.elements
        .filter((e) => e.kind === "text" && e.text && e.text.trim() !== title.trim() && !/^\d{1,2}$/.test(e.text.trim()))
        .map((e) => e.text!.trim().replace(/\s+/g, " "))
        .slice(0, 3)
        .join(" · ")
        .slice(0, 96);
      return `#${i} · ${job?.job ?? s.layout} · ${title.slice(0, 40)} · ${job?.composition ?? "-"}${folio ? ` · folio ${folio.trim()}` : ""}${said ? ` · says ${said}` : ""}`;
    })
    .filter(Boolean)
    .join("\n");
}

function logCanvasPass(pass: "author" | "repair", systemId: string, compiled: GenerateDeckResult): void {
  const meta = compiled.presentation.meta as { deckgen?: { canvasStats?: CanvasStats } } | undefined;
  const stats = meta?.deckgen?.canvasStats;
  const fmt = (r: Record<string, number> | undefined) =>
    Object.entries(r ?? {})
      .map(([k, v]) => `${k}=${v}`)
      .join(" ") || "-";
  console.info(
    `[ai] canvas ${pass}: system=${systemId} pages=${stats?.pages ?? "?"} passed=${compiled.reflect.passed}\n` +
      `      kinds: ${fmt(stats?.kinds)}\n` +
      `      devices: ${fmt(stats?.devices)} · photo=${stats?.photoPages ?? 0} scrim=${stats?.scrimPages ?? 0}\n` +
      `      drops(${stats?.drops.length ?? 0}): ${stats?.drops.slice(0, 6).join(" | ") || "-"}`,
  );
  for (const f of compiled.reflect.findings.slice(0, 12)) console.info(`      [${f.kind} #${f.slideIdx}] ${f.issue}`);
}

function rethrowAsUserError(e: unknown): never {
  if (e instanceof DeckgenUserError) throw e;
  const raw = e instanceof Error ? e.message : String(e);
  const kind = raw.includes("cannot pair")
    ? "pairing"
    : /Unknown Layout|invented layout|No skeleton/.test(raw)
      ? "invented-layout"
      : /Variant .+ is not valid|invented variant/.test(raw)
        ? "invented-variant"
        : /Unknown beat intent|page type/.test(raw)
          ? "invented-page-type"
          : /exceeds|over.?slot/.test(raw)
            ? "over-slots"
            : "unknown";
  if (kind === "unknown") {
    throw new DeckgenUserError("unknown", formatDeckgenUserError(e));
  }
  throw new DeckgenUserError(kind, raw);
}

/**
 * Sync compile only (no LLM, no images, no QA, no motion). Tests that need a
 * locked Presentation IR without polish should call this.
 */
export function compileDeckgenPresentation(
  guidance: GuidanceInput,
  outline: Outline | undefined,
): Presentation {
  let input: GenerateDeckInput;
  try {
    input = toDeckgenInput(guidance, outline);
    assertDeckgenBoundary(input);
  } catch (e) {
    rethrowAsUserError(e);
  }

  let result;
  try {
    result = generateDeck({ ...input, skipReflectAssert: true });
  } catch (e) {
    rethrowAsUserError(e);
  }

  for (const slide of result.presentation.slides) {
    const layout = slide.customData?.tags?.layout ?? "";
    const variant = slide.customData?.tags?.variant ?? "";
    if (!isLayoutId(layout) || !LAYOUT_IDS.includes(layout)) {
      throw new DeckgenUserError("invented-layout", `deckgen emitted invented layout "${layout}".`);
    }
    if (!isVariantForLayout(layout, variant)) {
      const allowed = LAYOUT_VARIANTS[layout].join(", ");
      throw new DeckgenUserError(
        "invented-variant",
        `deckgen emitted invented variant "${variant}" for ${layout}. Allowed: ${allowed}.`,
      );
    }
  }

  return result.presentation;
}

function applyMotion(pres: Presentation, opts: GenerateOptions, outline?: Outline): void {
  if (opts.enableAnimations === false) {
    emitProgress(opts, { stage: "compile", progress: 0.97, detailKey: "animate.skipped" });
    return;
  }
  emitProgress(opts, { stage: "compile", progress: 0.92, detailKey: "animate.applying" });
  try {
    autoAnimatePresentation(pres, {
      ...(opts.motionBundle ? { bundle: opts.motionBundle } : {}),
      ...(opts.motionBundleId ? { bundleId: opts.motionBundleId } : {}),
      ...(opts.maxEffectsPerSlide !== undefined ? { maxEffects: opts.maxEffectsPerSlide } : {}),
      ...(outline
        ? {
            revealForSlide: (index) => {
              const item = outline.slides[index];
              return item ? speechPlanFromOutlineItem(item) : undefined;
            },
          }
        : {}),
    });
    for (const slide of pres.slides) {
      applyInitialEntranceState(slide, computeInitialEntranceState(slide));
    }
    emitProgress(opts, { stage: "compile", progress: 0.96, detailKey: "animate.ready" });
  } catch (e) {
    rethrowIfAborted(opts.signal, e);
    if (opts.debug) console.warn("[ai] deckgen motion failed (non-fatal):", e);
    emitProgress(opts, { stage: "compile", progress: 0.96, detailKey: "animate.failed" });
  }
}

/**
 * Run deckgen and return the same Presentation IR the editor already loads
 * (`loadPresentation` / `previewGeneratedPresentation`).
 *
 * With a usable text config: research + organize the outline, then compile,
 * enrich images, QA-repair, art-director recolor, motion.
 * Without a key: compile the reviewed outline (or narrative template) only.
 */
export async function generatePresentationViaDeckgen(
  guidance: GuidanceInput,
  outline: Outline | undefined,
  opts: GenerateOptions = {},
): Promise<Presentation> {
  throwIfAborted(opts.signal);
  const usage = new UsageCounter();
  const ctx = createPolishContext({
    ...opts,
    onLlmUsage: (u) => {
      usage.addCall(u);
      opts.onLlmUsage?.(u);
    },
    onProgress: (p) => {
      opts.onProgress?.({ ...p, usage: usage.snapshot() });
    },
  });
  const { skipPlan, skipLayout, skipWrite } = resumeSkipFlags(opts.resume?.stage);

  let working = skipPlan && opts.resume?.outline ? opts.resume.outline : outline;
  if (working && !skipPlan) {
    working = await enrichOutlineContent(working, guidance, opts, ctx);
    opts.onOutlineOrganized?.(working);
  } else if (working) {
    opts.onOutlineOrganized?.(working);
  }

  if (!skipPlan) throwIfPipelineP2Inject(opts.pipelineP2Inject, "plan");
  throwIfAborted(opts.signal);
  if (!skipPlan) ctx.emit({ stage: "outline", progress: 0.15, detailKey: "outline.ready" });

  if (!skipLayout) {
    throwIfPipelineP2Inject(opts.pipelineP2Inject, "layout");
    ctx.emit({ stage: "compile", progress: 0.45, detailKey: "compile.composing" });
  }

  const config = opts.config ?? defaultConfig();
  const brand = parseBrandHex(guidance.extraNotes);
  let pres: Presentation | undefined =
    skipLayout && opts.resume?.presentation ? structuredClone(opts.resume.presentation) : undefined;

  const canvasExtras = canvasExtraChunks(working?.slides.length ?? 0, ctx.budget.remaining());
  if (!pres && working?.slides.length && isConfigUsable(config) && ctx.budget.tryConsume()) {
    try {
      const jobs = jobsFromOutline(working);
      const deckBrief = withPhotoDecision(withFolioDecision(coerceDeckBrief(working.designBrief), guidance, jobs.length), guidance);
      // One photo decision for the whole deck, enforced before acquisition so only the pages that
      // will carry a photograph fetch one.
      applyPhotoRhythm(jobs, deckBrief.photoRhythm!);
      const images = await acquirePageImages(jobs, {
        config,
        topic: working.title || guidance.topic,
        ...(guidance.language ? { language: guidance.language } : {}),
        ...(opts.signal ? { signal: opts.signal } : {}),
        ...(opts.imageEnrichmentPriority ? { imageEnrichmentPriority: opts.imageEnrichmentPriority } : {}),
        onProgress: (p) => {
          if (p.skippedAll) return;
          ctx.emit({
            stage: "compile",
            progress: 0.35 + 0.1 * (p.done / Math.max(1, p.total)),
            detailKey: "compile.image",
            detailParams: { done: p.done, total: p.total },
          });
        },
      });
      // A photo page whose photograph never arrived borrows a sibling's (the cover's first): the
      // deck keeps one rhythm instead of one paper page among photo anchors. Only when no photo
      // arrived at all is the carrier downgraded — before the brief is derived, so the author
      // prompt and the reflect gate agree and the repair round is not spent on a page nobody can fix.
      fillMissingPhotos(jobs, images);
      for (const j of jobs) if (j.carrier === "photo" && !images.has(j.index)) j.carrier = "typeOnly";
      const briefs = briefsFromJobs(jobs);
      const { model } = createLlm(config.text);
      let paidExtras = 0;
      while (paidExtras < canvasExtras && ctx.budget.tryConsume()) paidExtras += 1;
      const chunks = canvasChunkIndexes(jobs.length, paidExtras);
      const authorBase = {
        model,
        topic: working.title || guidance.topic,
        jobs,
        images,
        brief: deckBrief,
        ...(brand ? { brand } : {}),
        ...(opts.hostSkillStore ? { host: opts.hostSkillStore } : {}),
        ...(opts.signal ? { signal: opts.signal } : {}),
        onUsage: ctx.recordUsage,
        ...(opts.sampleComposition ? { sampleComposition: opts.sampleComposition } : {}),
      };
      const slideSlots: Array<FilledSlide | undefined> = new Array(jobs.length);
      const placeChunk = (indexes: number[] | undefined, slides: FilledSlide[]) => {
        if (!indexes) {
          slides.forEach((slide, i) => {
            slideSlots[i] = slide;
          });
          return;
        }
        indexes.forEach((pageIdx, n) => {
          const slide = slides[n];
          if (slide) slideSlots[pageIdx] = slide;
        });
      };
      let authored = await authorCanvasDeck({
        ...authorBase,
        ...(chunks.length > 1 ? { only: chunks[0] } : {}),
        ...(opts.onCanvasAuthored ? { onRaw: (raw: unknown) => opts.onCanvasAuthored?.(raw, "author") } : {}),
      });
      placeChunk(chunks.length > 1 ? chunks[0] : undefined, authored.slides);
      for (let c = 1; c < chunks.length; c++) {
        const only = chunks[c]!;
        const next = await authorCanvasDeck({
          ...authorBase,
          only,
          unchanged: describeUnchangedPages(slideSlots, jobs, only, resolveVisualSystem(authored.systemId)),
          lock: {
            systemId: authored.systemId,
            ...(authored.palette ? { palette: authored.palette } : {}),
          },
          ...(opts.onCanvasAuthored ? { onRaw: (raw: unknown) => opts.onCanvasAuthored?.(raw, "author") } : {}),
        });
        placeChunk(only, next.slides);
      }
      if (chunks.length > 1) {
        if (slideSlots.some((slide) => !slide)) throw new Error("canvas chunk missing pages");
        authored = { ...authored, slides: slideSlots.filter((slide): slide is FilledSlide => !!slide) };
      }
      let system = resolveVisualSystem(authored.systemId);
      let theme = themeFromAuthoredLook({
        systemId: authored.systemId,
        ...(authored.themeId ? { themeId: authored.themeId } : {}),
        ...(authored.palette ? { palette: authored.palette } : {}),
        ...(brand ? { brand } : {}),
      });
      const folio = deckBrief.folio;
      let compiled = compileCanvasDeck({
        system,
        theme,
        slides: authored.slides,
        title: working.title || guidance.topic,
        briefs,
        ...(folio != null ? { folio } : {}),
      });
      let repaired = false;
      if (opts.debug) logCanvasPass("author", authored.systemId, compiled);
      const structural = compiled.reflect.findings.filter((f) => !isCopyVoiceIssue(f.issue));
      if (structural.length && ctx.budget.tryConsume()) {
        repaired = true;
        const repair = structural.map((f) => `[${f.kind} #${f.slideIdx}] ${f.issue}`).join("; ");
        const firstPass = { compiled, slides: authored.slides };
        // Page-scoped repair whenever every finding names its pages: only those pages are
        // re-authored (cheaper, faster, and the pages that passed cannot regress). A deck-level
        // finding without pages (e.g. "every page uses the same composition") forces a full pass.
        // Copy-voice findings are not in this list — those strings are rewritten in place later.
        const scope = repairScope(structural, authored.slides.length);
        const scopedRepair = await authorCanvasDeck({
          model,
          topic: working.title || guidance.topic,
          jobs,
          images,
          brief: deckBrief,
          repair,
          ...(scope ? { only: scope, unchanged: describeUnchangedPages(firstPass.slides, jobs, scope, system) } : {}),
          lock: {
            systemId: authored.systemId,
            ...(authored.palette ? { palette: authored.palette } : {}),
          },
          ...(brand ? { brand } : {}),
          ...(opts.hostSkillStore ? { host: opts.hostSkillStore } : {}),
          ...(opts.signal ? { signal: opts.signal } : {}),
          onUsage: ctx.recordUsage,
          ...(opts.sampleComposition ? { sampleComposition: opts.sampleComposition } : {}),
          ...(opts.onCanvasAuthored
            ? { onRaw: (raw: unknown) => opts.onCanvasAuthored?.(scope && raw && typeof raw === "object" ? { ...(raw as object), repairPages: scope } : raw, "repair") }
            : {}),
        });
        if (scope) {
          // Keep the first pass's look; splice the re-authored pages into it.
          const slides = firstPass.slides.slice();
          scope.forEach((pageIdx, n) => {
            const s = scopedRepair.slides[n];
            if (s) slides[pageIdx] = s;
          });
          authored = { ...authored, slides };
        } else {
          authored = scopedRepair;
          system = resolveVisualSystem(authored.systemId);
          theme = themeFromAuthoredLook({
            systemId: authored.systemId,
            ...(authored.themeId ? { themeId: authored.themeId } : {}),
            ...(authored.palette ? { palette: authored.palette } : {}),
            ...(brand ? { brand } : {}),
          });
        }
        const repairedCompiled = compileCanvasDeck({
          system,
          theme,
          slides: authored.slides,
          title: working.title || guidance.topic,
          briefs,
          ...(folio != null ? { folio } : {}),
        });
        // A full repair pass re-authors the whole deck and regularly regresses pages that were fine
        // (moves the table from page 4 to page 6, adds a fifth card under "four …"). Keep, per page,
        // whichever version has fewer findings, then recompile so deck-level gates see the merge.
        const merged = mergeCanvasPages(firstPass, { compiled: repairedCompiled, slides: authored.slides });
        compiled = repairedCompiled;
        if (merged) {
          const mergedCompiled = compileCanvasDeck({ system, theme, slides: merged, title: working.title || guidance.topic, briefs, ...(folio != null ? { folio } : {}) });
          if (mergedCompiled.reflect.findings.length < repairedCompiled.reflect.findings.length) compiled = mergedCompiled;
        }
        if (opts.debug) {
          console.log(`[ai] canvas repair scope: ${scope ? `pages ${scope.join(", ")}` : "full deck"}`);
          logCanvasPass("repair", authored.systemId, compiled);
        }
      }
      if (
        compiled.reflect.findings.some((f) => isCopyVoiceIssue(f.issue)) &&
        copyTargetsFromSlides(compiled.painted).length &&
        ctx.budget.tryConsume()
      ) {
        try {
          const rewritten = await rewriteCopyVoice({
            model,
            slides: compiled.painted,
            ...(opts.signal ? { signal: opts.signal } : {}),
            onUsage: ctx.recordUsage,
          });
          if (rewritten.elements > 0) {
            mirrorOutlineCopy(working.slides, rewritten.rows);
            const presentation = emitPresentation(compiled.painted, system, theme, working.title || guidance.topic);
            const reflect = reflectCanvas(compiled.painted, system, theme, briefs);
            presentation.meta = { ...(compiled.presentation.meta ?? {}), ...(presentation.meta ?? {}) };
            compiled = { ...compiled, presentation, reflect };
            repaired = true;
          }
        } catch (e) {
          rethrowIfAborted(opts.signal, e);
          if (opts.debug) console.warn("[ai] copy rewrite failed", e);
        }
      }
      if (compiled.presentation.slides.length) {
        pres = compiled.presentation;
        const meta = (pres.meta ?? {}) as Record<string, unknown>;
        const deckgen = { ...((meta.deckgen as object) ?? {}), repaired, passed: compiled.reflect.passed };
        pres.meta = { ...meta, deckgen };
      }
    } catch (e) {
      rethrowIfAborted(opts.signal, e);
      console.warn("[ai] canvas author failed, using fill:", e);
    }
  }

  if (!pres) {
    pres = compileDeckgenPresentation(guidance, working);
  }
  if (shouldCommitGeneratedDeck(opts.signal)) opts.onPresentationDraft?.(pres);

  if (!skipWrite) {
    await polishGeneratedDeck(pres, working, guidance, opts, ctx);
    throwIfPipelineP2Inject(opts.pipelineP2Inject, "write");
  }
  throwIfAborted(opts.signal);
  applyMotion(pres, opts, working);
  if (shouldCommitGeneratedDeck(opts.signal)) opts.onPresentationDraft?.(pres);
  ctx.emit({ stage: "done", progress: 1 });
  return pres;
}

export const DECKGEN_CANVAS = CANVAS;

/** Outline rows → per-page visual jobs (title, bullets, imageIdea, layout hints, Design Brief). Shared with the offline replay tool. */
export function jobsFromOutline(outline: Pick<Outline, "title" | "slides">): PageJob[] {
  return jobsFromPages(
    outline.slides.map((s) => ({
      title: s.title,
      ...(s.bullets ? { bullets: s.bullets } : {}),
      ...(s.imageIdea ? { imageIdea: s.imageIdea } : {}),
      ...(s.layoutHint ? { layoutHint: s.layoutHint } : {}),
      ...(s.deckgenLayout ? { deckgenLayout: s.deckgenLayout } : {}),
      ...coercePageBrief(s),
    })),
    outline.title,
  );
}
