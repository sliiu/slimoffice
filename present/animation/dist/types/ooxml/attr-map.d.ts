import type { ColorResolveCtx } from "./color.js";
import type { SlideEnv, TargetBox } from "./types.js";
export type PropKind = "number" | "color" | "string" | "bool" | "point";
export interface DecodeCtx extends SlideEnv {
    bbox: TargetBox;
    colorCtx?: ColorResolveCtx;
}
export interface AttrSpec {
    property: string;
    kind: PropKind;
    decode?: (raw: string, ctx: DecodeCtx) => unknown;
    decodeBy?: (raw: string, ctx: DecodeCtx) => unknown;
}
export declare function lookupAttr(name: string): AttrSpec | undefined;
