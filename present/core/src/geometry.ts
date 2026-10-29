export interface Point {
  x: number;
  y: number;
}

export interface Size {
  w: number;
  h: number;
}

export interface Rect extends Point, Size {}

export interface Transform {
  tx: number;
  ty: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  skewX: number;
  skewY: number;
}

export const identityTransform = (): Transform => ({
  tx: 0,
  ty: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  skewX: 0,
  skewY: 0,
});

export interface RectClipState {
  kind?: "rect";
  direction: "left" | "right" | "top" | "bottom";
  progress: number;
}

export interface WheelClipState {
  kind: "wheel";
  spokes: number;
  progress: number;
}

// ECMA-376 §19.5.8 animEffect filter 的几何实现。
// filter 取值参见规范：barn/blinds/box/checkerboard/circle/diamond/dissolve/fade/
// image/pixelate/plus/randombar/slide/stretch/strips/wedge/wheel/wipe。
// prLst 形如 "horz(in)"、"vert"、"diamondInVerticalIn" 等，由 backend 解析。
export interface EffectClipState {
  kind: "effect";
  filter: string;
  prLst?: string;
  progress: number;
  transition: "in" | "out" | "none";
}

export type ClipState = RectClipState | WheelClipState | EffectClipState;
