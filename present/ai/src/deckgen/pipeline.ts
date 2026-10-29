/**
 * Offline / no-key deckgen pipeline:
 * narrative outline → lock VisualSystem → assign Layout+Variant
 * → fill slots → apply ColorTheme → Content/Design/Coherence → emit.
 *
 * Live generate (API key) goes through canvas-author + snap instead; this
 * path remains for tests and keyless builds.
 */

import type { Presentation } from "@ppt/core";
import {
  DEFAULT_COLOR_THEME,
  assertThemePairing,
  isColorThemeId,
  type ColorThemeId,
  type VisualSystemId,
} from "./ids.js";
import { resolveVisualSystem, type VisualSystem } from "./visual-system.js";
import { defaultColorThemeId, resolveColorTheme, type ColorTheme } from "./color-theme.js";
import { buildNarrativeOutline, type NarrativeInput, type NarrativeOutline } from "./narrative.js";
import { assignPagePlan, enforceSlotCaps, type SlidePlan } from "./page-plan.js";
import { resolveLayout } from "./layouts.js";
import { fillPlans } from "./fill.js";
import { applyColorTheme, type PaintedSlide } from "./apply-theme.js";
import { emitPresentation } from "./emit.js";
import { assertReflect, reflectPainted, type ReflectResult } from "./reflect.js";
import { reflectCanvas } from "./reflect-canvas.js";
import { snapCanvasReport, type SnapDrop } from "./snap.js";
import type { FilledSlide } from "./ir.js";
import type { PageBrief } from "./brief.js";

export interface GenerateDeckInput extends NarrativeInput {
  systemId: VisualSystemId;
  /** Must pair with systemId. Defaults to editorial/ink or swiss/ikb. */
  themeId?: ColorThemeId;
  /**
   * Locked Layout+Variant pages from the wizard outline.
   * When set, skip narrative auto-assign and use these (whitelist re-asserted).
   */
  pages?: SlidePlan[];
  /** Product fill fallback: still emit if catalog reflect finds issues. */
  skipReflectAssert?: boolean;
}

export interface GenerateDeckResult {
  outline: NarrativeOutline;
  system: VisualSystem;
  theme: ColorTheme;
  plan: SlidePlan[];
  painted: PaintedSlide[];
  presentation: Presentation;
  reflect: ReflectResult;
}

function assertLockedPlans(pages: SlidePlan[]): SlidePlan[] {
  for (const p of pages) resolveLayout(p.layout, p.variant);
  return pages;
}

export function lockColorTheme(systemId: VisualSystemId, themeId?: string): ColorTheme {
  const id = themeId ?? defaultColorThemeId(systemId);
  if (!isColorThemeId(id)) {
    throw new Error(`Unknown ColorTheme "${id}".`);
  }
  assertThemePairing(systemId, id);
  return resolveColorTheme(id, systemId);
}

export function generateDeck(input: GenerateDeckInput): GenerateDeckResult {
  const system = resolveVisualSystem(input.systemId);
  const theme = lockColorTheme(input.systemId, input.themeId ?? DEFAULT_COLOR_THEME[input.systemId]);
  const outline = buildNarrativeOutline(input);
  const locked = input.pages?.length ? assertLockedPlans(input.pages) : assignPagePlan(outline);
  const plan = enforceSlotCaps(locked);
  const filled = fillPlans(plan, system);
  const painted = applyColorTheme(filled, theme);
  const reflect = reflectPainted(painted, system, theme);
  if (!input.skipReflectAssert) assertReflect(reflect);
  const presentation = emitPresentation(painted, system, theme, outline.title);
  return { outline, system, theme, plan, painted, presentation, reflect };
}

/** What the author actually used — surfaced in meta so live smoke runs can measure vocabulary hit-rate. */
export interface CanvasStats {
  pages: number;
  /** Authored element kinds (pre-snap): text, device, icon, shape, diagram, … */
  kinds: Record<string, number>;
  /** device.type tally. */
  devices: Record<string, number>;
  /** Pages whose background is a photo with a scrim. */
  scrimPages: number;
  /** Pages carrying a photo background at all. */
  photoPages: number;
  drops: string[];
  findings: number;
}

export function canvasStats(slides: FilledSlide[], drops: SnapDrop[], findings: number): CanvasStats {
  const kinds: Record<string, number> = {};
  const devices: Record<string, number> = {};
  let scrimPages = 0;
  let photoPages = 0;
  for (const s of slides) {
    if (s.background?.kind === "image") {
      photoPages += 1;
      if (s.background.scrim) scrimPages += 1;
    }
    for (const el of s.elements) {
      kinds[el.kind] = (kinds[el.kind] ?? 0) + 1;
      if (el.kind === "device" && el.device?.type) devices[el.device.type] = (devices[el.device.type] ?? 0) + 1;
    }
  }
  return {
    pages: slides.length,
    kinds,
    devices,
    scrimPages,
    photoPages,
    drops: drops.map((d) => `#${d.slideIdx} ${d.slot}: ${d.reason}`),
    findings,
  };
}

export function compileCanvasDeck(input: {
  system: VisualSystem;
  theme: ColorTheme;
  slides: FilledSlide[];
  title: string;
  /** Per-page Design Brief (same order as slides) — enables relationship / rhythm / carrier checks. */
  briefs?: Array<PageBrief | undefined>;
  /** Folio decision: true = every content page numbered, false = no page numerals; undefined = leave the author's. */
  folio?: boolean;
}): GenerateDeckResult {
  const snapped = snapCanvasReport(input.slides, input.system, { briefs: input.briefs ?? [], ...(input.folio != null ? { folio: input.folio } : {}) });
  const painted = applyColorTheme(snapped.slides, input.theme);
  const reflect = reflectCanvas(painted, input.system, input.theme, input.briefs);
  for (const d of snapped.drops) {
    reflect.findings.push({ kind: "content", slideIdx: d.slideIdx, issue: `dropped ${d.slot}: ${d.reason}` });
  }
  reflect.passed = reflect.findings.length === 0;
  const presentation = emitPresentation(painted, input.system, input.theme, input.title);
  const meta = (presentation.meta ?? {}) as Record<string, unknown>;
  const deckgen = {
    ...((meta.deckgen as object) ?? {}),
    canvas: true,
    canvasStats: canvasStats(input.slides, snapped.drops, reflect.findings.length),
    // The deck-level page-number decision that was applied (undefined = the author's own numerals kept).
    ...(input.folio != null ? { folio: input.folio } : {}),
  };
  presentation.meta = { ...meta, deckgen };
  const outline = buildNarrativeOutline({ topic: input.title });
  return {
    outline,
    system: input.system,
    theme: input.theme,
    plan: [],
    painted,
    presentation,
    reflect,
  };
}

export function generateDeckPair(
  input: Omit<GenerateDeckInput, "themeId">,
  themeA: ColorThemeId,
  themeB: ColorThemeId,
): { a: GenerateDeckResult; b: GenerateDeckResult } {
  return {
    a: generateDeck({ ...input, themeId: themeA }),
    b: generateDeck({ ...input, themeId: themeB }),
  };
}
