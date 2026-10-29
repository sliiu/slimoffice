/**
 * L4 ColorTheme — id + VisualSystem pairing + registered palettes.
 * Token keys are exactly: bg · surface · ink · muted · line · accent · accentSoft
 */

import {
  COLOR_THEME_IDS,
  COLOR_THEME_PAIRING,
  DEFAULT_COLOR_THEME,
  PAINT_ROLES,
  assertThemePairing,
  isBuiltinCanvasSystemId,
  isColorThemeId,
  isVisualSystemId,
  type BuiltinCanvasSystemId,
  type CanvasSystemId,
  type ColorThemeId,
  type PaintRole,
  type VisualSystemId,
} from "./ids.js";
import { getRegisteredVisualSystem } from "./visual-system.js";
import { contrastRatio, ensureContrast, mixRgb, parseHex, relativeLuminance, toHex, type Rgb } from "../generate/qa/color.js";

export type ColorPalette = Record<PaintRole, string>;

export interface ColorTheme {
  id: ColorThemeId | "custom";
  systemId: CanvasSystemId;
  palette?: ColorPalette;
  /** Brand / campaign accent (may equal palette.accent). */
  brand?: string;
  /** Type color when sitting on a photo canvas. */
  onPhoto?: string;
}

function palette(
  bg: string,
  surface: string,
  ink: string,
  muted: string,
  line: string,
  accent: string,
  accentSoft: string,
): ColorPalette {
  return { bg, surface, ink, muted, line, accent, accentSoft };
}

/**
 * Locked ColorTheme hex (token order: bg surface ink muted line accent accentSoft).
 * Editorial palettes keep accent equal to ink (no third hue).
 * Swiss palettes share paper / grey / ink and a single accent.
 */
export const COLOR_THEME_PALETTES: Record<ColorThemeId, ColorPalette> = {
  ink: palette("#F1EFEA", "#E8E5DE", "#0A0A0B", "#5C5852", "#C8C2B6", "#0A0A0B", "#E8E5DE"),
  indigo: palette("#F1F3F5", "#E4E8EC", "#0A1F3D", "#5A6B7D", "#C5CDD8", "#0A1F3D", "#E4E8EC"),
  kraft: palette("#EEDFC7", "#E0D0B6", "#2A1E13", "#6B5744", "#C9B396", "#2A1E13", "#E0D0B6"),
  ikb: palette("#FAFAF8", "#F0F0EE", "#0A0A0A", "#737373", "#D4D4D2", "#002FA7", "#E8ECF6"),
  signal: palette("#FAFAF8", "#F0F0EE", "#0A0A0A", "#737373", "#D4D4D2", "#FF6B35", "#F6E8E2"),
  lemon: palette("#FAFAF8", "#F0F0EE", "#0A0A0A", "#737373", "#D4D4D2", "#C5E803", "#F3F6E0"),
};

const REGISTRY: Record<ColorThemeId, ColorTheme> = {
  ink: { id: "ink", systemId: "editorial" },
  indigo: { id: "indigo", systemId: "editorial" },
  kraft: { id: "kraft", systemId: "editorial" },
  ikb: { id: "ikb", systemId: "swiss" },
  signal: { id: "signal", systemId: "swiss" },
  lemon: { id: "lemon", systemId: "swiss" },
};

export function registerColorThemePalette(id: ColorThemeId, next: ColorPalette): void {
  const cur = REGISTRY[id];
  if (!cur) throw new Error(`Unknown ColorTheme "${id}".`);
  for (const key of PAINT_ROLES) {
    if (!next[key] || !/^#[0-9A-Fa-f]{6}$/.test(next[key])) {
      throw new Error(`ColorTheme "${id}" missing valid hex for token "${key}".`);
    }
  }
  REGISTRY[id] = { ...cur, palette: { ...next } };
}

for (const id of COLOR_THEME_IDS) {
  registerColorThemePalette(id, COLOR_THEME_PALETTES[id]);
}

export function resolveColorTheme(id: string, systemId: VisualSystemId): ColorTheme {
  if (!isColorThemeId(id)) {
    throw new Error(`Unknown ColorTheme "${id}". Whitelist: ${COLOR_THEME_IDS.join(", ")}.`);
  }
  assertThemePairing(systemId, id);
  return REGISTRY[id];
}

export function defaultColorThemeId(systemId: VisualSystemId): ColorThemeId {
  return DEFAULT_COLOR_THEME[systemId];
}

const HEX = /^#[0-9A-Fa-f]{6}$/;

export function isHexColor(s: string): boolean {
  return HEX.test(s.trim());
}

/** Tint share of the accent over the paper that reads as a chip / soft field, not as the accent itself. */
const SOFT_TINT = { light: 0.14, dark: 0.24 } as const;

/** accentSoft = the accent tinted over the paper (was `bg` — chips and callouts vanished on every brand deck). */
function mixSoft(brand: string, bg: string): string {
  const a = parseHex(brand);
  const b = parseHex(bg);
  if (!a || !b) return bg;
  const dark = relativeLuminance(b) < 0.5;
  return toHex(mixRgb(b, a, dark ? SOFT_TINT.dark : SOFT_TINT.light));
}

/**
 * Contrast floors a deck palette must clear against its own paper. These are the pairings the
 * emitter produces on every page (ink copy on bg, muted captions on bg, ink copy on a surface /
 * accentSoft card), so a miss here is a miss on every slide — fix it once, at the palette.
 */
export const PALETTE_FLOORS = {
  /** Body copy on paper: AAA-ish so muted / lifted variants still clear AA. */
  inkOnBg: 7,
  /** Captions, labels, device bodies set in `muted`. */
  mutedOnBg: 4.5,
  /** Copy inside a card or a soft chip. */
  inkOnSurface: 4.5,
  inkOnAccentSoft: 4.5,
  /** A card must read as a card: below this the surface dissolves into the paper. */
  surfaceOnBg: 1.1,
  /** A chip must read as a chip. */
  accentSoftOnBg: 1.05,
  /** Rules and connectors must be visible. */
  lineOnBg: 1.15,
  /** Accent as a rule / band / icon must not vanish into the paper (text on it is fixed per element). */
  accentOnBg: 1.5,
} as const;

/**
 * Make an authored palette usable as a *system*: every role pairing the emitter relies on clears
 * its floor, and roles that were written as near-duplicates of the paper (surface = bg, accentSoft
 * = bg, line = bg) are pulled apart. Hue is kept — colours move only along the light/dark axis
 * (mixing toward black / white / ink), never toward a different hue.
 */
export function harmonizePalette(input: ColorPalette): ColorPalette {
  const pal: ColorPalette = { ...input };
  const bg = parseHex(pal.bg);
  if (!bg) return pal;
  const dark = relativeLuminance(bg) < 0.5;
  const far: Rgb = dark ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 };
  const rgb = (hex: string, fallback: Rgb): Rgb => parseHex(hex) ?? fallback;
  /** Keep the author's string (case included) when the colour did not actually move. */
  const keep = (authored: string | undefined, next: Rgb): string => {
    const prev = authored ? parseHex(authored) : undefined;
    return prev && prev.r === next.r && prev.g === next.g && prev.b === next.b ? authored! : toHex(next);
  };

  const bgLum = relativeLuminance(bg);
  /** Text on the wrong side of the paper (a light ink on cream, a dark caption on navy) is unreadable, not "a look". */
  const wrongSide = (c: Rgb): boolean => (dark ? relativeLuminance(c) <= bgLum : relativeLuminance(c) >= bgLum);

  // 1. ink — the copy colour. Push toward black / white until it clears the paper.
  let ink = rgb(pal.ink, far);
  if (wrongSide(ink)) ink = far;
  ink = ensureContrast(ink, bg, far, PALETTE_FLOORS.inkOnBg);
  pal.ink = keep(pal.ink, ink);

  // 2. muted — captions and device bodies. Toward ink, so it stays in the family.
  let muted = rgb(pal.muted, ink);
  if (wrongSide(muted)) muted = mixRgb(bg, ink, 0.6);
  pal.muted = keep(pal.muted, ensureContrast(muted, bg, ink, PALETTE_FLOORS.mutedOnBg));

  // 3. accent — must at least be visible as a rule / band; text set in it is re-checked per element.
  const accent = rgb(pal.accent, ink);
  pal.accent = keep(pal.accent, ensureContrast(accent, bg, far, PALETTE_FLOORS.accentOnBg));

  // 4. surface — a card. Light paper: white cards on tinted paper, a faint ink tint on near-white
  //    paper. Dark paper: a step lighter. Then keep ink readable on it.
  let surface = rgb(pal.surface, bg);
  if (contrastRatio(surface, bg) < PALETTE_FLOORS.surfaceOnBg) {
    if (dark) surface = mixRgb(bg, { r: 255, g: 255, b: 255 }, 0.08);
    else if (relativeLuminance(bg) < 0.85) surface = mixRgb(bg, { r: 255, g: 255, b: 255 }, 0.8);
    else surface = mixRgb(bg, ink, 0.06);
  }
  surface = pullToward(surface, bg, ink, PALETTE_FLOORS.inkOnSurface);
  pal.surface = keep(pal.surface, surface);

  // 5. accentSoft — a tint of the accent, never the paper itself; ink must read on it.
  let soft = rgb(pal.accentSoft, bg);
  if (contrastRatio(soft, bg) < PALETTE_FLOORS.accentSoftOnBg || contrastRatio(ink, soft) < PALETTE_FLOORS.inkOnAccentSoft) {
    soft = mixRgb(bg, rgb(pal.accent, ink), dark ? SOFT_TINT.dark : SOFT_TINT.light);
  }
  soft = pullToward(soft, bg, ink, PALETTE_FLOORS.inkOnAccentSoft);
  pal.accentSoft = keep(pal.accentSoft, soft);

  // 6. line — a hairline that exists. Heavy lines (brutalist black rules) are left alone.
  const line = rgb(pal.line, bg);
  if (contrastRatio(line, bg) < PALETTE_FLOORS.lineOnBg) pal.line = toHex(mixRgb(bg, ink, dark ? 0.22 : 0.18));

  return pal;
}

/** Mix `field` toward `bg` until `text` clears `min` on it (a card that got too dark for ink). */
function pullToward(field: Rgb, bg: Rgb, text: Rgb, min: number): Rgb {
  if (contrastRatio(text, field) >= min) return field;
  for (let t = 0.2; t <= 1; t += 0.2) {
    const c = mixRgb(field, bg, t);
    if (contrastRatio(text, c) >= min) return c;
  }
  return bg;
}

/**
 * Colour of type set directly on a filled role (band, table header, step node, hub). Picks whichever
 * of bg / ink / onPhoto reads best on that fill — `bg` text on a lemon accent band was invisible.
 */
export function onRoleText(pal: ColorPalette, fillRole: PaintRole, onPhoto?: string): string {
  const fill = parseHex(pal[fillRole]);
  if (!fill) return pal.bg;
  const candidates = [pal.bg, pal.ink, onPhoto, "#FFFFFF", "#0F172A"].filter((c): c is string => Boolean(c));
  let best = candidates[0]!;
  let bestRatio = 0;
  for (const c of candidates) {
    const r = parseHex(c);
    if (!r) continue;
    const ratio = contrastRatio(r, fill);
    if (ratio >= 4.5) return c;
    if (ratio > bestRatio) {
      bestRatio = ratio;
      best = c;
    }
  }
  return best;
}

/**
 * Seed palettes for canvas-only systems (id stays "custom" — they are not
 * in the locked ColorTheme whitelist). The author normally overrides hex;
 * this keeps the paper tone right when it does not.
 */
export const CANVAS_SYSTEM_SEED_PALETTES: Record<Exclude<BuiltinCanvasSystemId, VisualSystemId>, ColorPalette> = {
  "dark-tech": palette("#0B0F17", "#141A25", "#F2F5FA", "#8B94A7", "#232B3A", "#38BDF8", "#0F2A3A"),
  "soft-rounded": palette("#FBFAF7", "#FFFFFF", "#1F2430", "#6B7280", "#E5E7EB", "#6366F1", "#EEF0FD"),
  "photo-editorial": palette("#111111", "#1C1C1C", "#F5F1E8", "#B8B2A6", "#333333", "#F5F1E8", "#2A2A2A"),
  "data-dense": palette("#F7F7F5", "#FFFFFF", "#111827", "#6B7280", "#D9D9D6", "#0F766E", "#E0F2F0"),
  brutalist: palette("#F2F2F2", "#FFFFFF", "#000000", "#4B4B4B", "#000000", "#FF3B30", "#FFE2DF"),
};

/** Neutral paper for a custom system that declared no seed palette: follows its `canvas.tone`. */
const TONE_SEED_PALETTES: Record<"light" | "dark", ColorPalette> = {
  light: palette("#FFFFFF", "#F5F5F7", "#1D1D1F", "#6E6E73", "#D2D2D7", "#2563EB", "#E6EEFC"),
  dark: palette("#0E0E10", "#1C1C1E", "#F5F5F7", "#A1A1A6", "#2C2C2E", "#5AC8FA", "#10232E"),
};

function seedPaletteFor(systemId: CanvasSystemId, themeId?: string): { id: ColorThemeId | "custom"; base: ColorPalette } {
  if (isVisualSystemId(systemId)) {
    const id: ColorThemeId = themeId && isColorThemeId(themeId) ? themeId : DEFAULT_COLOR_THEME[systemId];
    return { id, base: { ...COLOR_THEME_PALETTES[id] } };
  }
  if (themeId && isColorThemeId(themeId)) return { id: themeId, base: { ...COLOR_THEME_PALETTES[themeId] } };
  if (isBuiltinCanvasSystemId(systemId) && systemId in CANVAS_SYSTEM_SEED_PALETTES) {
    return { id: "custom", base: { ...CANVAS_SYSTEM_SEED_PALETTES[systemId as keyof typeof CANVAS_SYSTEM_SEED_PALETTES] } };
  }
  const custom = getRegisteredVisualSystem(systemId);
  if (custom?.seedPalette) return { id: "custom", base: { ...custom.seedPalette } };
  return { id: "custom", base: { ...TONE_SEED_PALETTES[custom?.system.canvas.tone ?? "light"] } };
}

/** Named theme is a seed. Brand hex replaces accent. Pairing is not required. */
export function seedColorTheme(
  systemId: CanvasSystemId,
  themeId?: string,
  brandHex?: string,
): ColorTheme {
  const { id, base } = seedPaletteFor(systemId, themeId);
  const brand = brandHex && isHexColor(brandHex) ? brandHex.trim() : undefined;
  const palette: ColorPalette = brand ? harmonizePalette({ ...base, accent: brand, accentSoft: mixSoft(brand, base.bg) }) : base;
  const onPhoto = "#F8FAFC";
  return {
    id,
    systemId,
    palette,
    ...(brand ? { brand } : {}),
    onPhoto,
  };
}

function luminance(hex: string): number {
  const rgb = parseHex(hex);
  return rgb ? relativeLuminance(rgb) : 0.5;
}

/**
 * Authored hex replaces the seed role by role; the result is harmonized so a model that wrote
 * `surface` = `bg` or a faint `muted` still yields cards that read and captions that clear AA.
 * When the author gave only bg / ink / accent, the missing roles are *derived* from those three
 * (not inherited from an unrelated seed) so the deck stays in one family.
 */
export function mergeAuthoredPalette(seed: ColorTheme, patch?: Partial<ColorPalette> & { brand?: string; onPhoto?: string }): ColorTheme {
  const pal = { ...paletteOf(seed) };
  const authored = new Set<PaintRole>();
  if (patch) {
    for (const key of PAINT_ROLES) {
      const v = patch[key];
      if (v && isHexColor(v)) {
        pal[key] = v.trim();
        authored.add(key);
      }
    }
  }
  if (authored.has("bg") && authored.has("ink")) {
    const bg = parseHex(pal.bg)!;
    const ink = parseHex(pal.ink)!;
    const dark = relativeLuminance(bg) < 0.5;
    if (!authored.has("surface")) pal.surface = toHex(dark ? mixRgb(bg, { r: 255, g: 255, b: 255 }, 0.08) : relativeLuminance(bg) < 0.85 ? mixRgb(bg, { r: 255, g: 255, b: 255 }, 0.8) : mixRgb(bg, ink, 0.06));
    if (!authored.has("muted")) pal.muted = toHex(mixRgb(ink, bg, 0.35));
    if (!authored.has("line")) pal.line = toHex(mixRgb(bg, ink, dark ? 0.22 : 0.18));
    if (!authored.has("accentSoft") && authored.has("accent")) pal.accentSoft = mixSoft(pal.accent, pal.bg);
  }
  const brand = patch?.brand && isHexColor(patch.brand) ? patch.brand.trim() : seed.brand;
  if (brand) {
    pal.accent = brand;
    if (!patch?.accentSoft || !isHexColor(patch.accentSoft)) pal.accentSoft = mixSoft(brand, pal.bg);
  }
  const harmonized = harmonizePalette(pal);
  const onPhoto =
    patch?.onPhoto && isHexColor(patch.onPhoto) ? patch.onPhoto.trim() : seed.onPhoto ?? (luminance(harmonized.bg) > 0.55 ? "#F8FAFC" : "#0F172A");
  return { ...seed, palette: harmonized, ...(brand ? { brand } : {}), onPhoto };
}

/** Live author look: system + optional named seed + authored hex. Not a user picker. */
export function themeFromAuthoredLook(opts: {
  systemId: CanvasSystemId;
  themeId?: string;
  palette?: Partial<ColorPalette> & { brand?: string; onPhoto?: string };
  brand?: string;
}): ColorTheme {
  const named = opts.themeId && isColorThemeId(opts.themeId) ? opts.themeId : undefined;
  const seed = seedColorTheme(opts.systemId, named, opts.brand);
  const merged = mergeAuthoredPalette(seed, opts.palette);
  if (!named) return { ...merged, id: "custom" };
  return merged;
}

export function parseBrandHex(...blobs: Array<string | undefined>): string | undefined {
  for (const blob of blobs) {
    const m = blob?.match(/#([0-9A-Fa-f]{6})\b/);
    if (m) return `#${m[1]}`;
  }
  return undefined;
}

export function paletteOf(theme: ColorTheme): ColorPalette {
  if (theme.palette) return theme.palette;
  if (theme.id === "custom") {
    throw new Error(`ColorTheme "custom" has no palette.`);
  }
  const registered = REGISTRY[theme.id]?.palette;
  if (!registered) {
    throw new Error(`ColorTheme "${theme.id}" has no registered palette.`);
  }
  return registered;
}

export function isPaintRole(role: string): role is PaintRole {
  return (PAINT_ROLES as readonly string[]).includes(role);
}

export function listColorThemes(): ColorTheme[] {
  return COLOR_THEME_IDS.map((id) => ({ ...REGISTRY[id]! }));
}

export function pairingTable(): typeof COLOR_THEME_PAIRING {
  return COLOR_THEME_PAIRING;
}

export function parseSystemId(id: string): VisualSystemId {
  if (!isVisualSystemId(id)) {
    throw new Error(`Unknown VisualSystem "${id}".`);
  }
  return id;
}
