import type { Shape, Sp3DInfo } from "@sliiu/present-core";
import { type RawNode } from "./raw-xml.js";
/** Strip runtime bake fields — only OOXML-round-trippable 3D params remain. */
export declare function meta3DForWrite(info: Sp3DInfo | undefined): Sp3DInfo | undefined;
export declare function hasMeta3DForWrite(info: Sp3DInfo | undefined): boolean;
/** `<a:scene3d>…</a:scene3d><a:sp3d>…</a:sp3d>` fragment for spPr / new shapes. */
export declare function meta3DToXml(info: Sp3DInfo | undefined): string;
export declare function meta3DEqual(a: Sp3DInfo | undefined, b: Sp3DInfo | undefined): boolean;
/** Sync `<a:scene3d>` / `<a:sp3d>` under `<p:spPr>` from `shape.meta3D`. */
export declare function patchSpPr3DIn(spPr: RawNode, shape: Shape, opts: {
    debug?: boolean;
}, partPath: string): void;
