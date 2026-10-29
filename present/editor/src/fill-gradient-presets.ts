import type { Paint } from "@ppt/core";
import type { MessageKey } from "./i18n";

export interface FillGradientPreset {
  id: string;
  labelKey: MessageKey;
  /** CSS gradient for ribbon swatch preview */
  preview: string;
  fill: Paint;
}

const linear = (angle: number, stops: Array<[number, string]>): Paint => ({
  kind: "linear",
  angle,
  stops: stops.map(([offset, color]) => ({ offset, color })),
});

const radial = (stops: Array<[number, string]>): Paint => ({
  kind: "radial",
  path: "circle",
  fillToRect: { l: 0.5, t: 0.5, r: 0.5, b: 0.5 },
  stops: stops.map(([offset, color]) => ({ offset, color })),
});

/** Format tab → Shape Fill gradient shortcuts (Inspector still has full editor). */
export const FILL_GRADIENT_PRESETS: FillGradientPreset[] = [
  {
    id: "blue-lr",
    labelKey: "fillGradient.blueLr",
    preview: "linear-gradient(90deg, #60a5fa, #1d4ed8)",
    fill: linear(0, [
      [0, "#60a5fa"],
      [1, "#1d4ed8"],
    ]),
  },
  {
    id: "sunset-diag",
    labelKey: "fillGradient.sunsetDiag",
    preview: "linear-gradient(135deg, #f97316, #db2777)",
    fill: linear(45, [
      [0, "#f97316"],
      [1, "#db2777"],
    ]),
  },
  {
    id: "green-tb",
    labelKey: "fillGradient.greenTb",
    preview: "linear-gradient(180deg, #86efac, #15803d)",
    fill: linear(90, [
      [0, "#86efac"],
      [1, "#15803d"],
    ]),
  },
  {
    id: "slate-soft",
    labelKey: "fillGradient.slateSoft",
    preview: "linear-gradient(90deg, #f1f5f9, #94a3b8)",
    fill: linear(0, [
      [0, "#f1f5f9"],
      [1, "#94a3b8"],
    ]),
  },
  {
    id: "violet-radial",
    labelKey: "fillGradient.violetRadial",
    preview: "radial-gradient(circle, #c4b5fd, #5b21b6)",
    fill: radial([
      [0, "#c4b5fd"],
      [1, "#5b21b6"],
    ]),
  },
  {
    id: "gold-radial",
    labelKey: "fillGradient.goldRadial",
    preview: "radial-gradient(circle, #fde68a, #b45309)",
    fill: radial([
      [0, "#fde68a"],
      [1, "#b45309"],
    ]),
  },
];
