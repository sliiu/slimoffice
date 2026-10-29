import type { Rect, Transform } from "./geometry";
import type { Paint, Stroke } from "./paint";
import type { Sp3DInfo } from "./three-d";
import type { SmartArtMeta } from "./smartart-layouts";
import type { WebEmbedProvider } from "./web-embed";

export type ShapeKind =
  | "group"
  | "rect"
  | "ellipse"
  | "path"
  | "text"
  | "image"
  | "line"
  | "polygon"
  | "chart"
  | "video"
  | "audio"
  | "ole"
  | "model3d"
  | "webEmbed";

export interface PlaceholderInfo {
  type?: string;
  idx?: string;
  sz?: string;
  orient?: string;
}

// ECMA-376 §20.1.8.45 outerShdw / §20.1.8.40 innerShdw / §20.1.8.49 prstShdw。
// `dx/dy` 为方向角换算后的实际位移（便于直接渲染），`dir/dist` 保留原始
// 角度（度）和距离（px），便于 UI 编辑与无损序列化。outer 还可包含
// 缩放/倾斜（sx/sy/skewX/skewY）和 rotWithShape。preset 形态见 prst。
export interface ShadowEffect {
  kind: "outer" | "inner";
  blur: number;
  dx: number;
  dy: number;
  color: string;
  alpha: number;
  dir?: number;
  dist?: number;
  sx?: number;
  sy?: number;
  skewX?: number;
  skewY?: number;
  algn?: "tl" | "t" | "tr" | "l" | "ctr" | "r" | "bl" | "b" | "br";
  rotWithShape?: boolean;
  prst?: string;
}

export interface GlowEffect {
  kind: "glow";
  radius: number;
  color: string;
  alpha: number;
}

export interface SoftEdgeEffect {
  kind: "softEdge";
  radius: number;
}

export interface ReflectionEffect {
  kind: "reflection";
  blur: number;
  startAlpha: number;
  endAlpha: number;
  startPos: number;
  endPos: number;
  dir: number;
  dist: number;
  sx?: number;
  sy?: number;
  fadeDir?: number;
  algn?: "tl" | "t" | "tr" | "l" | "ctr" | "r" | "bl" | "b" | "br";
  rotWithShape?: boolean;
}

export interface BlurEffect {
  kind: "blur";
  radius: number;
  grow?: boolean;
}

// ECMA-376 §20.1.8 颜色调整型效果（biLevel/clrChange/clrRepl/duotone/fillOverlay/grayscl/hsl/lum/tint）。
export interface ColorChangeEffect {
  kind: "clrChange";
  from: string;
  to: string;
  useA?: boolean;
}
export interface ColorReplaceEffect { kind: "clrRepl"; color: string; }
export interface DuotoneEffect { kind: "duotone"; from: string; to: string; }
export interface BiLevelEffect { kind: "biLevel"; threshold: number; }
export interface FillOverlayEffect {
  kind: "fillOverlay";
  blend?: "over" | "mult" | "screen" | "darken" | "lighten";
  color?: string;
}
export interface GrayscaleEffect { kind: "grayscl"; }
export interface HslEffect { kind: "hsl"; hue?: number; sat?: number; lum?: number; }
export interface LumEffect { kind: "lum"; bright?: number; contrast?: number; }
export interface TintColorEffect { kind: "tint"; hue?: number; amount?: number; }
export interface XfrmEffect {
  kind: "xfrm";
  sx?: number;
  sy?: number;
  kx?: number;
  ky?: number;
  tx?: number;
  ty?: number;
}
// ECMA-376 §20.1.8.x 各种 alpha 类效果。
export interface AlphaCeilingEffect { kind: "alphaCeiling"; }
export interface AlphaFloorEffect { kind: "alphaFloor"; }
export interface AlphaInvEffect { kind: "alphaInv"; color?: string; }
export interface AlphaModEffect { kind: "alphaMod"; }
export interface AlphaModFixedEffect { kind: "alphaModFix"; amount: number; }
export interface AlphaReplaceEffect { kind: "alphaReplace"; alpha: number; }
export interface AlphaOutsetEffect { kind: "alphaOutset"; radius: number; }
export interface AlphaBiLevelEffect { kind: "alphaBiLevel"; threshold: number; }
export interface BlendEffect { kind: "blend"; blend: string; }
export interface RelOffsetEffect { kind: "relOff"; tx?: number; ty?: number; }

export type ShapeEffect =
  | ShadowEffect
  | GlowEffect
  | SoftEdgeEffect
  | ReflectionEffect
  | BlurEffect
  | ColorChangeEffect
  | ColorReplaceEffect
  | DuotoneEffect
  | BiLevelEffect
  | FillOverlayEffect
  | GrayscaleEffect
  | HslEffect
  | LumEffect
  | TintColorEffect
  | XfrmEffect
  | AlphaCeilingEffect
  | AlphaFloorEffect
  | AlphaInvEffect
  | AlphaModEffect
  | AlphaModFixedEffect
  | AlphaReplaceEffect
  | AlphaOutsetEffect
  | AlphaBiLevelEffect
  | BlendEffect
  | RelOffsetEffect;

export interface HyperlinkRef {
  kind: "url" | "slide" | "next" | "prev" | "first" | "last" | "back" | "endShow" | "sound";
  target?: string;
  tooltip?: string;
  action?: string;
  /** ECMA-376 CT_Hyperlink `<a:snd>`：动作设置「播放声音」。 */
  sound?: { name?: string; src?: string };
  /** CT_Hyperlink `@highlightClick`：点击后高亮。 */
  highlightClick?: boolean;
  /** CT_Hyperlink `@endSnd`：触发时停止正在播放的声音。 */
  endSnd?: boolean;
  /** CT_Hyperlink `@tgtFrame`：目标框架名（浏览器场景）。 */
  tgtFrame?: string;
  /** CT_Hyperlink `@history`：默认 true；false 时不写入浏览历史。 */
  history?: boolean;
  /** CT_Hyperlink `@invalidUrl`：关系失效时的回退 URL。 */
  invalidUrl?: string;
}

// ECMA-376 §20.1.2.2.33 stCxn / §20.1.2.2.9 endCxn — 连接符端点粘附。
export interface ShapeCxnEnd {
  id: number;
  idx: number;
  /** IR 目标 shape.id；写出时优先映射到该次序列化的 cNvPr@id。 */
  shapeId?: string;
}

// ECMA-376 §20.1.2.2.34 spLocks / §20.1.2.2.27 picLocks /
// §20.1.2.2.21 cxnSpLocks / §20.1.2.2.20 grpSpLocks /
// §20.1.2.2.18 graphicFrameLocks。所有锁定标志的并集。
export interface ShapeLocks {
  noGrp?: boolean;
  noSelect?: boolean;
  noRot?: boolean;
  noChangeAspect?: boolean;
  noMove?: boolean;
  noResize?: boolean;
  noEditPoints?: boolean;
  noAdjustHandles?: boolean;
  noChangeArrowheads?: boolean;
  noChangeShapeType?: boolean;
  noTextEdit?: boolean;
  noCrop?: boolean;
  noDrilldown?: boolean;
  noUngrp?: boolean;
}

// ECMA-376 §20.1.10.10 ST_BlackWhiteMode — 形状黑白模式渲染策略。
export type BwMode =
  | "clr"
  | "auto"
  | "gray"
  | "ltGray"
  | "invGray"
  | "grayWhite"
  | "blackGray"
  | "blackWhite"
  | "black"
  | "white"
  | "hidden";

export interface StyleRefColor {
  /** `<a:schemeClr val>`（accent1 / lt1 / …）。 */
  scheme?: string;
  /** 解析后的字面色，给预览 / 无 scheme 时写出 srgbClr。 */
  hex?: string;
}

export interface ShapeStyleRefs {
  lnRef?: number;
  fillRef?: number;
  effectRef?: number;
  fontRef?: "minor" | "major";
  lnColor?: StyleRefColor;
  fillColor?: StyleRefColor;
  effectColor?: StyleRefColor;
  fontColor?: StyleRefColor;
}

export interface ShapeMeta {
  id: string;
  name: string;
  zIndex: number;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode?: string;
  effectIds?: string[];
  placeholder?: PlaceholderInfo;
  shadow?: ShadowEffect;
  effects?: ShapeEffect[];
  hyperlink?: HyperlinkRef;
  hoverLink?: HyperlinkRef;
  // ECMA-376 §20.1.5 spPr 下的 scene3d/sp3d，忠实解析见 packages/parser/src/shape-3d.ts。
  meta3D?: Sp3DInfo;
  // ECMA-376 §20.1.4.1.17 / §20.1.4.1.9–15 `<p:style>` 主题样式引用。
  // idx 对偶 parser：fill/ln/effect 为 1-based theme list（0 = 无）；fontRef 为 major/minor。
  // *Color 保留 schemeClr 槽位，from-scratch 写出时才能继续跟主题，而不是只剩烘焙 hex。
  styleRefs?: ShapeStyleRefs;
  // ECMA-376 §20.1.2.2.8 cNvPr 上的可选文字属性。
  title?: string;
  descr?: string;
  // 便捷字段，等价于 locks?.noChangeAspect。保留以维持向后兼容。
  lockAspect?: boolean;
  locks?: ShapeLocks;
  // ECMA-376 §20.1.2.2.35 spPr/@bwMode。
  bwMode?: BwMode;
  // ECMA-376 §19.3.1.43 sp@useBgFill — 形状继承幻灯片背景填充。
  useBgFill?: boolean;
  // ECMA-376 §19.3.1.43 cNvSpPr@txBox — 形状是 PowerPoint 的 "Text Box"（Insert→Text Box）
  // 而非自动图形 (prstGeom) 上的内嵌文字。两者在 PowerPoint 实战中走不同的"缺省字号"
  // 继承链：txBox=1 时走 presentation.xml/defaultTextStyle，其它（prstGeom shape with text）
  // 走 sldMaster/txStyles/otherStyle。具体见 parser/src/inherit.ts 的 non-placeholder 分支。
  txBox?: boolean;
  // ECMA-376 §19.3.1.30 nvPr.userDrawn — 母版上由用户绘制（非占位符）。
  userDrawn?: boolean;
  // ECMA-376 §20.1.10.55 ST_ShapeType — `<a:prstGeom prst>` 的官方 token。
  // PathShape 用它重算 d；parser 把 multiPath 拆成 group 时也必须带上，否则
  // writeback 会丢掉 prstGeom、IR 对账会漏 callout / actionButton 等。
  presetType?: string;
  presetAdj?: Record<string, number>;
  // ECMA-376 §19.3.1 nvPr 媒体引用。
  nvMedia?: {
    audioCdStart?: { track?: number; time?: number };
    audioCdEnd?: { track?: number; time?: number };
    wavAudioFileName?: string;
    /** `<p:wavAudioFile r:embed>` 解析后的媒体 src（data URL / file:）。 */
    wavAudioSrc?: string;
  };
  // ECMA-376 §20.1.9.10 cxnLst — 形状对外提供的连接点（自定义几何）。
  cxnPoints?: Array<{ x: number; y: number; ang?: number }>;
  // ECMA-376 §20.1.2.2.33 stCxn / §20.1.2.2.9 endCxn — 连接符粘附到目标形状
  // 的连接点（id = 目标 cNvPr@id，idx = 连接点序号）。
  startCxn?: ShapeCxnEnd;
  endCxn?: ShapeCxnEnd;
  // ECMA-376 §21.1.3 a:tbl 的最简代理：编辑器把表格建模为一个 group + N×M 个
  // text cell 子形状。group 上写 tableMeta 用作 fast-path（识别它是"表格"语义），
  // 让编辑器/inspector 提供"增/删行列"按钮，同时让 dblclick 路径直接落到具体
  // 命中的 cell 进入文本编辑模式。
  // 序列化：from-scratch 走 graphicFrame/`a:tbl`；round-trip 仅在单元格文字/结构
  // 变化时 surgical patch txBody，未编辑则保留原始 tbl 字节。
  tableMeta?: TableMeta;
  /** SmartArt 语义：group + 卡片子形状；布局见 smartArtMeta.layout。 */
  smartArtMeta?: SmartArtMeta;
  // 表格单元格元数据，挂在 cell（text shape）上：gridSpan/rowSpan 用于跨列/行
  // 合并；hidden=true 表示这个 cell 是合并区中被隐藏的占位 cell，不应渲染。
  cellMeta?: TableCellMeta;
  // 动画单元键（如 "card:0" / "row:3"）。同键的 shape 在 auto-animate 时作为一个
  // 整体入场（组内 withPrevious，组间 afterPrevious），避免"卡片底板已经在，文字
  // 才慢慢飞进来"的割裂感。由 AI compile 层（generate/compile/layouts.ts）写入；
  // parser 不产出此字段，那条路径靠 bbox 包含关系推断。纯内存 IR，不参与 OOXML 序列化。
  animUnit?: string;
  /**
   * ECMA-376 §22.1 Office Math。公式 shape（WPS/Office `<a14:m>` / Fallback 栅格）
   * 挂线性化结果，给搜索 / AI / 无图时的文本回退。不参与 OOXML 写出。
   */
  math?: { latex: string; plain: string };
}

// §21.1.3.13 a:tbl/a:tblPr — 简化版的表格元信息。
// rows/cols 维度信息缓存在 group 上，方便 UI 操作；真实结构由 group.children 顺序
// 决定（按 r*cols + c 排列）。
export interface TableMeta {
  rows: number;
  cols: number;
  firstRow?: boolean;
  lastRow?: boolean;
  firstCol?: boolean;
  lastCol?: boolean;
  bandRow?: boolean;
  bandCol?: boolean;
  styleId?: string;
}

export type { SmartArtLayoutKind, SmartArtMeta, SmartArtItem } from "./smartart-layouts";

// §21.1.3.16 a:tc — 单元格扩展属性。
export interface TableCellBorders {
  l?: Stroke;
  r?: Stroke;
  t?: Stroke;
  b?: Stroke;
  tl2br?: Stroke;
  bl2tr?: Stroke;
}

export interface TableCellMeta {
  // 行内合并跨度（>=1）。1 表示无合并。
  gridSpan?: number;
  // 跨行合并跨度（>=1）。1 表示无合并。
  rowSpan?: number;
  // 被合并覆盖的"伴生 cell"标志：渲染时跳过，删除行/列时一并清理。
  hidden?: boolean;
  /** ECMA-376 §21.1.3 lnL/lnR/lnT/lnB / lnTlToBr / lnBlToTr。缺省则回退 `cell.stroke` 四边同色。 */
  borders?: TableCellBorders;
}

export interface BaseShape extends ShapeMeta {
  kind: ShapeKind;
  bbox: Rect;
  transform: Transform;
  fill?: Paint;
  stroke?: Stroke;
}

export interface GroupShape extends BaseShape {
  kind: "group";
  children: Shape[];
  clipChildren?: boolean;
}

export interface RectShape extends BaseShape {
  kind: "rect";
  rx?: number;
  ry?: number;
}

export interface EllipseShape extends BaseShape {
  kind: "ellipse";
}

export interface PathShape extends BaseShape {
  kind: "path";
  d: string;
  fillRule?: "nonzero" | "evenodd";
  // 编辑器添加的预设形状会在这里记录原始 OOXML preset 名（如 "donut" / "blockArc"），
  // 这样 bbox 变化（拖动 / resize）时可以基于预设几何重新生成 d，而不是单纯
  // 平移路径字符串 —— 后者无法处理 resize 对曲率与半径的几何拉伸。
  presetType?: string;
  presetAdj?: Record<string, number>;
  /** Office ink (`p:contentPart` + InkML) or Draw 笔迹。写出走 contentPart，不是普通 custGeom。 */
  ink?: { mode?: "pen" | "highlighter" };
}

export interface LineShape extends BaseShape {
  kind: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface PolygonShape extends BaseShape {
  kind: "polygon";
  points: Array<[number, number]>;
}

export interface TextRun {
  text: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number | string;
  italic?: boolean;
  underline?: boolean | "single" | "double" | "dotted" | "dashed" | "wavy";
  underlineColor?: string;
  // ECMA-376 §21.1.2.3.9 rPr/uLn — 下划线描边样式（除 underlineColor 外的细节）。
  underlineStroke?: Stroke;
  // uFillTx / uLnTx — 下划线跟随文字色。
  underlineFollow?: boolean;
  strikethrough?: "none" | "single" | "double";
  color?: string;
  fill?: Paint;
  // ECMA-376 §21.1.2.3.9 rPr/ln — 文字描边。
  textOutline?: Stroke;
  effects?: ShapeEffect[];
  letterSpacing?: number;
  baseline?: number;
  caps?: "none" | "small" | "all";
  highlight?: string;
  lang?: string;
  altLang?: string;
  kern?: number;
  // ECMA-376 §21.1.2.3.9 rPr 杂项标志。
  kumimoji?: boolean;
  normalizeH?: boolean;
  noProof?: boolean;
  dirty?: boolean;
  err?: boolean;
  smtClean?: boolean;
  smtId?: number;
  bmk?: string;
  hyperlink?: HyperlinkRef;
  hoverLink?: HyperlinkRef;
  // 字段类型（来自 <a:fld@type>），如 slidenum/datetime1/etc.
  field?: string;
  /** ECMA-376 §22.1 Office Math。latex 给 KaTeX / AI；text 仍是线性化纯文本。 */
  math?: { latex: string; plain: string };
}

export type BulletDef =
  | { kind: "none" }
  | {
      kind: "char";
      char: string;
      font?: string;
      color?: string;
      // ECMA-376 §21.1.2.4.4 buSzPct — 相对 run 字号的百分比 (0..N)。
      sizePct?: number;
      // ECMA-376 §21.1.2.4.5 buSzPts — 绝对 pt 数。两者互斥，sizePts 优先。
      sizePts?: number;
    }
  | {
      kind: "number";
      numType: string;
      startAt?: number;
      font?: string;
      color?: string;
      sizePct?: number;
      sizePts?: number;
    }
  | { kind: "picture"; src: string; sizePct?: number; sizePts?: number };

export interface TabStop {
  pos: number;
  align?: "l" | "ctr" | "r" | "dec";
}

export interface TextParagraph {
  align?: "start" | "middle" | "end" | "justify";
  lineHeight?: number;
  lineHeightPx?: number;
  spaceBeforePx?: number;
  spaceAfterPx?: number;
  indent?: number;
  marginLeft?: number;
  marginRight?: number;
  level?: number;
  bullet?: BulletDef;
  rtl?: boolean;
  defTabSz?: number;
  tabStops?: TabStop[];
  fontAlign?: "t" | "ctr" | "b" | "base" | "auto";
  // ECMA-376 §21.1.2.2.6 pPr 上的换行/标点开关。
  eaLnBrk?: boolean;
  latinLnBrk?: boolean;
  hangingPunct?: boolean;
  // 段落级 run 属性默认（defRPr）。
  defRunStyle?: Partial<TextRun>;
  runs: TextRun[];
}

export interface TextInsets {
  l: number;
  t: number;
  r: number;
  b: number;
}

export type TextAutoFit =
  | { kind: "none" }
  | { kind: "normAutofit"; fontScale?: number; lnSpcReduction?: number }
  | { kind: "spAutoFit" };

// ECMA-376 §21.1.2.1.1 bodyPr 上其余可选属性。
export type TextOverflow = "overflow" | "ellipsis" | "clip";
export type TextVertOverflow = "overflow" | "ellipsis" | "clip";

/** ECMA-376 §20.1.10.58 ST_TextVerticalType */
export type TextVert =
  | "horz"
  | "vert"
  | "vert270"
  | "wordArtVert"
  | "wordArtVertRtl"
  | "eaVert"
  | "mongolianVert";

export interface TextShape extends BaseShape {
  kind: "text";
  paragraphs: TextParagraph[];
  vAlign?: "top" | "middle" | "bottom";
  wrap?: boolean;
  insets?: TextInsets;
  autoFit?: TextAutoFit;
  bodyRot?: number;
  vert?: TextVert;
  numCol?: number;
  spcCol?: number;
  // bodyPr 其余属性（ECMA-376 §21.1.2.1.1）。
  // 渲染状态见后面注释；解析阶段一律保留，便于 round-trip 保存与未来逐项实现。
  // ----------------------------------------------------------------------------
  // anchorCtr ✓ 已渲染（svg / canvas / text-hit `mapVisualAlignWithAnchorCtr`）。
  //   "horizontal anchor center"：当 true 且 **段落数 == 1** 时，PowerPoint 会
  //   把一行文字按其实际宽度水平居中（无视 paragraph align）。多段时规范明确
  //   "non-applicable"。
  anchorCtr?: boolean;
  // spcFirstLastPara ✓ 已渲染（svg-backend / canvas-backend `respectFirstLast`）。
  //   仅当显式声明为 false 时抑制首末段对应的 spcBef/spcAft；undefined 维持现有
  //   "全应用"行为以保持 baseline 兼容。
  spcFirstLastPara?: boolean;
  // vertOverflow / horzOverflow ✓ 已渲染（clipPath + ellipsis 处理）。
  vertOverflow?: TextVertOverflow;
  horzOverflow?: TextOverflow;
  // rtlCol ✓ 已渲染（多列 RTL 顺序）。
  rtlCol?: boolean;
  // fromWordArt ✓ 渲染时把墨迹外接矩形拉满形状框（svg / canvas）。
  //   老艺术字的 sz 只是排版起点；WPS / PowerPoint 的画面大小由 xfrm 决定。
  //   不改模型字号，导出仍写原 sz。
  fromWordArt?: boolean;
  // forceAA ⚠ 解析但未消费。"force anti-alias"，浏览器 / canvas 默认就开 AA，无需特殊处理。
  forceAA?: boolean;
  // upright ✓ 已渲染（svg/canvas/text-stacked 都按反向旋转抵消形状 rot）。
  upright?: boolean;
  // compatLnSpc ✓ 已渲染：未设显式行距时用 ascent+descent（缺测则 1em）。
  compatLnSpc?: boolean;
  // prstTxWarp：textNoShape / textPlain 按普通文本；textArch* / textWave* / textCircle
  //   等由 renderer/src/text-warp.ts 沿路径排字（canvas + SVG）。
  prstTxWarp?: { prst: string; avLst?: Record<string, number> };
  // ECMA-376 §21.1.2.1.1 bodyPr 内的 scene3d/sp3d/flatTx —
  // 描述文本的 3D 立体效果，与 spPr 的 meta3D 各自独立。
  // 写出：from-scratch `txBodyShell` / round-trip `patchBodyPr` 写入 bodyPr。
  // 预览：有挤出 / 倒角 / 相机时，正面贴图走 three-bake；否则仍是平面文字。
  body3D?: Sp3DInfo;
  // ECMA-376 §21.1.2.1.5 lstStyle — 当前文本框的 9 级默认段落/run 样式。
  lstStyle?: TextLevelStyle[];
}

export interface TextLevelStyle {
  level: number;
  pPr?: Partial<TextParagraph>;
  rPr?: Partial<TextRun>;
  bullet?: BulletDef;
}

export interface ImageShape extends BaseShape {
  kind: "image";
  src: string;
  natural?: { w: number; h: number };
  cropRect?: { l: number; t: number; r: number; b: number };
  /** `p:pic` / `a:custGeom` 的轮廓（幻灯片坐标）。画面裁到这条路径里。 */
  clipD?: string;
  /** Office 2016+ `asvg:svgBlip` 矢量源（data URL）。`src` 仍是 PNG 回退。 */
  svgSrc?: string;
  /** `<a:blip>` 颜色调整（grayscl / duotone / biLevel / clrChange 等）。不含 alphaModFix（那是 opacity）。 */
  adjust?: import("./paint").ImageColorAdjust;
}

/** 经典 c:chart 绘图类型（不含 chartEx）。组合图时系列可覆盖主类型。 */
export type ClassicChartType =
  | "bar"
  | "column"
  | "line"
  | "pie"
  | "doughnut"
  | "area"
  | "scatter"
  | "bubble"
  | "radar"
  | "stock"
  | "surface";

export interface ChartSeries {
  name?: string;
  values: number[];
  color?: string;
  // 组合图：该系列所属的 plot 类型（与 ChartDef.type 不同时写出第二个 c:*Chart）。
  chartType?: ClassicChartType;
  // ECMA-376 §21.2.2.43 dPt — 数据点级颜色（饼图等使用）。
  perPointColors?: string[];
  // ECMA-376 §21.2.2.49 dLbls — 数据标签开关组。
  dataLabels?: ChartDataLabels;
  // ECMA-376 §21.2.2.211 trendline。
  trendline?: { type: string; order?: number; period?: number };
  // ECMA-376 §21.2.2.55 errBars。
  errorBars?: { errBarType?: string; errValType?: string; val?: number };
  // 散点 / 气泡（含柱+散点组合图）：该系列的 (x,y[,z]) 点。缺省时由 values + 分类下标合成。
  points?: Array<{ x: number; y: number; z?: number }>;
  // ECMA-376 §21.2.2.64 explosion — 饼图扇区分离（半径百分比）。
  explosion?: number;
}

export interface ChartDataLabels {
  showVal?: boolean;
  showCatName?: boolean;
  showSerName?: boolean;
  showPercent?: boolean;
  showLegendKey?: boolean;
  showBubbleSize?: boolean;
  separator?: string;
  position?: string;
  numFmt?: string;
}

// ECMA-376 §21.2.2.7 catAx / §21.2.2.214 valAx / §21.2.2.51 dateAx —
// 把分类、数值、日期轴归一成同一接口。
export interface ChartAxis {
  type: "cat" | "val" | "date";
  id?: string;
  delete?: boolean;
  position?: "b" | "l" | "r" | "t";
  title?: string;
  scaling?: {
    orientation?: "minMax" | "maxMin";
    min?: number;
    max?: number;
    logBase?: number;
  };
  majorUnit?: number;
  minorUnit?: number;
  majorTickMark?: "none" | "in" | "out" | "cross";
  minorTickMark?: "none" | "in" | "out" | "cross";
  majorGridlines?: boolean;
  minorGridlines?: boolean;
  numFmt?: string;
  crosses?: "autoZero" | "max" | "min" | number;
  baseTimeUnit?: "days" | "months" | "years";
  majorTimeUnit?: "days" | "months" | "years";
  minorTimeUnit?: "days" | "months" | "years";
}

export interface ChartBase {
  title?: string;
  categories?: string[];
  series: ChartSeries[];
  legend?: boolean;
  colors?: string[];
  showValues?: boolean;
  // ECMA-376 §21.2.2.231 varyColors。
  varyColors?: boolean;
  // ECMA-376 §21.2.2.42 dLbls — 全图数据标签默认。
  dataLabels?: ChartDataLabels;
  axes?: ChartAxis[];
  /** ECMA-376 §21.2.2.216 chartSpace/txPr — 全图文字默认色（轴标签、数据标签、图例、标题）。 */
  textColor?: string;
  /** 全图文字默认字号（px；OOXML 默认 10pt ≈ 13px）。 */
  textSize?: number;
  /** 轴线 / 网格线颜色（catAx·valAx spPr 与 majorGridlines spPr 的统一值）。 */
  lineColor?: string;
  /** 来自 bar3DChart / pie3DChart / line3DChart 等。 */
  chart3D?: boolean;
  /** ECMA-376 §21.2.2.209 view3D。 */
  view3D?: ChartView3D;
}

export interface ChartView3D {
  rotX?: number;
  rotY?: number;
  rAngAx?: boolean;
  perspective?: number;
  depthPercent?: number;
}

export interface BarChartDef extends ChartBase {
  type: "bar" | "column";
  stacked?: boolean;
  percentStacked?: boolean;
}

export interface LineChartDef extends ChartBase {
  type: "line";
  smooth?: boolean;
  markers?: boolean;
}

export interface PieChartDef extends ChartBase {
  type: "pie" | "doughnut";
  holeRatio?: number;
  /** ECMA-376 firstSliceAng：从 12 点方向顺时针的起始角（度）。 */
  startAngle?: number;
  /** ECMA-376 ofPieChart：复合饼/条。 */
  ofPie?: "pie" | "bar";
}

export interface AreaChartDef extends ChartBase {
  type: "area";
  stacked?: boolean;
}

export interface ScatterChartDef extends ChartBase {
  type: "scatter";
  points: Array<Array<{ x: number; y: number }>>;
}

export interface BubbleChartDef extends ChartBase {
  type: "bubble";
  points: Array<Array<{ x: number; y: number; z?: number }>>;
}

export interface RadarChartDef extends ChartBase {
  type: "radar";
  radarStyle?: "standard" | "marker" | "filled";
}

export interface StockChartDef extends ChartBase {
  type: "stock";
}

export interface SurfaceChartDef extends ChartBase {
  type: "surface";
  wireframe?: boolean;
}

// PPT 2016+ ECMA-376 Part 4 §4 chartEx (cx:) — 现代图表类型。
// 所有这些类型都共享 ChartBase；视具体类型补充必要字段（如 binCount）。
export interface SunburstChartDef extends ChartBase { type: "sunburst"; }
export interface TreemapChartDef extends ChartBase { type: "treemap"; }
export interface WaterfallChartDef extends ChartBase { type: "waterfall"; }
export interface FunnelChartDef extends ChartBase { type: "funnel"; }
export interface ParetoChartDef extends ChartBase { type: "pareto"; }
export interface HistogramChartDef extends ChartBase {
  type: "histogram";
  binCount?: number;
  binSize?: number;
}
export interface BoxWhiskerChartDef extends ChartBase { type: "boxWhisker"; }
export interface RegionChartDef extends ChartBase { type: "region"; }
// 兜底：无法细分的现代 chartEx 类型。
export interface UnknownChartDef extends ChartBase {
  type: "unknown";
  rawType?: string;
}

export type ChartDef =
  | BarChartDef
  | LineChartDef
  | PieChartDef
  | AreaChartDef
  | ScatterChartDef
  | BubbleChartDef
  | RadarChartDef
  | StockChartDef
  | SurfaceChartDef
  | SunburstChartDef
  | TreemapChartDef
  | WaterfallChartDef
  | FunnelChartDef
  | ParetoChartDef
  | HistogramChartDef
  | BoxWhiskerChartDef
  | RegionChartDef
  | UnknownChartDef;

export interface ChartShape extends BaseShape {
  kind: "chart";
  chart: ChartDef;
}

export interface MediaTrim {
  start?: number;
  end?: number;
}

export interface VideoShape extends BaseShape {
  kind: "video";
  src: string;
  poster?: string;
  /** 与图片相同的 `a:srcRect`。视频在 OOXML 里仍是 `p:pic`。 */
  cropRect?: { l: number; t: number; r: number; b: number };
  duration?: number;
  autoplay?: boolean;
  loop?: boolean;
  muted?: boolean;
  controls?: boolean;
  trim?: MediaTrim;
  fadeIn?: number;
  fadeOut?: number;
  volume?: number;
}

export interface AudioShape extends BaseShape {
  kind: "audio";
  src: string;
  duration?: number;
  autoplay?: boolean;
  /** ECMA-376 §19.5.7 `p:audio@isNarration`：录制旁白，PowerPoint 放映时受"播放旁白"开关控制。 */
  isNarration?: boolean;
  /** ECMA-376 `cMediaNode@numSld`：从本页起连续播放的幻灯片数。PowerPoint 用 999 表示直到放映结束。 */
  numSld?: number;
  loop?: boolean;
  muted?: boolean;
  trim?: MediaTrim;
  fadeIn?: number;
  fadeOut?: number;
  volume?: number;
}

/** ECMA-376 §19.3.3.26 oleObj — embedded / linked OLE object in a graphicFrame. */
export interface OleObjectShape extends BaseShape {
  kind: "ole";
  progId?: string;
  objectName?: string;
  showAsIcon?: boolean;
  isLinked?: boolean;
  /** Resolved package path (e.g. ppt/embeddings/oleObject1.bin). */
  embedPath?: string;
  embedFileName?: string;
  typeLabel?: string;
  badgeText?: string;
  badgeColor?: string;
  iconSize?: { w: number; h: number };
  /** Resolved preview URL (image or PDF blob/data URL) when embedding contains rasterizable content. */
  previewSrc?: string;
  previewKind?: "image" | "pdf";
  /** From-scratch insert: raw embedding bytes as data URL. */
  embedSrc?: string;
}

/** MS-ODRAWXML §2.31.3.3 CT_Model3D — Insert 3D Models (glTF in ppt/media). */
export interface Model3DRotation {
  lat?: number;
  lon?: number;
  rev?: number;
}

export interface Model3DTransform {
  scale?: { x: number; y: number; z: number };
  rot?: Model3DRotation;
  off?: { x: number; y: number; z: number };
}

export interface Model3DCamera {
  preset?: string;
  rot?: Model3DRotation;
}

export interface Model3DShape extends BaseShape {
  kind: "model3d";
  objectName?: string;
  glbSrc?: string;
  glbPath?: string;
  rasterSrc?: string;
  rasterPath?: string;
  camera?: Model3DCamera;
  modelTransform?: Model3DTransform;
}

/** HTML iframe embed (YouTube / Vimeo / custom HTTPS URL). JSON/HTML-native; PPTX export degrades. */
export interface WebEmbedShape extends BaseShape {
  kind: "webEmbed";
  embedUrl: string;
  provider?: WebEmbedProvider;
  originalUrl?: string;
  allowFullscreen?: boolean;
}

export type Shape =
  | GroupShape
  | RectShape
  | EllipseShape
  | PathShape
  | LineShape
  | PolygonShape
  | TextShape
  | ImageShape
  | ChartShape
  | VideoShape
  | AudioShape
  | OleObjectShape
  | Model3DShape
  | WebEmbedShape;
