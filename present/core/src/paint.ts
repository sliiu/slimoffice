export type Paint =
  | SolidPaint
  | LinearGradientPaint
  | RadialGradientPaint
  | ImagePaint
  | PatternPaint
  | GroupFillPaint
  | NoPaint;

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

// ECMA-376 §20.1.8 各类 alpha/clr/biLevel/blur/fillOverlay/tint 子效果，
// 全部规范化到 ImageColorAdjust 上以便渲染层一次性应用。
export interface ImageColorAdjust {
  duotone?: [string, string];
  lum?: { bright?: number; contrast?: number };
  hsl?: { hue?: number; sat?: number; lum?: number };
  grayscale?: boolean;
  alphaMod?: number;
  alphaModFixed?: number;
  alphaCeiling?: boolean;
  alphaFloor?: boolean;
  alphaInv?: { color?: string };
  alphaReplace?: number;
  alphaBiLevel?: number;
  alphaOutset?: number;
  biLevel?: number;
  blur?: { radius: number; grow?: boolean };
  clrChange?: { from: string; to: string; useA?: boolean };
  clrRepl?: string;
  fillOverlay?: { color: string; blend?: "over" | "mult" | "screen" | "darken" | "lighten" };
  tint?: { hue?: number; amount?: number };
}

export interface ImagePaint {
  kind: "image";
  src: string;
  fit: "fill" | "contain" | "cover" | "tile";
  alpha?: number;
  srcRect?: { l: number; t: number; r: number; b: number };
  // 图片自然尺寸（px）。OOXML 没有 cover/contain 语义，导出时需要宽高比换算
  // srcRect / fillRect；src 为 dataURL 时序列化端可自行嗅探，但服务端「分离生成」
  // 模式拿不到字节 —— 创建方（enrich / stock_images_use / setSlideBackground）
  // 知道尺寸时应一并写入。
  natural?: { w: number; h: number };
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

// ECMA-376 §20.1.8.47 (`<a:pattFill>`). 图案填充：前景/背景色 + 预设图案。
// `prst` 取值见 ST_PresetPatternVal（pct5/pct10/.../weave/cross 等 ~50 种）。
export interface PatternPaint {
  kind: "pattern";
  prst: string;
  fg: string;
  bg: string;
  fgAlpha?: number;
  bgAlpha?: number;
}

// ECMA-376 §20.1.8.35 (`<a:grpFill>`). 在分组内表示"继承父组的填充"。
// 渲染时若无父组上下文，则视作 noFill。
export interface GroupFillPaint {
  kind: "groupFill";
}

export type ArrowKind = "none" | "triangle" | "stealth" | "diamond" | "oval" | "arrow";

export interface ArrowEnd {
  kind: ArrowKind;
  w?: "sm" | "med" | "lg";
  len?: "sm" | "med" | "lg";
}

// ECMA-376 §20.1.10.30 ST_CompoundLine — 复合线类型（单线/双线/粗细等）。
export type StrokeCompound = "sng" | "dbl" | "thickThin" | "thinThick" | "tri";

// ECMA-376 §20.1.10.39 ST_PenAlignment — 描边相对路径的对齐方式（居中/内描边）。
export type StrokeAlign = "ctr" | "in";

// ECMA-376 §20.1.10.49 ST_PresetLineDashVal — 保留原始预设短划线类型字符串，
// 便于编辑器/序列化无损还原。`dash` 字段保存解析后的实际数组（用于直接渲染）。
export type StrokeDashPreset =
  | "solid"
  | "dot"
  | "dash"
  | "lgDash"
  | "dashDot"
  | "lgDashDot"
  | "lgDashDotDot"
  | "sysDash"
  | "sysDot"
  | "sysDashDot"
  | "sysDashDotDot";

// ECMA-376 §20.1.10.20 (`<a:custDash>`). 自定义 dash 模式：
// 每个 ds 子元素为一段（描边长度 d + 间隔 sp），单位为 stroke-width 的倍数（百分比）。
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
