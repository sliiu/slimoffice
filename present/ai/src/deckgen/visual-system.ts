/**
 * L1 VisualSystem — typography, grid, alignment, bans.
 * No colors. ColorTheme is applied later and must not change these rules.
 *
 * Type stacks:
 *   editorial = serif display (Playfair / Noto Serif SC) + Noto Sans SC + IBM Plex Mono
 *   swiss     = International Typographic Style (Inter ExtraLight + JetBrains Mono)
 *
 * Canvas-only systems (live author path, not in the locked fill catalog):
 *   dark-tech · soft-rounded · photo-editorial · data-dense · brutalist
 * Each one is a type voice + grid + radius / shadow / glow policy. No hex.
 *
 * User-defined systems: an enabled skill may carry a ```visual-system JSON block
 * (see custom-system.ts). Those are registered here for the session and join the
 * author whitelist next to the builtins; `resolveVisualSystem` / `listCanvasSystems`
 * see both.
 */

import {
  CANVAS_SYSTEM_IDS,
  isBuiltinCanvasSystemId,
  setRegisteredCanvasSystemIds,
  type BuiltinCanvasSystemId,
  type CanvasSystemId,
  type PaintRole,
} from "./ids.js";
import type { TextTreatment } from "./ir.js";

export interface TypeScale {
  /** Latin / default display size. */
  display: number;
  /** CJK display override (swiss: 56). Falls back to `display`. */
  displayCjk?: number;
  h1: number;
  h2: number;
  body: number;
  caption: number;
}

export interface VisualGrid {
  columns: number;
  gutter: number;
  /** Safe margin as a fraction of canvas (both axes). */
  margin: number;
}

export interface VisualBans {
  roundedCorners: boolean;
  shadows: boolean;
  gradients: boolean;
  /** When true, display-sized titles must not be center-aligned. */
  centeredDisplay: boolean;
}

export interface VisualFonts {
  display: string;
  body: string;
  mono: string;
}

export type TypeRole = "display" | "h1" | "h2" | "body" | "caption" | "kicker" | "index" | "numeral";

export interface TypeRoleStyle {
  fontWeight: number;
  fontFamily: string;
  lineHeight: number;
  letterSpacing?: number;
  caps?: "all";
}

/**
 * Type voice drives weight / tracking / line-height per role.
 *   serif       = editorial: 700 serif display, 400 sans body, mono kicker
 *   grotesk     = swiss: the bigger the lighter (200 display), mono index
 *   humanist    = friendly sans: 700 display, 600 heads, 400 body
 *   neo-grotesk = product keynote: 600 display with tight tracking, 500 heads,
 *                 400 body, sentence-case kicker in the display face (no mono, no caps)
 */
export type TypeVoice = "serif" | "grotesk" | "humanist" | "neo-grotesk";
export const TYPE_VOICES = ["serif", "grotesk", "humanist", "neo-grotesk"] as const satisfies readonly TypeVoice[];

/**
 * Canvas-path policy — how the live author and the device expanders may
 * dress surfaces on this system. Colors still come from the ColorTheme.
 */
export interface CanvasPolicy {
  /** Default corner radius for surfaces / cards / chips (0 = square). */
  radius: number;
  /** Floating objects may carry an outer shadow. */
  shadow: boolean;
  /** Display type / accent shapes may carry a soft glow. */
  glow: boolean;
  /** Expected paper tone. The seed palette follows it; authored hex may override. */
  tone: "light" | "dark";
  /** Hairline weight for rules and connectors. */
  ruleWidth: number;
  /**
   * Default art treatment for the display line on anchor pages (cover / section / close /
   * statement) when the author did not pick one. `none` = plain type is the look.
   */
  displayTreatment: TextTreatment | "none";
  /** One-line character for the author prompt (no hex). */
  character: string;
}

export interface VisualSystem {
  id: CanvasSystemId;
  name: string;
  voice: TypeVoice;
  typeScale: TypeScale;
  grid: VisualGrid;
  /** Title / body alignment. Systems in this whitelist are left-aligned. */
  alignment: { title: "start"; body: "start" };
  density: "airy" | "tight";
  bans: VisualBans;
  fonts: VisualFonts;
  canvas: CanvasPolicy;
}

export const CANVAS = { width: 1280, height: 720 } as const;

/** Below this, running copy is unreadable on a projected 1280×720 canvas (devices and the gate both use it). */
export const MIN_READABLE_PX = 13;
/** Text up to this many characters counts as a label and may sit at caption size. */
export const MAX_CAPTION_CHARS = 24;

/** Google Font families this system must load (Playfair/Inter/Noto/IBM Plex/JetBrains). */
export const DECKGEN_FONT_FAMILIES: Record<BuiltinCanvasSystemId, readonly string[]> = {
  editorial: ["Playfair Display", "Noto Serif SC", "Noto Sans SC", "IBM Plex Mono"],
  swiss: ["Inter", "Noto Sans SC", "JetBrains Mono"],
  "dark-tech": ["Inter", "Noto Sans SC", "JetBrains Mono"],
  "soft-rounded": ["Inter", "Noto Sans SC", "IBM Plex Mono"],
  "photo-editorial": ["Playfair Display", "Noto Serif SC", "Noto Sans SC", "IBM Plex Mono"],
  "data-dense": ["Inter", "Noto Sans SC", "IBM Plex Mono"],
  brutalist: ["Inter", "Noto Sans SC", "JetBrains Mono"],
};

const SERIF_FONTS: VisualFonts = {
  display: `"Playfair Display", "Noto Serif SC", "Songti SC", serif`,
  body: `"Noto Sans SC", "PingFang SC", "Helvetica Neue", sans-serif`,
  mono: `"IBM Plex Mono", "JetBrains Mono", "Menlo", monospace`,
};

const GROTESK_FONTS: VisualFonts = {
  display: `"Inter", "Noto Sans SC", "PingFang SC", sans-serif`,
  body: `"Inter", "Noto Sans SC", "PingFang SC", sans-serif`,
  mono: `"JetBrains Mono", "IBM Plex Mono", "Menlo", monospace`,
};

const HUMANIST_FONTS: VisualFonts = {
  display: `"Inter", "Noto Sans SC", "PingFang SC", sans-serif`,
  body: `"Inter", "Noto Sans SC", "PingFang SC", sans-serif`,
  mono: `"IBM Plex Mono", "JetBrains Mono", "Menlo", monospace`,
};

export const VISUAL_SYSTEMS: Record<BuiltinCanvasSystemId, VisualSystem> = {
  editorial: {
    id: "editorial",
    name: "Magazine editorial",
    voice: "serif",
    typeScale: { display: 64, h1: 36, h2: 22, body: 17, caption: 12 },
    grid: { columns: 12, gutter: 16, margin: 0.05 },
    alignment: { title: "start", body: "start" },
    density: "airy",
    bans: { roundedCorners: true, shadows: true, gradients: true, centeredDisplay: false },
    fonts: SERIF_FONTS,
    canvas: {
      radius: 0,
      shadow: false,
      glow: false,
      tone: "light",
      ruleWidth: 1,
      displayTreatment: "outline",
      character: "paper, serif display, generous whitespace, hairline rules, one accent at most",
    },
  },
  swiss: {
    id: "swiss",
    name: "Swiss internationalism",
    voice: "grotesk",
    typeScale: { display: 72, displayCjk: 56, h1: 32, h2: 20, body: 16, caption: 11 },
    grid: { columns: 16, gutter: 12, margin: 0.05 },
    alignment: { title: "start", body: "start" },
    density: "tight",
    bans: { roundedCorners: true, shadows: true, gradients: true, centeredDisplay: true },
    fonts: GROTESK_FONTS,
    canvas: {
      radius: 0,
      shadow: false,
      glow: false,
      tone: "light",
      ruleWidth: 1,
      displayTreatment: "outline",
      character: "strict grid, ExtraLight display, flush-left, mono index numbers, flat color blocks",
    },
  },
  "dark-tech": {
    id: "dark-tech",
    name: "Dark tech",
    voice: "grotesk",
    typeScale: { display: 68, displayCjk: 54, h1: 34, h2: 20, body: 16, caption: 11 },
    grid: { columns: 12, gutter: 16, margin: 0.05 },
    alignment: { title: "start", body: "start" },
    density: "tight",
    bans: { roundedCorners: false, shadows: false, gradients: false, centeredDisplay: false },
    fonts: GROTESK_FONTS,
    canvas: {
      radius: 8,
      shadow: false,
      glow: true,
      tone: "dark",
      ruleWidth: 1,
      displayTreatment: "gradient",
      character: "near-black paper, one luminous accent, thin outlined surfaces, glow on KPIs, mono captions",
    },
  },
  "soft-rounded": {
    id: "soft-rounded",
    name: "Soft rounded",
    voice: "humanist",
    typeScale: { display: 60, h1: 34, h2: 22, body: 17, caption: 12 },
    grid: { columns: 12, gutter: 20, margin: 0.05 },
    alignment: { title: "start", body: "start" },
    density: "airy",
    bans: { roundedCorners: false, shadows: false, gradients: false, centeredDisplay: false },
    fonts: HUMANIST_FONTS,
    canvas: {
      radius: 20,
      shadow: true,
      glow: false,
      tone: "light",
      ruleWidth: 1,
      displayTreatment: "gradient",
      character: "friendly sans, large radius cards, soft shadows, pastel accentSoft fields, icons with labels",
    },
  },
  "photo-editorial": {
    id: "photo-editorial",
    name: "Photo editorial",
    voice: "serif",
    typeScale: { display: 72, displayCjk: 58, h1: 36, h2: 22, body: 17, caption: 12 },
    grid: { columns: 12, gutter: 16, margin: 0.05 },
    alignment: { title: "start", body: "start" },
    density: "airy",
    bans: { roundedCorners: true, shadows: true, gradients: false, centeredDisplay: false },
    fonts: SERIF_FONTS,
    canvas: {
      radius: 0,
      shadow: false,
      glow: false,
      tone: "dark",
      ruleWidth: 1,
      displayTreatment: "shadow",
      character: "photo is the canvas, directional scrim toward the type, serif display on the photo, short captions",
    },
  },
  "data-dense": {
    id: "data-dense",
    name: "Data dense",
    voice: "grotesk",
    typeScale: { display: 56, displayCjk: 48, h1: 28, h2: 18, body: 14, caption: 11 },
    grid: { columns: 16, gutter: 12, margin: 0.05 },
    alignment: { title: "start", body: "start" },
    density: "tight",
    bans: { roundedCorners: false, shadows: true, gradients: true, centeredDisplay: true },
    fonts: {
      display: GROTESK_FONTS.display,
      body: GROTESK_FONTS.body,
      mono: `"IBM Plex Mono", "JetBrains Mono", "Menlo", monospace`,
    },
    canvas: {
      radius: 4,
      shadow: false,
      glow: false,
      tone: "light",
      ruleWidth: 1,
      displayTreatment: "none",
      character: "compact grid, mono numerals, many small surfaces, charts and tables lead, tiny caps labels",
    },
  },
  brutalist: {
    id: "brutalist",
    name: "Brutalist",
    voice: "grotesk",
    typeScale: { display: 80, displayCjk: 60, h1: 40, h2: 22, body: 16, caption: 11 },
    grid: { columns: 12, gutter: 8, margin: 0.05 },
    alignment: { title: "start", body: "start" },
    density: "tight",
    bans: { roundedCorners: true, shadows: true, gradients: true, centeredDisplay: false },
    fonts: GROTESK_FONTS,
    canvas: {
      radius: 0,
      shadow: false,
      glow: false,
      tone: "light",
      ruleWidth: 3,
      displayTreatment: "outline",
      character: "heavy black rules, boxed text, oversized display, raw mono labels, flat single accent",
    },
  },
};

// ---------------------------------------------------------------------------
// User-defined systems (session registry)
// ---------------------------------------------------------------------------

/** A custom system as registered: the resolved VisualSystem plus what the builtin tables carry. */
export interface RegisteredVisualSystem {
  system: VisualSystem;
  /** Google Font families to load (only names `findFontPreset` knows are loaded). */
  fontFamilies: readonly string[];
  /** Seed palette when the author does not write hex; follows `canvas.tone`. */
  seedPalette?: Record<PaintRole, string>;
  /** Extra words `normalizeSystemId` may match ("apple", "keynote"). */
  aliases: readonly string[];
  /** Skill id that contributed this system (for UI / diagnostics). */
  skillId?: string;
}

const customSystems = new Map<string, RegisteredVisualSystem>();

/**
 * Replace the session's custom systems. Called whenever the enabled skill set is
 * (re)read — a disabled or removed skill takes its systems with it. Builtin ids
 * cannot be shadowed.
 */
export function registerCustomVisualSystems(entries: Iterable<RegisteredVisualSystem>): void {
  customSystems.clear();
  for (const e of entries) {
    if (isBuiltinCanvasSystemId(e.system.id)) continue;
    customSystems.set(e.system.id, e);
  }
  setRegisteredCanvasSystemIds(customSystems.keys());
}

export function getRegisteredVisualSystem(id: string): RegisteredVisualSystem | undefined {
  return customSystems.get(id);
}

export function listCustomVisualSystems(): RegisteredVisualSystem[] {
  return [...customSystems.values()];
}

export function resolveVisualSystem(id: string): VisualSystem {
  if (isBuiltinCanvasSystemId(id)) return VISUAL_SYSTEMS[id];
  const custom = customSystems.get(id);
  if (custom) return custom.system;
  throw new Error(`Unknown VisualSystem "${id}". Whitelist: ${[...CANVAS_SYSTEM_IDS, ...customSystems.keys()].join(", ")}.`);
}

/** Google Font families a system (builtin or custom) needs loaded. */
export function fontFamiliesForSystem(id: CanvasSystemId): readonly string[] {
  if (isBuiltinCanvasSystemId(id)) return DECKGEN_FONT_FAMILIES[id];
  return customSystems.get(id)?.fontFamilies ?? [];
}

/**
 * Model / organizer output → a known system id, or undefined.
 * "Dark Tech" / "dark_tech" / "darktech" → "dark-tech"; "Apple Keynote" → "apple_keynote"
 * when such a custom system is registered (its `aliases` match too). Custom systems are
 * tried before the builtin partial-word guesses so "apple keynote" is not read as "editorial".
 */
export function normalizeSystemId(raw: unknown): string | undefined {
  const s = String(raw ?? "").toLowerCase().trim();
  if (!s) return undefined;
  const hyphen = s.replace(/[\s_]+/g, "-");
  if (isBuiltinCanvasSystemId(hyphen)) return hyphen;
  const snake = s.replace(/[\s-]+/g, "_");
  if (customSystems.has(snake)) return snake;
  const compact = s.replace(/[\s_-]+/g, "");
  for (const id of CANVAS_SYSTEM_IDS) if (compact === id.replace(/-/g, "")) return id;
  for (const [id, c] of customSystems) {
    if (compact === id.replace(/_/g, "")) return id;
    if (compact === c.system.name.toLowerCase().replace(/[\s_-]+/g, "")) return id;
  }
  for (const [id, c] of customSystems) {
    if (c.aliases.some((a) => s.includes(a))) return id;
    const words = id.split("_").filter((w) => w.length >= 4);
    if (words.length && words.every((w) => s.includes(w))) return id;
  }
  // partial matches — the model often says "swiss grid" or "photo editorial magazine"
  if (s.includes("photo")) return "photo-editorial";
  if (s.includes("swiss")) return "swiss";
  if (s.includes("dark") || s.includes("tech") || s.includes("neon")) return "dark-tech";
  if (s.includes("round") || s.includes("soft") || s.includes("friendly")) return "soft-rounded";
  if (s.includes("data") || s.includes("dense") || s.includes("dashboard")) return "data-dense";
  if (s.includes("brutal") || s.includes("raw") || s.includes("bold")) return "brutalist";
  if (s.includes("editorial") || s.includes("magazine") || s.includes("serif")) return "editorial";
  return undefined;
}

/** Builtin canvas systems followed by the session's custom systems. */
export function listCanvasSystems(): VisualSystem[] {
  return [...CANVAS_SYSTEM_IDS.map((id) => VISUAL_SYSTEMS[id]), ...[...customSystems.values()].map((c) => c.system)];
}

export function displaySize(system: VisualSystem, text: string): number {
  if (system.typeScale.displayCjk != null && /[\u2e80-\u9fff]/.test(text)) {
    return system.typeScale.displayCjk;
  }
  return system.typeScale.display;
}

export function typeScaleValues(system: VisualSystem): number[] {
  const t = system.typeScale;
  return [t.display, t.displayCjk ?? t.display, t.h1, t.h2, t.body, t.caption];
}

function hasCjk(text: string): boolean {
  return /[\u2e80-\u9fff]/.test(text);
}

function tracking(fontSize: number, em: number): number | undefined {
  if (em === 0) return undefined;
  return Math.round(fontSize * em * 100) / 100;
}

/**
 * Locked type role → weight / face / tracking / line-height.
 * Editorial: 700 serif display, 400 sans body, mono kicker + caps.
 * Swiss: 越大越细 — display ExtraLight 200, body 300–400, labels 500, tracking -.04em.
 */
export function typeRole(sys: VisualSystem, role: TypeRole, fontSize: number, text = ""): TypeRoleStyle {
  const cjk = hasCjk(text);
  if (sys.voice === "humanist") {
    switch (role) {
      case "display":
        return {
          fontWeight: 700,
          fontFamily: sys.fonts.display,
          lineHeight: cjk ? 1.08 : 0.98,
          letterSpacing: tracking(fontSize, cjk ? 0 : -0.02),
        };
      case "numeral":
        return { fontWeight: 700, fontFamily: sys.fonts.display, lineHeight: 0.9, letterSpacing: tracking(fontSize, -0.02) };
      case "h1":
        return { fontWeight: 600, fontFamily: sys.fonts.display, lineHeight: 1.15, letterSpacing: tracking(fontSize, -0.01) };
      case "h2":
        return { fontWeight: 600, fontFamily: sys.fonts.body, lineHeight: 1.25 };
      case "body":
        return { fontWeight: 400, fontFamily: sys.fonts.body, lineHeight: 1.5 };
      case "caption":
        return { fontWeight: 500, fontFamily: sys.fonts.body, lineHeight: 1.4 };
      case "kicker":
        return {
          fontWeight: 600,
          fontFamily: sys.fonts.body,
          lineHeight: 1.2,
          letterSpacing: tracking(fontSize, 0.12),
          caps: "all",
        };
      case "index":
        return { fontWeight: 600, fontFamily: sys.fonts.mono, lineHeight: 1.1, letterSpacing: tracking(fontSize, 0.04) };
    }
  }
  if (sys.voice === "neo-grotesk") {
    // Product-keynote voice: semibold display, tracking tightens as size grows, body stays plain.
    // No caps, no mono — labels are sentence case in the same face, one weight step up.
    switch (role) {
      case "display":
        return {
          fontWeight: 600,
          fontFamily: sys.fonts.display,
          lineHeight: cjk ? 1.1 : 1.02,
          letterSpacing: tracking(fontSize, cjk ? -0.01 : -0.03),
        };
      case "numeral":
        return { fontWeight: 600, fontFamily: sys.fonts.display, lineHeight: 0.95, letterSpacing: tracking(fontSize, -0.03) };
      case "h1":
        return { fontWeight: 600, fontFamily: sys.fonts.display, lineHeight: 1.12, letterSpacing: tracking(fontSize, cjk ? 0 : -0.02) };
      case "h2":
        return { fontWeight: 500, fontFamily: sys.fonts.display, lineHeight: 1.25, letterSpacing: tracking(fontSize, -0.01) };
      case "body":
        return { fontWeight: 400, fontFamily: sys.fonts.body, lineHeight: 1.47 };
      case "caption":
        return { fontWeight: 400, fontFamily: sys.fonts.body, lineHeight: 1.4, letterSpacing: tracking(fontSize, 0.01) };
      case "kicker":
        return { fontWeight: 600, fontFamily: sys.fonts.display, lineHeight: 1.25, letterSpacing: tracking(fontSize, 0.01) };
      case "index":
        return { fontWeight: 500, fontFamily: sys.fonts.display, lineHeight: 1.1, letterSpacing: tracking(fontSize, 0) };
    }
  }
  if (sys.voice === "grotesk") {
    switch (role) {
      case "display":
        return {
          fontWeight: 200,
          fontFamily: sys.fonts.display,
          lineHeight: cjk ? 1.02 : 0.9,
          letterSpacing: tracking(fontSize, cjk ? -0.02 : -0.04),
        };
      case "numeral":
        return {
          fontWeight: 200,
          fontFamily: sys.fonts.display,
          lineHeight: 0.88,
          letterSpacing: tracking(fontSize, -0.04),
        };
      case "h1":
        return {
          fontWeight: 300,
          fontFamily: sys.fonts.display,
          lineHeight: 1.02,
          letterSpacing: tracking(fontSize, -0.03),
        };
      case "h2":
        return { fontWeight: 400, fontFamily: sys.fonts.body, lineHeight: 1.15, letterSpacing: tracking(fontSize, -0.02) };
      case "body":
        return { fontWeight: 400, fontFamily: sys.fonts.body, lineHeight: 1.45 };
      case "caption":
        return { fontWeight: 500, fontFamily: sys.fonts.body, lineHeight: 1.35, letterSpacing: tracking(fontSize, 0.04) };
      case "kicker":
        return {
          fontWeight: 500,
          fontFamily: sys.fonts.mono,
          lineHeight: 1.2,
          letterSpacing: tracking(fontSize, 0.16),
          caps: "all",
        };
      case "index":
        return { fontWeight: 500, fontFamily: sys.fonts.mono, lineHeight: 1.1, letterSpacing: tracking(fontSize, 0.04) };
    }
  }
  switch (role) {
    case "display":
      return {
        fontWeight: 700,
        fontFamily: sys.fonts.display,
        lineHeight: cjk ? 1.04 : 0.92,
        letterSpacing: tracking(fontSize, cjk ? -0.005 : -0.025),
      };
    case "numeral":
      return {
        fontWeight: 800,
        fontFamily: sys.fonts.display,
        lineHeight: 0.85,
        letterSpacing: tracking(fontSize, -0.03),
      };
    case "h1":
      return {
        fontWeight: 700,
        fontFamily: sys.fonts.display,
        lineHeight: 1.12,
        letterSpacing: tracking(fontSize, -0.005),
      };
    case "h2":
      return { fontWeight: 600, fontFamily: sys.fonts.display, lineHeight: 1.2 };
    case "body":
      return { fontWeight: 400, fontFamily: sys.fonts.body, lineHeight: 1.5, letterSpacing: tracking(fontSize, 0.01) };
    case "caption":
      return { fontWeight: 400, fontFamily: sys.fonts.body, lineHeight: 1.4 };
    case "kicker":
      return {
        fontWeight: 500,
        fontFamily: sys.fonts.mono,
        lineHeight: 1.2,
        letterSpacing: tracking(fontSize, 0.2),
        caps: "all",
      };
    case "index":
      return { fontWeight: 500, fontFamily: sys.fonts.mono, lineHeight: 1.1, letterSpacing: tracking(fontSize, 0.08) };
  }
}
