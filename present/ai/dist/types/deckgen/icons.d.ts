/**
 * Lucide icon → native stroke-only PathShape (no DOM, no raster).
 * Lucide nodes are [tag, attrs] in a 24×24 box; we rewrite circle / rect /
 * line / polyline / polygon into path data so one PathShape carries the icon
 * and exports as `<a:custGeom>` with a real stroke — recolorable in the editor.
 */
import { type PathShape, type Rect } from "@sliiu/present-core";
/**
 * SVG treats a *leading* relative `m` as absolute (§9.3.3). Lucide writes many
 * children that way (`m9 12 2 2 4-4`). Once several children are concatenated
 * into one `d` and later scaled, that `m` becomes a real delta — from the end of
 * the previous child, or from the slide origin for the first one — which drew
 * stray lines from the top-left corner of the slide to the icon. Rewrite it as
 * `M x y` and keep any implicit follow-up pairs relative via an explicit `l`.
 */
export declare function absolutizeLeadingMove(d: string): string;
/** Icon path data in lucide's 24×24 space, or undefined for unknown ids. */
export declare function lucidePathData(id: string): string | undefined;
/**
 * Scale a 24-unit path into `bbox` (uniform scale, centered). Path commands
 * are rewritten numerically so the result is a plain absolute-or-relative
 * SVG path in slide pixels. Arc flags are preserved.
 */
export declare function scalePathData(d: string, bbox: Rect): string;
export interface IconShapeOptions {
    id: string;
    name: string;
    color: string;
    /** Optional filled disc behind the icon (device tiles). */
    strokeWidth?: number;
}
/** Stroke-only PathShape for a lucide icon fitted (uniformly) in `bbox`. */
export declare function iconPathShape(icon: string, bbox: Rect, opts: IconShapeOptions): PathShape | undefined;
