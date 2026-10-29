import type { Rect } from "./geometry.js";
import type { Shape } from "./shape.js";
export type SmartArtLayoutKind = "list" | "process" | "cycle" | "pyramid" | "hierarchy" | "matrix" | "chevron" | "funnel" | "timeline" | "radial" | "stacked" | "equation" | "horizontalList" | "processVertical" | "orgChart" | "venn" | "target" | "blockCycle" | "pictureAccent" | "arrowRibbon" | "invertedPyramid" | "pie" | "balance" | "opposingArrows" | "gear" | "horizontalHierarchy" | "converging" | "alternating" | "hexagon" | "pictureCaption";
export declare const SMARTART_LAYOUT_KINDS: SmartArtLayoutKind[];
export interface SmartArtMeta {
    layout: SmartArtLayoutKind;
}
export interface SmartArtItem {
    id: string;
    text: string;
    lvl?: number;
    /** Optional accent image (`pictureAccent` layout). */
    imageSrc?: string;
}
export declare const SMARTART_LAYOUT_LABELS: Record<SmartArtLayoutKind, string>;
/** Office `layoutDef@uniqueId` tail, or a SlimPPT urn, → layout kind. */
export declare function smartArtLayoutFromUniqueId(uniqueId: string | undefined): SmartArtLayoutKind | undefined;
/** OOXML dgm cat type → layout kind。 */
export declare function smartArtLayoutFromCat(cat: string | undefined): SmartArtLayoutKind;
/** 按布局把 SmartArt 项展开为 rect+text 子形状（绝对 bbox，相对 slide）。 */
export declare function buildSmartArtShapes(layout: SmartArtLayoutKind, items: SmartArtItem[], bbox: Rect): Shape[];
/** 从 SmartArt group 子形状提取当前条目（保留 id / lvl / 文本）。 */
export declare function extractSmartArtItems(group: {
    children: Shape[];
}): SmartArtItem[];
export declare function rebuildSmartArtChildren(group: {
    bbox: Rect;
    children: Shape[];
    smartArtMeta?: SmartArtMeta;
}, items: SmartArtItem[], layout?: SmartArtLayoutKind): void;
/** Whether the layout has per-item accent image slots. */
export declare function smartArtLayoutSupportsPictures(layout: SmartArtLayoutKind): boolean;
/** One line per SmartArt item (bulk text pane). */
export declare function serializeSmartArtItemsText(items: SmartArtItem[]): string;
/**
 * Parse bulk text pane lines into items, preserving ids / levels / images when possible.
 */
export declare function parseSmartArtItemLines(text: string, seedItems?: SmartArtItem[]): SmartArtItem[];
