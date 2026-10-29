/**
 * User-defined VisualSystems.
 *
 * A skill `.md` may carry one or more fenced blocks whose info string contains
 * `visual-system`; each holds a JSON object in the shape of {@link CustomVisualSystemDef}.
 * Everything is optional except `id`: missing fields come from the builtin system named by
 * `extends` (default `swiss`). The block is validated with zod on upload (save is refused
 * on a hard error) and turned into a {@link RegisteredVisualSystem} when the skill is
 * enabled. Colors are a *seed* only — the author still writes palette hex per deck.
 *
 * ```visual-system
 * {
 *   "id": "apple_keynote",
 *   "name": "Apple keynote",
 *   "extends": "soft-rounded",
 *   "voice": "neo-grotesk",
 *   "typeScale": { "display": 80, "displayCjk": 64, "h1": 40, "h2": 24, "body": 18, "caption": 13 },
 *   "fonts": { "display": "\"SF Pro Display\", \"Inter\", \"PingFang SC\", sans-serif" },
 *   "fontFamilies": ["Inter", "Noto Sans SC"],
 *   "canvas": { "radius": 18, "shadow": false, "glow": false, "tone": "light", "displayTreatment": "none",
 *               "character": "white paper, one product accent, semibold display, one idea per page" },
 *   "palette": { "bg": "#FFFFFF", "ink": "#1D1D1F", "accent": "#0071E3" },
 *   "aliases": ["apple", "keynote"]
 * }
 * ```
 */

import { z } from "zod";
import { CANVAS_SYSTEM_IDS, CUSTOM_SYSTEM_ID_RE, isBuiltinCanvasSystemId, type PaintRole } from "./ids.js";
import {
  DECKGEN_FONT_FAMILIES,
  TYPE_VOICES,
  VISUAL_SYSTEMS,
  type RegisteredVisualSystem,
  type VisualSystem,
} from "./visual-system.js";
import { mixRgb, parseHex, relativeLuminance, toHex } from "../generate/qa/color.js";

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const Hex = z.string().regex(HEX_RE, "expected #RRGGBB");
const Px = z.number().finite().min(8).max(200);

export const CustomVisualSystemSchema = z
  .object({
    id: z.string().regex(CUSTOM_SYSTEM_ID_RE, "id must be lower_snake (a-z, 0-9, _), start with a letter, ≤64 chars"),
    name: z.string().min(1).max(60).optional(),
    /** Builtin system whose values fill every field left out here. */
    extends: z.enum(CANVAS_SYSTEM_IDS).optional(),
    voice: z.enum(TYPE_VOICES).optional(),
    typeScale: z
      .object({
        display: Px.optional(),
        displayCjk: Px.optional(),
        h1: Px.optional(),
        h2: Px.optional(),
        body: Px.optional(),
        caption: Px.optional(),
      })
      .strict()
      .optional(),
    grid: z
      .object({
        columns: z.number().int().min(4).max(24).optional(),
        gutter: z.number().min(0).max(64).optional(),
        margin: z.number().min(0.02).max(0.12).optional(),
      })
      .strict()
      .optional(),
    density: z.enum(["airy", "tight"]).optional(),
    bans: z
      .object({
        roundedCorners: z.boolean().optional(),
        shadows: z.boolean().optional(),
        gradients: z.boolean().optional(),
        centeredDisplay: z.boolean().optional(),
      })
      .strict()
      .optional(),
    fonts: z
      .object({
        display: z.string().min(1).max(200).optional(),
        body: z.string().min(1).max(200).optional(),
        mono: z.string().min(1).max(200).optional(),
      })
      .strict()
      .optional(),
    /** Google Font family names to load in the browser (unknown names are ignored, lint warns). */
    fontFamilies: z.array(z.string().min(1).max(60)).max(8).optional(),
    canvas: z
      .object({
        radius: z.number().min(0).max(64).optional(),
        shadow: z.boolean().optional(),
        glow: z.boolean().optional(),
        tone: z.enum(["light", "dark"]).optional(),
        ruleWidth: z.number().min(0.5).max(8).optional(),
        displayTreatment: z.enum(["none", "gradient", "outline", "shadow", "glow"]).optional(),
        character: z.string().min(1).max(240).optional(),
      })
      .strict()
      .optional(),
    /** Seed palette (bg + ink + accent required when present; the rest is derived). */
    palette: z
      .object({
        bg: Hex,
        surface: Hex.optional(),
        ink: Hex,
        muted: Hex.optional(),
        line: Hex.optional(),
        accent: Hex,
        accentSoft: Hex.optional(),
      })
      .strict()
      .optional(),
    aliases: z.array(z.string().min(2).max(30)).max(8).optional(),
  })
  .strict();

export type CustomVisualSystemDef = z.infer<typeof CustomVisualSystemSchema>;

/** Fence info strings that mark a visual-system block: ```visual-system, ```json visual-system, ```visualsystem. */
const FENCE_RE = /```([^\n]*)\n([\s\S]*?)```/g;

function isVisualSystemFence(info: string): boolean {
  return /\bvisual[-_ ]?system\b/i.test(info);
}

export class CustomVisualSystemError extends Error {
  constructor(message: string, public readonly blockIndex: number) {
    super(message);
    this.name = "CustomVisualSystemError";
  }
}

/**
 * Pull every ```visual-system block out of a skill body. Returns the parsed definitions and
 * the body with those blocks removed (the JSON must not reach the prompt). Throws
 * {@link CustomVisualSystemError} on malformed JSON or schema violations.
 */
export function extractCustomVisualSystems(body: string): { defs: CustomVisualSystemDef[]; body: string } {
  const defs: CustomVisualSystemDef[] = [];
  let index = 0;
  const seen = new Set<string>();
  const stripped = body.replace(FENCE_RE, (whole, info: string, code: string) => {
    if (!isVisualSystemFence(info)) return whole;
    const n = index++;
    let raw: unknown;
    try {
      raw = JSON.parse(code);
    } catch (e) {
      throw new CustomVisualSystemError(`visual-system block #${n + 1}: invalid JSON (${(e as Error).message})`, n);
    }
    const result = CustomVisualSystemSchema.safeParse(raw);
    if (!result.success) {
      const first = result.error.issues[0];
      const path = first?.path.join(".") || "(root)";
      throw new CustomVisualSystemError(`visual-system block #${n + 1}: ${path}: ${first?.message ?? "invalid"}`, n);
    }
    const def = result.data;
    if (isBuiltinCanvasSystemId(def.id)) {
      throw new CustomVisualSystemError(`visual-system block #${n + 1}: "${def.id}" is a builtin system id and cannot be redefined`, n);
    }
    if (seen.has(def.id)) {
      throw new CustomVisualSystemError(`visual-system block #${n + 1}: duplicate system id "${def.id}"`, n);
    }
    seen.add(def.id);
    defs.push(def);
    return "";
  });
  return { defs, body: stripped.replace(/\n{3,}/g, "\n\n").trim() };
}

/** Writes a definition back as the fenced block `extractCustomVisualSystems` reads. */
export function formatCustomVisualSystemBlock(def: CustomVisualSystemDef): string {
  return "```visual-system\n" + JSON.stringify(def, null, 2) + "\n```";
}

/**
 * Resolve a definition against its base: every field the author left out is the base's.
 * `alignment` is always flush-left — the whole canvas pipeline assumes it.
 */
export function buildCustomVisualSystem(def: CustomVisualSystemDef, skillId?: string): RegisteredVisualSystem {
  const base = VISUAL_SYSTEMS[def.extends ?? "swiss"];
  const typeScale = { ...base.typeScale, ...stripUndefined(def.typeScale ?? {}) };
  if (def.typeScale && def.typeScale.display != null && def.typeScale.displayCjk == null && base.typeScale.displayCjk != null) {
    // A new Latin display size with an inherited CJK override would invert the ramp; drop the override.
    delete (typeScale as { displayCjk?: number }).displayCjk;
  }
  const system: VisualSystem = {
    id: def.id,
    name: def.name ?? def.id.replace(/_/g, " "),
    voice: def.voice ?? base.voice,
    typeScale,
    grid: { ...base.grid, ...stripUndefined(def.grid ?? {}) },
    alignment: { title: "start", body: "start" },
    density: def.density ?? base.density,
    bans: { ...base.bans, ...stripUndefined(def.bans ?? {}) },
    fonts: { ...base.fonts, ...stripUndefined(def.fonts ?? {}) },
    canvas: { ...base.canvas, ...stripUndefined(def.canvas ?? {}) },
  };
  // Policy and bans must agree: a system that bans rounded corners has radius 0, and vice versa.
  if (def.canvas?.radius != null && def.bans?.roundedCorners == null) system.bans.roundedCorners = def.canvas.radius === 0;
  if (def.canvas?.shadow != null && def.bans?.shadows == null) system.bans.shadows = !def.canvas.shadow;
  if (def.bans?.roundedCorners && def.canvas?.radius == null) system.canvas.radius = 0;
  if (def.bans?.shadows && def.canvas?.shadow == null) system.canvas.shadow = false;

  const fontFamilies = def.fontFamilies ?? DECKGEN_FONT_FAMILIES[def.extends ?? "swiss"];
  return {
    system,
    fontFamilies,
    ...(def.palette ? { seedPalette: completeSeedPalette(def.palette) } : {}),
    aliases: (def.aliases ?? []).map((a) => a.toLowerCase()),
    ...(skillId ? { skillId } : {}),
  };
}

/** bg / ink / accent are authored; surface, muted, line, accentSoft are derived like mergeAuthoredPalette does. */
function completeSeedPalette(p: NonNullable<CustomVisualSystemDef["palette"]>): Record<PaintRole, string> {
  const bg = parseHex(p.bg)!;
  const ink = parseHex(p.ink)!;
  const accent = parseHex(p.accent)!;
  const dark = relativeLuminance(bg) < 0.5;
  const white = { r: 255, g: 255, b: 255 };
  return {
    bg: p.bg,
    surface: p.surface ?? toHex(dark ? mixRgb(bg, white, 0.08) : relativeLuminance(bg) < 0.85 ? mixRgb(bg, white, 0.8) : mixRgb(bg, ink, 0.04)),
    ink: p.ink,
    muted: p.muted ?? toHex(mixRgb(ink, bg, 0.35)),
    line: p.line ?? toHex(mixRgb(bg, ink, dark ? 0.22 : 0.14)),
    accent: p.accent,
    accentSoft: p.accentSoft ?? toHex(mixRgb(accent, bg, dark ? 0.75 : 0.86)),
  };
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  return out;
}
