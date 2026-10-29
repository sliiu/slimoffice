// OOXML AnimColor → hex
// 仅完成动画上下文需要的解析；scheme/sys 的实际配色由外部 theme 注入。

import { formatColor, parseColor, type RgbColor } from "./interp";
import type { AnimColor, ColorBy, ColorModifier } from "./types";

export interface ColorResolveCtx {
  scheme?: Record<string, string>;
  sys?: Record<string, string>;
}

export function resolveAnimColor(c: AnimColor | undefined, ctx: ColorResolveCtx = {}): string | undefined {
  if (!c) return undefined;
  let base: RgbColor | null = null;
  if (c.hex) base = parseColor(c.hex);
  else if (c.scheme) base = parseColor(ctx.scheme?.[c.scheme] ?? "#000000");
  else if (c.prst) base = parseColor(prstColor(c.prst) ?? "#000000");
  else if (c.scrgb)
    base = {
      r: Math.round((c.scrgb.r / 100000) * 255),
      g: Math.round((c.scrgb.g / 100000) * 255),
      b: Math.round((c.scrgb.b / 100000) * 255),
      a: 1,
    };
  else if (c.hsl) base = hslToRgb(c.hsl.h / 21600000, c.hsl.s / 100000, c.hsl.l / 100000);
  else if (c.sys?.lastClr) base = parseColor(c.sys.lastClr);
  if (!base) return undefined;
  if (c.modifiers) base = applyMods(base, c.modifiers);
  return formatColor(base);
}

export function applyColorBy(
  from: string,
  by: ColorBy,
  space: "rgb" | "hsl",
  dir: "cw" | "ccw",
): string | undefined {
  const fc = parseColor(from);
  if (!fc) return undefined;
  if (space === "rgb" && by.rgb) {
    return formatColor({
      r: clampByte(fc.r + by.rgb.r / 392.157),
      g: clampByte(fc.g + by.rgb.g / 392.157),
      b: clampByte(fc.b + by.rgb.b / 392.157),
      a: fc.a,
    });
  }
  if (space === "hsl" && by.hsl) {
    const [h, s, l] = rgbToHsl(fc.r / 255, fc.g / 255, fc.b / 255);
    const dh = by.hsl.h / 21600000;
    const ds = by.hsl.s / 100000;
    const dl = by.hsl.l / 100000;
    const nh = wrap01(h + (dir === "ccw" ? -dh : dh));
    const rgb = hslToRgb(nh, clamp01(s + ds), clamp01(l + dl));
    return formatColor({ ...rgb, a: fc.a });
  }
  return undefined;
}

function applyMods(base: RgbColor, mods: ColorModifier[]): RgbColor {
  let [h, s, l] = rgbToHsl(base.r / 255, base.g / 255, base.b / 255);
  let a = base.a;
  for (const m of mods) {
    const v = m.val / 100000;
    switch (m.kind) {
      case "lumMod":
        l *= v;
        break;
      case "lumOff":
        l += v;
        break;
      case "satMod":
        s *= v;
        break;
      case "satOff":
        s += v;
        break;
      case "hueMod":
        h *= v;
        break;
      case "hueOff":
        h += v;
        break;
      case "tint": {
        const k = clamp01(v);
        l = l + (1 - l) * (1 - k);
        break;
      }
      case "shade": {
        const k = clamp01(v);
        l = l * k;
        break;
      }
      case "alpha":
      case "alphaMod":
        a *= v;
        break;
      case "alphaOff":
        a += v;
        break;
    }
  }
  const rgb = hslToRgb(wrap01(h), clamp01(s), clamp01(l));
  return { ...rgb, a: clamp01(a) };
}

const PRESET_COLORS: Record<string, string> = {
  black: "#000000",
  white: "#ffffff",
  red: "#ff0000",
  green: "#008000",
  blue: "#0000ff",
  yellow: "#ffff00",
  cyan: "#00ffff",
  magenta: "#ff00ff",
  gray: "#808080",
  silver: "#c0c0c0",
  lime: "#00ff00",
  maroon: "#800000",
  navy: "#000080",
  olive: "#808000",
  purple: "#800080",
  teal: "#008080",
  aqua: "#00ffff",
  fuchsia: "#ff00ff",
};

function prstColor(name: string): string | undefined {
  return PRESET_COLORS[name.toLowerCase()];
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function clampByte(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return x < 0 ? 0 : x > 255 ? 255 : x;
}

function wrap01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  let v = x;
  while (v < 0) v += 1;
  while (v >= 1) v -= 1;
  return v;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): RgbColor {
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v, a: 1 };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hueToRgb = (t: number): number => {
    let u = t;
    if (u < 0) u += 1;
    if (u > 1) u -= 1;
    if (u < 1 / 6) return p + (q - p) * 6 * u;
    if (u < 1 / 2) return q;
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
    return p;
  };
  return {
    r: Math.round(hueToRgb(h + 1 / 3) * 255),
    g: Math.round(hueToRgb(h) * 255),
    b: Math.round(hueToRgb(h - 1 / 3) * 255),
    a: 1,
  };
}
