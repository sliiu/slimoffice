export interface Point {
    x: number;
    y: number;
}
export interface Size {
    w: number;
    h: number;
}
export interface Rect extends Point, Size {
}
export interface Transform {
    tx: number;
    ty: number;
    rotation: number;
    scaleX: number;
    scaleY: number;
    skewX: number;
    skewY: number;
}
export declare const identityTransform: () => Transform;
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
export interface EffectClipState {
    kind: "effect";
    filter: string;
    prLst?: string;
    progress: number;
    transition: "in" | "out" | "none";
}
export type ClipState = RectClipState | WheelClipState | EffectClipState;
