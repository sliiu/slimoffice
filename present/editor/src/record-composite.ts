import type { PipPreferences, PipSizePreset, PipCorner } from "./record-show-overlay";

/** PIP width as a fraction of the composite canvas (screen recording). */
export const PIP_WIDTH_FRACTION: Record<PipSizePreset, number> = {
  s: 0.18,
  m: 0.22,
  l: 0.28,
};

export interface PipDrawRect {
  x: number;
  y: number;
  w: number;
  h: number;
  mirror: boolean;
}

/** Bottom-right PIP placement for screen+camera composite recording. */
export function computePipDrawRect(
  canvasW: number,
  canvasH: number,
  prefs?: Pick<PipPreferences, "size" | "mirror" | "corner">,
): PipDrawRect {
  const size = prefs?.size ?? "m";
  const corner: PipCorner = prefs?.corner ?? "br";
  const w = Math.round(canvasW * PIP_WIDTH_FRACTION[size]);
  const h = Math.round(w * 0.75);
  const pad = 16;
  let x: number;
  let y: number;
  switch (corner) {
    case "tl":
      x = pad;
      y = pad;
      break;
    case "tr":
      x = canvasW - w - pad;
      y = pad;
      break;
    case "bl":
      x = pad;
      y = canvasH - h - pad;
      break;
    default:
      x = canvasW - w - pad;
      y = canvasH - h - pad;
  }
  return {
    x,
    y,
    w,
    h,
    mirror: prefs?.mirror !== false,
  };
}

/** Plain-text summary of composite PIP draw rect. */
export function formatPipDrawRectLine(rect: PipDrawRect): string {
  const mirror = rect.mirror ? " · mirrored" : "";
  return `${rect.w}×${rect.h} @ (${rect.x}, ${rect.y})${mirror}`;
}
