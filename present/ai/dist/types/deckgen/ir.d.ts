/** Color-free filled IR. ColorTheme / deck palette is applied after fill. */
import type { PaintRole } from "./ids.js";
import type { SlotKind } from "./layouts.js";
import type { SmartArtLayoutKind } from "@sliiu/present-core";
/**
 * Element vocabulary.
 *   primitives  text · image · rule · bar · surface · ellipse · line · overlay
 *   natives     chart · table
 *   preset      shape (OOXML prstGeom via SHAPE_LIBRARY id) · icon (lucide)
 *   composites  diagram (SmartArt layout) · device (expanded to primitives by snap)
 */
export type CanvasKind = SlotKind | "ellipse" | "line" | "chart" | "table" | "overlay" | "shape" | "icon" | "diagram" | "device";
export interface CanvasChart {
    type: "column" | "bar" | "line" | "area" | "pie" | "doughnut";
    categories: string[];
    series: Array<{
        name: string;
        values: number[];
    }>;
}
export interface CanvasTable {
    headers: string[];
    rows: string[][];
}
export interface CanvasDiagram {
    layout: SmartArtLayoutKind;
    items: Array<{
        title: string;
        body?: string;
    }>;
}
/** Inline emphasis inside one text element. `accent` recolors, `bold` weights, `mono` switches face. */
export interface CanvasRun {
    text: string;
    emphasis?: "bold" | "accent" | "mono";
}
/**
 * Display-type treatment (the deck's "art type"). One per page at most, on type ≥ h2:
 *   gradient — linear fill from the type colour into the accent (dark-tech, soft-rounded)
 *   outline  — hollow type, stroke in the type colour (editorial, swiss, brutalist)
 *   shadow   — soft drop shadow under the type (photo canvases; also a legibility aid)
 *   glow     — soft glow in the type colour (dark-tech)
 * Which ones a system allows is decided by snap (`resolveTreatment`).
 */
export type TextTreatment = "gradient" | "outline" | "shadow" | "glow";
export declare const TEXT_TREATMENTS: readonly TextTreatment[];
/** Directional photo scrim: darkest on the type side, fading to clear. */
export interface CanvasScrim {
    direction: "left" | "right" | "top" | "bottom" | "radial" | "flat";
    /** 0..1 peak opacity on the dark side. */
    strength: number;
    /** 0..1 opacity kept on the clear side. Snap sets it when type (an eyebrow, a folio) also sits
     *  on the far side of the photo, so that copy is not left on the bare image. */
    floor?: number;
}
export type DeviceKind = "kpiRow" | "stepStrip" | "numberedList" | "takeawayBand" | "quoteBlock" | "calloutNote" | "comparePlanes" | "iconLabelGrid" | "agendaList";
export interface DeviceItem {
    title: string;
    body?: string;
    /** kpiRow: the big number. */
    value?: string;
    /** kpiRow delta / iconLabelGrid lucide id. */
    note?: string;
    icon?: string;
    /** agendaList: 1-based page the row jumps to. Snap resolves / repairs it against the deck. */
    target?: number;
}
export interface CanvasDevice {
    type: DeviceKind;
    items?: DeviceItem[];
    text?: string;
    attribution?: string;
    icon?: string;
    left?: {
        title: string;
        points: string[];
    };
    right?: {
        title: string;
        points: string[];
    };
}
export interface CanvasBackground {
    kind: "solid" | "image" | "linear";
    /** Image src for photo-as-canvas. Must be data/http(s)/blob. */
    src?: string;
    paintRole?: PaintRole;
    alpha?: number;
    /** 0..1 flat dark scrim over a photo. Prefer `scrim` — snap derives one from the type side. */
    overlay?: number;
    overlayRole?: PaintRole;
    /** Directional scrim; replaces the flat overlay when present. */
    scrim?: CanvasScrim;
    angle?: number;
    toRole?: PaintRole;
}
export interface FilledEl {
    slot: string;
    kind: CanvasKind;
    name: string;
    bbox: {
        x: number;
        y: number;
        w: number;
        h: number;
    };
    paintRole: PaintRole;
    text?: string;
    /** Inline emphasis runs. When set, `text` is their concatenation. */
    runs?: CanvasRun[];
    fontSize?: number;
    fontWeight?: number;
    align?: "start" | "middle" | "end";
    lineHeight?: number;
    src?: string;
    /** 1px hairline when kind === "rule". */
    hairline?: boolean;
    fontFamily?: string;
    italic?: boolean;
    letterSpacing?: number;
    caps?: "all";
    rx?: number;
    fillAlpha?: number;
    gradient?: {
        angle: number;
        toRole: PaintRole;
        fromAlpha?: number;
        toAlpha?: number;
    };
    shadow?: {
        blur: number;
        dx: number;
        dy: number;
        alpha: number;
    };
    /** Soft glow in the element's paint color (dark-tech KPIs, accent shapes). */
    glow?: boolean;
    /** text: display treatment. `shadow` / `glow` are folded into `shadow` / `glow` flags by snap; `gradient` / `outline` reach emit. */
    treatment?: TextTreatment;
    chart?: CanvasChart;
    table?: CanvasTable;
    x2?: number;
    y2?: number;
    /** line: dash pattern and arrow heads. */
    dash?: "solid" | "dash" | "dot";
    arrow?: "none" | "end" | "both";
    /** shape: SHAPE_LIBRARY preset id (whitelisted in snap). */
    preset?: string;
    /** shape: outline only, no fill. */
    strokeOnly?: boolean;
    /** icon: lucide id (whitelisted in snap). */
    icon?: string;
    diagram?: CanvasDiagram;
    device?: CanvasDevice;
    /** Click → jump to this 1-based page (OOXML `ppaction://hlinksldjump`). Emit writes `shape.hyperlink`. */
    link?: number;
}
export interface FilledSlide {
    /** Job or locked layout id — badge only on the canvas path. */
    layout: string;
    variant: string;
    elements: FilledEl[];
    background?: CanvasBackground;
}
