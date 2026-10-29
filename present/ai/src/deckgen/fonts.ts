/**
 * Load VisualSystem typefaces (browser only).
 */

import type { Presentation } from "@ppt/core";
import { findFontPreset, injectFontCss } from "@ppt/themes";
import { isCanvasSystemId, type CanvasSystemId } from "./ids.js";
import { fontFamiliesForSystem, resolveVisualSystem, type VisualSystem } from "./visual-system.js";

export interface DeckgenFontLink {
  family: string;
  cssUrl: string;
}

/** Google Font links for a builtin or registered custom system. Families without a preset are skipped. */
export function deckgenFontLinks(system: VisualSystem | CanvasSystemId): DeckgenFontLink[] {
  const sys = typeof system === "string" ? resolveVisualSystem(system) : system;
  const out: DeckgenFontLink[] = [];
  for (const family of fontFamiliesForSystem(sys.id)) {
    const preset = findFontPreset(family);
    if (preset) out.push({ family: preset.family, cssUrl: preset.cssUrl });
  }
  return out;
}

export function injectDeckgenFonts(system: VisualSystem | CanvasSystemId): void {
  for (const link of deckgenFontLinks(system)) {
    injectFontCss(link.cssUrl, link.family);
  }
}

/**
 * Fonts for a deck being opened. `meta.fontCssLinks` is written by the emitter, so a deck
 * authored on a custom system still loads its faces when that skill is not installed here.
 */
export function injectDeckgenFontsFromPres(pres: Presentation): void {
  const meta = pres.meta as
    | { deckgen?: { system?: string }; fontCssLinks?: DeckgenFontLink[] }
    | undefined;
  const id = meta?.deckgen?.system;
  if (id && isCanvasSystemId(id)) injectDeckgenFonts(id);
  for (const link of meta?.fontCssLinks ?? []) {
    if (link.cssUrl && link.family) injectFontCss(link.cssUrl, link.family);
  }
}
