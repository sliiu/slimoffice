import type { Rect, Transform } from "./geometry.js";
import type { Paint, Stroke } from "./paint.js";
import type { Sp3DInfo } from "./three-d.js";
import type { SmartArtMeta } from "./smartart-layouts.js";
import type { WebEmbedProvider } from "./web-embed.js";
export type ShapeKind = "group" | "rect" | "ellipse" | "path" | "text" | "image" | "line" | "polygon" | "chart" | "video" | "audio" | "ole" | "model3d" | "webEmbed";
export interface PlaceholderInfo {
    type?: string;
    idx?: string;
    sz?: string;
    orient?: string;
}
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
export interface ColorChangeEffect {
    kind: "clrChange";
    from: string;
    to: string;
    useA?: boolean;
}
export interface ColorReplaceEffect {
    kind: "clrRepl";
    color: string;
}
export interface DuotoneEffect {
    kind: "duotone";
    from: string;
    to: string;
}
export interface BiLevelEffect {
    kind: "biLevel";
    threshold: number;
}
export interface FillOverlayEffect {
    kind: "fillOverlay";
    blend?: "over" | "mult" | "screen" | "darken" | "lighten";
    color?: string;
}
export interface GrayscaleEffect {
    kind: "grayscl";
}
export interface HslEffect {
    kind: "hsl";
    hue?: number;
    sat?: number;
    lum?: number;
}
export interface LumEffect {
    kind: "lum";
    bright?: number;
    contrast?: number;
}
export interface TintColorEffect {
    kind: "tint";
    hue?: number;
    amount?: number;
}
export interface XfrmEffect {
    kind: "xfrm";
    sx?: number;
    sy?: number;
    kx?: number;
    ky?: number;
    tx?: number;
    ty?: number;
}
export interface AlphaCeilingEffect {
    kind: "alphaCeiling";
}
export interface AlphaFloorEffect {
    kind: "alphaFloor";
}
export interface AlphaInvEffect {
    kind: "alphaInv";
    color?: string;
}
export interface AlphaModEffect {
    kind: "alphaMod";
}
export interface AlphaModFixedEffect {
    kind: "alphaModFix";
    amount: number;
}
export interface AlphaReplaceEffect {
    kind: "alphaReplace";
    alpha: number;
}
export interface AlphaOutsetEffect {
    kind: "alphaOutset";
    radius: number;
}
export interface AlphaBiLevelEffect {
    kind: "alphaBiLevel";
    threshold: number;
}
export interface BlendEffect {
    kind: "blend";
    blend: string;
}
export interface RelOffsetEffect {
    kind: "relOff";
    tx?: number;
    ty?: number;
}
export type ShapeEffect = ShadowEffect | GlowEffect | SoftEdgeEffect | ReflectionEffect | BlurEffect | ColorChangeEffect | ColorReplaceEffect | DuotoneEffect | BiLevelEffect | FillOverlayEffect | GrayscaleEffect | HslEffect | LumEffect | TintColorEffect | XfrmEffect | AlphaCeilingEffect | AlphaFloorEffect | AlphaInvEffect | AlphaModEffect | AlphaModFixedEffect | AlphaReplaceEffect | AlphaOutsetEffect | AlphaBiLevelEffect | BlendEffect | RelOffsetEffect;
export interface HyperlinkRef {
    kind: "url" | "slide" | "next" | "prev" | "first" | "last" | "back" | "endShow" | "sound";
    target?: string;
    tooltip?: string;
    action?: string;
    /** ECMA-376 CT_Hyperlink `<a:snd>`：动作设置「播放声音」。 */
    sound?: {
        name?: string;
        src?: string;
    };
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
export interface ShapeCxnEnd {
    id: number;
    idx: number;
    /** IR 目标 shape.id；写出时优先映射到该次序列化的 cNvPr@id。 */
    shapeId?: string;
}
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
export type BwMode = "clr" | "auto" | "gray" | "ltGray" | "invGray" | "grayWhite" | "blackGray" | "blackWhite" | "black" | "white" | "hidden";
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
    meta3D?: Sp3DInfo;
    styleRefs?: ShapeStyleRefs;
    title?: string;
    descr?: string;
    lockAspect?: boolean;
    locks?: ShapeLocks;
    bwMode?: BwMode;
    useBgFill?: boolean;
    txBox?: boolean;
    userDrawn?: boolean;
    presetType?: string;
    presetAdj?: Record<string, number>;
    nvMedia?: {
        audioCdStart?: {
            track?: number;
            time?: number;
        };
        audioCdEnd?: {
            track?: number;
            time?: number;
        };
        wavAudioFileName?: string;
        /** `<p:wavAudioFile r:embed>` 解析后的媒体 src（data URL / file:）。 */
        wavAudioSrc?: string;
    };
    cxnPoints?: Array<{
        x: number;
        y: number;
        ang?: number;
    }>;
    startCxn?: ShapeCxnEnd;
    endCxn?: ShapeCxnEnd;
    tableMeta?: TableMeta;
    /** SmartArt 语义：group + 卡片子形状；布局见 smartArtMeta.layout。 */
    smartArtMeta?: SmartArtMeta;
    cellMeta?: TableCellMeta;
    animUnit?: string;
    /**
     * ECMA-376 §22.1 Office Math。公式 shape（WPS/Office `<a14:m>` / Fallback 栅格）
     * 挂线性化结果，给搜索 / AI / 无图时的文本回退。不参与 OOXML 写出。
     */
    math?: {
        latex: string;
        plain: string;
    };
}
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
export type { SmartArtLayoutKind, SmartArtMeta, SmartArtItem } from "./smartart-layouts.js";
export interface TableCellBorders {
    l?: Stroke;
    r?: Stroke;
    t?: Stroke;
    b?: Stroke;
    tl2br?: Stroke;
    bl2tr?: Stroke;
}
export interface TableCellMeta {
    gridSpan?: number;
    rowSpan?: number;
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
    presetType?: string;
    presetAdj?: Record<string, number>;
    /** Office ink (`p:contentPart` + InkML) or Draw 笔迹。写出走 contentPart，不是普通 custGeom。 */
    ink?: {
        mode?: "pen" | "highlighter";
    };
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
    underlineStroke?: Stroke;
    underlineFollow?: boolean;
    strikethrough?: "none" | "single" | "double";
    color?: string;
    fill?: Paint;
    textOutline?: Stroke;
    effects?: ShapeEffect[];
    letterSpacing?: number;
    baseline?: number;
    caps?: "none" | "small" | "all";
    highlight?: string;
    lang?: string;
    altLang?: string;
    kern?: number;
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
    field?: string;
    /** ECMA-376 §22.1 Office Math。latex 给 KaTeX / AI；text 仍是线性化纯文本。 */
    math?: {
        latex: string;
        plain: string;
    };
}
export type BulletDef = {
    kind: "none";
} | {
    kind: "char";
    char: string;
    font?: string;
    color?: string;
    sizePct?: number;
    sizePts?: number;
} | {
    kind: "number";
    numType: string;
    startAt?: number;
    font?: string;
    color?: string;
    sizePct?: number;
    sizePts?: number;
} | {
    kind: "picture";
    src: string;
    sizePct?: number;
    sizePts?: number;
};
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
    eaLnBrk?: boolean;
    latinLnBrk?: boolean;
    hangingPunct?: boolean;
    defRunStyle?: Partial<TextRun>;
    runs: TextRun[];
}
export interface TextInsets {
    l: number;
    t: number;
    r: number;
    b: number;
}
export type TextAutoFit = {
    kind: "none";
} | {
    kind: "normAutofit";
    fontScale?: number;
    lnSpcReduction?: number;
} | {
    kind: "spAutoFit";
};
export type TextOverflow = "overflow" | "ellipsis" | "clip";
export type TextVertOverflow = "overflow" | "ellipsis" | "clip";
/** ECMA-376 §20.1.10.58 ST_TextVerticalType */
export type TextVert = "horz" | "vert" | "vert270" | "wordArtVert" | "wordArtVertRtl" | "eaVert" | "mongolianVert";
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
    anchorCtr?: boolean;
    spcFirstLastPara?: boolean;
    vertOverflow?: TextVertOverflow;
    horzOverflow?: TextOverflow;
    rtlCol?: boolean;
    fromWordArt?: boolean;
    forceAA?: boolean;
    upright?: boolean;
    compatLnSpc?: boolean;
    prstTxWarp?: {
        prst: string;
        avLst?: Record<string, number>;
    };
    body3D?: Sp3DInfo;
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
    natural?: {
        w: number;
        h: number;
    };
    cropRect?: {
        l: number;
        t: number;
        r: number;
        b: number;
    };
    /** `p:pic` / `a:custGeom` 的轮廓（幻灯片坐标）。画面裁到这条路径里。 */
    clipD?: string;
    /** Office 2016+ `asvg:svgBlip` 矢量源（data URL）。`src` 仍是 PNG 回退。 */
    svgSrc?: string;
    /** `<a:blip>` 颜色调整（grayscl / duotone / biLevel / clrChange 等）。不含 alphaModFix（那是 opacity）。 */
    adjust?: import("./paint.js").ImageColorAdjust;
}
/** 经典 c:chart 绘图类型（不含 chartEx）。组合图时系列可覆盖主类型。 */
export type ClassicChartType = "bar" | "column" | "line" | "pie" | "doughnut" | "area" | "scatter" | "bubble" | "radar" | "stock" | "surface";
export interface ChartSeries {
    name?: string;
    values: number[];
    color?: string;
    chartType?: ClassicChartType;
    perPointColors?: string[];
    dataLabels?: ChartDataLabels;
    trendline?: {
        type: string;
        order?: number;
        period?: number;
    };
    errorBars?: {
        errBarType?: string;
        errValType?: string;
        val?: number;
    };
    points?: Array<{
        x: number;
        y: number;
        z?: number;
    }>;
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
    varyColors?: boolean;
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
    points: Array<Array<{
        x: number;
        y: number;
    }>>;
}
export interface BubbleChartDef extends ChartBase {
    type: "bubble";
    points: Array<Array<{
        x: number;
        y: number;
        z?: number;
    }>>;
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
export interface SunburstChartDef extends ChartBase {
    type: "sunburst";
}
export interface TreemapChartDef extends ChartBase {
    type: "treemap";
}
export interface WaterfallChartDef extends ChartBase {
    type: "waterfall";
}
export interface FunnelChartDef extends ChartBase {
    type: "funnel";
}
export interface ParetoChartDef extends ChartBase {
    type: "pareto";
}
export interface HistogramChartDef extends ChartBase {
    type: "histogram";
    binCount?: number;
    binSize?: number;
}
export interface BoxWhiskerChartDef extends ChartBase {
    type: "boxWhisker";
}
export interface RegionChartDef extends ChartBase {
    type: "region";
}
export interface UnknownChartDef extends ChartBase {
    type: "unknown";
    rawType?: string;
}
export type ChartDef = BarChartDef | LineChartDef | PieChartDef | AreaChartDef | ScatterChartDef | BubbleChartDef | RadarChartDef | StockChartDef | SurfaceChartDef | SunburstChartDef | TreemapChartDef | WaterfallChartDef | FunnelChartDef | ParetoChartDef | HistogramChartDef | BoxWhiskerChartDef | RegionChartDef | UnknownChartDef;
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
    cropRect?: {
        l: number;
        t: number;
        r: number;
        b: number;
    };
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
    iconSize?: {
        w: number;
        h: number;
    };
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
    scale?: {
        x: number;
        y: number;
        z: number;
    };
    rot?: Model3DRotation;
    off?: {
        x: number;
        y: number;
        z: number;
    };
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
export type Shape = GroupShape | RectShape | EllipseShape | PathShape | LineShape | PolygonShape | TextShape | ImageShape | ChartShape | VideoShape | AudioShape | OleObjectShape | Model3DShape | WebEmbedShape;
