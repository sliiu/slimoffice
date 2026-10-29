export type Paint = SolidPaint | LinearGradientPaint | RadialGradientPaint | ImagePaint | PatternPaint | GroupFillPaint | NoPaint;
export interface NoPaint {
    kind: "none";
}
export interface SolidPaint {
    kind: "solid";
    color: string;
    alpha?: number;
}
export interface GradientStop {
    offset: number;
    color: string;
    alpha?: number;
}
export type GradientFlip = "none" | "x" | "y" | "xy";
export interface GradientRect {
    l: number;
    t: number;
    r: number;
    b: number;
}
export interface LinearGradientPaint {
    kind: "linear";
    stops: GradientStop[];
    angle: number;
    scaled?: boolean;
    flip?: GradientFlip;
    rotWithShape?: boolean;
    tileRect?: GradientRect;
}
export interface RadialGradientPaint {
    kind: "radial";
    stops: GradientStop[];
    path: "circle" | "rect" | "shape";
    fillToRect: GradientRect;
    flip?: GradientFlip;
    rotWithShape?: boolean;
    tileRect?: GradientRect;
}
export interface ImageColorAdjust {
    duotone?: [string, string];
    lum?: {
        bright?: number;
        contrast?: number;
    };
    hsl?: {
        hue?: number;
        sat?: number;
        lum?: number;
    };
    grayscale?: boolean;
    alphaMod?: number;
    alphaModFixed?: number;
    alphaCeiling?: boolean;
    alphaFloor?: boolean;
    alphaInv?: {
        color?: string;
    };
    alphaReplace?: number;
    alphaBiLevel?: number;
    alphaOutset?: number;
    biLevel?: number;
    blur?: {
        radius: number;
        grow?: boolean;
    };
    clrChange?: {
        from: string;
        to: string;
        useA?: boolean;
    };
    clrRepl?: string;
    fillOverlay?: {
        color: string;
        blend?: "over" | "mult" | "screen" | "darken" | "lighten";
    };
    tint?: {
        hue?: number;
        amount?: number;
    };
}
export interface ImagePaint {
    kind: "image";
    src: string;
    fit: "fill" | "contain" | "cover" | "tile";
    alpha?: number;
    srcRect?: {
        l: number;
        t: number;
        r: number;
        b: number;
    };
    natural?: {
        w: number;
        h: number;
    };
    tileAlign?: string;
    tileSx?: number;
    tileSy?: number;
    tileTx?: number;
    tileTy?: number;
    tileFlip?: "none" | "x" | "y" | "xy";
    dpi?: number;
    rotWithShape?: boolean;
    adjust?: ImageColorAdjust;
}
export interface PatternPaint {
    kind: "pattern";
    prst: string;
    fg: string;
    bg: string;
    fgAlpha?: number;
    bgAlpha?: number;
}
export interface GroupFillPaint {
    kind: "groupFill";
}
export type ArrowKind = "none" | "triangle" | "stealth" | "diamond" | "oval" | "arrow";
export interface ArrowEnd {
    kind: ArrowKind;
    w?: "sm" | "med" | "lg";
    len?: "sm" | "med" | "lg";
}
export type StrokeCompound = "sng" | "dbl" | "thickThin" | "thinThick" | "tri";
export type StrokeAlign = "ctr" | "in";
export type StrokeDashPreset = "solid" | "dot" | "dash" | "lgDash" | "dashDot" | "lgDashDot" | "lgDashDotDot" | "sysDash" | "sysDot" | "sysDashDot" | "sysDashDotDot";
export interface CustomDashStop {
    d: number;
    sp: number;
}
export interface Stroke {
    paint: Paint;
    width: number;
    dash?: number[];
    dashPreset?: StrokeDashPreset;
    custDash?: CustomDashStop[];
    cap?: "butt" | "round" | "square";
    join?: "miter" | "round" | "bevel";
    miterLimit?: number;
    cmpd?: StrokeCompound;
    align?: StrokeAlign;
    headEnd?: ArrowEnd;
    tailEnd?: ArrowEnd;
}
