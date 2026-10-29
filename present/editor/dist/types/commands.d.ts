import type { BulletDef, ChartDef, EditCommand, HeaderFooter, HyperlinkRef, ImageShape, Paint, Presentation, Rect, Shape, ShapeCxnEnd, ShapeEffect, SlideSize, SlideTransition, Stroke, TableCellBorders, TextParagraph, TextRun, TextShape, TextVert } from "@sliiu/present-core";
import { type CropInsets } from "./crop-frame.js";
import { type TextCharRange } from "./text-char-style.js";
export type EditTarget = {
    kind: "slide";
    slideIdx: number;
} | {
    kind: "master";
    masterId: string;
} | {
    kind: "layout";
    masterId: string;
    layoutId: string;
} | {
    kind: "notesMaster";
    masterId: string;
} | {
    kind: "handoutMaster";
    masterId: string;
};
export declare function slideTarget(slideIdx: number): EditTarget;
export declare function masterTarget(masterId: string): EditTarget;
export declare function layoutTarget(masterId: string, layoutId: string): EditTarget;
export declare function notesMasterTarget(masterId: string): EditTarget;
export declare function handoutMasterTarget(masterId: string): EditTarget;
export interface TargetContainer {
    shapes: Shape[];
    setShapes(next: Shape[]): void;
    background?: import("@sliiu/present-core").Paint;
    setBackground?(next: import("@sliiu/present-core").Paint | undefined): void;
}
export declare function resolveTarget(pres: Presentation, target: EditTarget): TargetContainer | null;
export type TextStylePatch = Partial<Pick<TextRun, "fontFamily" | "fontSize" | "fontWeight" | "italic" | "underline" | "strikethrough" | "color" | "textOutline">> & {
    baseline?: number | null;
    letterSpacing?: number | null;
    highlight?: string | null;
    effects?: import("@sliiu/present-core").ShapeEffect[] | null;
    fill?: import("@sliiu/present-core").Paint | null;
    bmk?: string | null;
    field?: string | null;
};
export declare function shapeAtAnyLayer(pres: Presentation, slideIdx: number, id: string): Shape | undefined;
export declare class MoveShapeCmd implements EditCommand {
    private slideIdx;
    private id;
    private dx;
    private dy;
    readonly label = "Move";
    constructor(slideIdx: number, id: string, dx: number, dy: number);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
type PresetRegen = (s: import("@sliiu/present-core").PathShape) => void;
export declare function registerPathPresetRegenerator(fn: PresetRegen): void;
/** 拖动线条端点手柄后写回 (x1,y1,x2,y2) + 派生 bbox。 */
export declare class SetLineEndpointsCmd implements EditCommand {
    private slideIdx;
    private id;
    private endpoints;
    private bbox;
    private glue?;
    readonly label = "Adjust line";
    private prev?;
    constructor(slideIdx: number, id: string, endpoints: {
        x1: number;
        y1: number;
        x2: number;
        y2: number;
    }, bbox: Rect, glue?: {
        startCxn?: ShapeCxnEnd | null;
        endCxn?: ShapeCxnEnd | null;
    } | undefined);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
/** 拖动肘形 / 曲线连接符端点后写回 bbox + flip + 粘附。 */
export declare class SetPathConnectorEndsCmd implements EditCommand {
    private slideIdx;
    private id;
    private bbox;
    private scaleX;
    private scaleY;
    private glue?;
    readonly label = "Adjust connector";
    private prev?;
    constructor(slideIdx: number, id: string, bbox: Rect, scaleX: number, scaleY: number, glue?: {
        startCxn?: ShapeCxnEnd | null;
        endCxn?: ShapeCxnEnd | null;
    } | undefined);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
/** 拖动多边形顶点手柄后写回 points + 派生 bbox。 */
export declare class SetPolygonPointsCmd implements EditCommand {
    private slideIdx;
    private id;
    private points;
    private bbox;
    readonly label = "Edit points";
    private prev?;
    constructor(slideIdx: number, id: string, points: Array<[number, number]>, bbox: Rect);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
/** 拖动预设几何黄色调整锚点后写回 avLst（presetAdj）并重算 path。 */
export declare class SetPresetAdjCmd implements EditCommand {
    private slideIdx;
    private id;
    private nextAdj;
    readonly label = "Adjust shape";
    private prevAdj?;
    private prevD?;
    private prevFillRule?;
    constructor(slideIdx: number, id: string, nextAdj: Record<string, number>);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class ResizeShapeCmd implements EditCommand {
    private slideIdx;
    private id;
    private next;
    readonly label = "Resize";
    private snapshot?;
    private smartArtRevert?;
    constructor(slideIdx: number, id: string, next: Rect);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
/**
 * 横排文字框被改宽后按框折行。
 *
 * OOXML wrap="none" 的标题 / WordArt / 数字标签在导入后会单行溢出；用户拖窄
 * 宽度是明确的「改排版」操作，应打开 wrap（竖排堆叠仍按列高折列，不改 wrap）。
 */
export declare function enableTextWrapOnWidthChange(s: Shape, prevW: number, nextW: number): void;
export declare class DeleteShapeCmd implements EditCommand {
    private slideIdx;
    private id;
    private target?;
    readonly label = "Delete";
    private removed?;
    constructor(slideIdx: number, id: string, target?: EditTarget | undefined);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class EditTextCmd implements EditCommand {
    private slideIdx;
    private id;
    private nextParagraphs;
    readonly label = "Edit text";
    private prevParagraphs?;
    constructor(slideIdx: number, id: string, nextParagraphs: string[]);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
/** 与 {@link SetFillCmd} 相同的填充落点：整表单元格、multiPath 的 fill 拆分，否则样式基底。 */
export declare function fillTargetsFor(pres: Presentation, slideIdx: number, id: string): Shape[];
export declare class SetFillCmd implements EditCommand {
    private slideIdx;
    private id;
    private next;
    readonly label = "Set fill";
    private prev?;
    private batchPrev?;
    constructor(slideIdx: number, id: string, next: Paint | undefined);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class SetStrokeCmd implements EditCommand {
    private slideIdx;
    private id;
    private next;
    readonly label = "Set stroke";
    private prev?;
    private batchPrev?;
    constructor(slideIdx: number, id: string, next: Stroke | undefined);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class SetTextStyleCmd implements EditCommand {
    private slideIdx;
    private id;
    private patch;
    private ranges?;
    readonly label = "Text style";
    private prev?;
    private prevParagraphs?;
    constructor(slideIdx: number, id: string, patch: TextStylePatch, ranges?: readonly TextCharRange[] | undefined);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
/** 清除选中文本框内所有 run 的字符格式（保留文字与段落级属性）。 */
export declare class ClearTextFormattingCmd implements EditCommand {
    private slideIdx;
    private id;
    readonly label = "Clear formatting";
    private prev?;
    constructor(slideIdx: number, id: string);
    apply(pres: Presentation): void;
    revert(_pres: Presentation): void;
}
/** 与 {@link SetTextStyleCmd} 相同的文本框：整表单元格，或形状上的文本。 */
export declare function textShapesForColor(pres: Presentation, slideIdx: number, id: string): Array<Shape & {
    kind: "text";
}>;
export declare class AddShapeCmd implements EditCommand {
    private slideIdx;
    private layerIdx;
    private shape;
    /** 母版视图下插入 master / layout 装饰时传入；缺省走 slide main layer。 */
    private target?;
    readonly label = "Add shape";
    constructor(slideIdx: number, layerIdx: number, shape: Shape, 
    /** 母版视图下插入 master / layout 装饰时传入；缺省走 slide main layer。 */
    target?: EditTarget | undefined);
    private container;
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
/** Clone a shape (new ids) and insert it on the same layer, offset by dx/dy. */
export declare class DuplicateShapeCmd implements EditCommand {
    private slideIdx;
    private id;
    private dx;
    private dy;
    private newId;
    readonly label = "Duplicate";
    private copy?;
    private layerIdx;
    private insertAt;
    constructor(slideIdx: number, id: string, dx?: number, dy?: number, newId?: string);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class SetTextAlignCmd implements EditCommand {
    private slideIdx;
    private id;
    private align;
    readonly label = "Align";
    private prev?;
    constructor(slideIdx: number, id: string, align: TextParagraph["align"]);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class SetParagraphBulletCmd implements EditCommand {
    private slideIdx;
    private id;
    private next;
    readonly label = "Bullet";
    private prev?;
    constructor(slideIdx: number, id: string, next: BulletDef | undefined);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
/** 段落 RTL（右到左）方向。作用于选中文本框内所有段落。 */
export declare class SetParagraphRtlCmd implements EditCommand {
    private slideIdx;
    private id;
    private rtl;
    readonly label = "Text direction";
    private prev?;
    constructor(slideIdx: number, id: string, rtl: boolean);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
/** 东亚排版开关：eaLnBrk + hangingPunct（CJK 换行 / 标点悬挂）。 */
export declare class SetParagraphCjkCmd implements EditCommand {
    private slideIdx;
    private id;
    private enabled;
    readonly label = "East Asian typography";
    private prev?;
    constructor(slideIdx: number, id: string, enabled: boolean);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export type ParagraphSpacingPatch = Partial<{
    lineHeight: number | null;
    lineHeightPx: number | null;
    spaceBeforePx: number | null;
    spaceAfterPx: number | null;
    indent: number | null;
    marginLeft: number | null;
    marginRight: number | null;
}>;
export declare class SetParagraphSpacingCmd implements EditCommand {
    private slideIdx;
    private id;
    private patch;
    readonly label = "Paragraph spacing";
    private prev?;
    constructor(slideIdx: number, id: string, patch: ParagraphSpacingPatch);
    apply(pres: Presentation): void;
    revert(_pres: Presentation): void;
}
export interface RichRun {
    text: string;
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: number;
    italic?: boolean;
    underline?: boolean | "single" | "double" | "dotted" | "dashed" | "wavy";
    strikethrough?: "none" | "single" | "double";
    color?: string;
    letterSpacing?: number;
    baseline?: number;
    caps?: "none" | "small" | "all";
    highlight?: string;
    hyperlinkUrl?: string;
}
export interface RichParagraph {
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
    runs: RichRun[];
}
export declare class SetRichTextCmd implements EditCommand {
    private slideIdx;
    private id;
    private nextParagraphs;
    readonly label = "Rich text";
    private prev?;
    constructor(slideIdx: number, id: string, nextParagraphs: RichParagraph[]);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
/** 用完整 paragraphs 替换 text shape 内容（保留 run/段级样式结构）。 */
export declare class SetParagraphsCmd implements EditCommand {
    private slideIdx;
    private id;
    private nextParagraphs;
    readonly label = "Set text";
    private prev?;
    constructor(slideIdx: number, id: string, nextParagraphs: TextParagraph[]);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export type TextCaseMode = "upper" | "lower" | "title" | "sentence";
export declare class ChangeTextCaseCmd implements EditCommand {
    private slideIdx;
    private id;
    private mode;
    readonly label = "Change case";
    private prev?;
    constructor(slideIdx: number, id: string, mode: TextCaseMode);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export interface FormatSnapshot {
    fill?: Paint;
    stroke?: Stroke;
    opacity?: number;
    shadow?: Shape["shadow"];
    effects?: ShapeEffect[];
    copyEffects?: boolean;
    textStyle?: TextStylePatch;
    textAlign?: TextParagraph["align"];
    copyBullet?: boolean;
    bullet?: BulletDef;
}
/** 从当前选中的 shape 捕获可刷格式（首段首 run 的字符样式 + 形状视觉属性）。 */
export declare function captureFormatSnapshot(shape: Shape): FormatSnapshot;
export declare class ApplyFormatCmd implements EditCommand {
    private slideIdx;
    private id;
    private snapshot;
    readonly label = "Format painter";
    private subCmds;
    private effectsPrev?;
    constructor(slideIdx: number, id: string, snapshot: FormatSnapshot);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export interface TextBodyPatch {
    vAlign?: "top" | "middle" | "bottom" | null;
    wrap?: boolean | null;
    insets?: {
        l?: number;
        t?: number;
        r?: number;
        b?: number;
    } | null;
    autoFit?: "none" | "normAutofit" | "spAutoFit" | null;
    vert?: TextVert | null;
    numCol?: number | null;
    spcCol?: number | null;
    rtlCol?: boolean | null;
    upright?: boolean | null;
    vertOverflow?: TextShape["vertOverflow"] | null;
    horzOverflow?: TextShape["horzOverflow"] | null;
    anchorCtr?: boolean | null;
    bodyRot?: number | null;
}
/** WPS「竖排（堆叠）」：wordArtVert = 行顺序从左到右，wordArtVertRtl = 从右到左。 */
export declare function isWordArtStackedVert(vert: TextVert | undefined): boolean;
/** 当前文本框的行顺序是否从右到左（堆叠看 vert，其它模式看 rtlCol）。 */
export declare function textRowOrderRtl(text: TextShape): boolean;
export declare function textRowOrderPatch(text: TextShape, rtl: boolean): TextBodyPatch;
export declare class SetTextBodyCmd implements EditCommand {
    private slideIdx;
    private id;
    private patch;
    readonly label = "Text body";
    private prev?;
    constructor(slideIdx: number, id: string, patch: TextBodyPatch);
    apply(pres: Presentation): void;
    revert(_pres: Presentation): void;
}
export interface ShapeEffectsPatch {
    shadow?: {
        kind?: "outer" | "inner";
        blur?: number;
        dx?: number;
        dy?: number;
        dir?: number;
        dist?: number;
        color?: string;
        alpha?: number;
        prst?: string;
    } | null;
    glow?: {
        radius: number;
        color: string;
        alpha?: number;
    } | null;
    softEdge?: {
        radius: number;
    } | null;
    reflection?: {
        blur?: number;
        startAlpha?: number;
        endAlpha?: number;
        dist?: number;
        dir?: number;
    } | null;
    blur?: {
        radius: number;
        grow?: boolean;
    } | null;
}
export declare class SetShapeEffectsCmd implements EditCommand {
    private slideIdx;
    private id;
    private patch;
    readonly label = "Shape effects";
    private snap?;
    constructor(slideIdx: number, id: string, patch: ShapeEffectsPatch);
    apply(pres: Presentation): void;
    revert(_pres: Presentation): void;
}
export type Shape3DPatch = {
    /** Clear all 3D (sp3d/scene3d). */
    clear?: boolean;
    extrusionH?: number;
    cameraPrst?: string;
    prstMaterial?: string;
};
export declare class SetShape3DCmd implements EditCommand {
    private slideIdx;
    private id;
    private patch;
    readonly label = "Shape 3D";
    private prev?;
    constructor(slideIdx: number, id: string, patch: Shape3DPatch);
    apply(pres: Presentation): void;
    revert(_pres: Presentation): void;
}
export declare class SetImageCropCmd implements EditCommand {
    private slideIdx;
    private id;
    private crop;
    readonly label = "Crop image";
    private prev?;
    private shapeRef?;
    constructor(slideIdx: number, id: string, crop: ImageShape["cropRect"] | null);
    apply(pres: Presentation): void;
    revert(_pres: Presentation): void;
}
/**
 * 裁剪窗口：外框和 srcRect 一起变，画面在幻灯片上的像素大小保持不动。
 * 图片和视频写 `cropRect`；图片填充写 `fill.srcRect`，并改成拉伸铺进窗口。
 */
export declare class SetCropFrameCmd implements EditCommand {
    private slideIdx;
    private id;
    private nextBbox;
    private nextCrop;
    readonly label = "Crop";
    private prevPos?;
    private prevCrop?;
    private prevFit?;
    constructor(slideIdx: number, id: string, nextBbox: Rect, nextCrop: CropInsets);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
/** 换掉图片字节，框不变。清掉旧裁剪和 SVG 回退，避免新图还套着上一张的切口。传入 icon 时改的是 Lucide 图标，保留矢量源和 descr。 */
export declare class ReplaceImageSrcCmd implements EditCommand {
    private slideIdx;
    private id;
    private src;
    private natural?;
    private icon?;
    readonly label: string;
    private prev?;
    constructor(slideIdx: number, id: string, src: string, natural?: {
        w: number;
        h: number;
    } | undefined, icon?: {
        svgSrc: string;
        descr: string;
    } | undefined);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class SetImageDescrCmd implements EditCommand {
    private slideIdx;
    private id;
    private descr;
    readonly label = "Image alt text";
    private prev?;
    private shapeRef?;
    constructor(slideIdx: number, id: string, descr: string);
    apply(pres: Presentation): void;
    revert(_pres: Presentation): void;
}
export type HyperlinkSlot = "click" | "hover";
/** Shape-level OOXML `a:hlinkClick` / `a:hlinkHover` (not run-level hyperlink). */
export declare class SetShapeHyperlinkCmd implements EditCommand {
    private slideIdx;
    private id;
    private next;
    private slot;
    readonly label: string;
    private prev?;
    private hadPrev;
    private shapeRef?;
    constructor(slideIdx: number, id: string, next: HyperlinkRef | undefined, slot?: HyperlinkSlot);
    apply(pres: Presentation): void;
    revert(_pres: Presentation): void;
}
export declare class SetChartDefCmd implements EditCommand {
    private slideIdx;
    private id;
    private next;
    readonly label = "Chart data";
    private prev?;
    private shapeRef?;
    constructor(slideIdx: number, id: string, next: ChartDef);
    apply(pres: Presentation): void;
    revert(_pres: Presentation): void;
}
export declare class SetSlideSizeCmd implements EditCommand {
    private next;
    readonly label = "Slide size";
    private prev?;
    constructor(next: SlideSize);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class SetSlideBackgroundCmd implements EditCommand {
    private slideIdx;
    private next;
    readonly label = "Background";
    private prev?;
    private prevBgRef?;
    constructor(slideIdx: number, next: Paint | undefined);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class SetBackgroundTargetCmd implements EditCommand {
    private target;
    private next;
    readonly label = "Background";
    private prev?;
    private prevBgRef?;
    private had;
    constructor(target: EditTarget, next: Paint | undefined);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class SetSlideShowCmd implements EditCommand {
    private slideIdx;
    private next;
    readonly label = "Hide slide";
    private prev?;
    constructor(slideIdx: number, next: boolean);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class SetSlideNotesCmd implements EditCommand {
    private slideIdx;
    private next;
    readonly label = "Edit notes";
    private prev?;
    constructor(slideIdx: number, next: string | undefined);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class SetSlideHfCmd implements EditCommand {
    private slideIdx;
    private next;
    readonly label = "Header / Footer";
    private prev?;
    constructor(slideIdx: number, next: HeaderFooter | undefined);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class SetShapeRotationCmd implements EditCommand {
    private slideIdx;
    private id;
    private next;
    readonly label = "Rotate";
    private prev?;
    constructor(slideIdx: number, id: string, next: number);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class SetShapeOpacityCmd implements EditCommand {
    private slideIdx;
    private id;
    private next;
    readonly label = "Opacity";
    private prev?;
    constructor(slideIdx: number, id: string, next: number);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class FlipShapeCmd implements EditCommand {
    private slideIdx;
    private id;
    private axis;
    readonly label = "Flip";
    private flipped;
    constructor(slideIdx: number, id: string, axis: "h" | "v");
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class SetShapeLockedCmd implements EditCommand {
    private slideIdx;
    private id;
    private locked;
    readonly label = "Lock";
    private prev?;
    constructor(slideIdx: number, id: string, locked: boolean);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class SetShapeVisibleCmd implements EditCommand {
    private slideIdx;
    private id;
    private visible;
    readonly label = "Visibility";
    private prev?;
    constructor(slideIdx: number, id: string, visible: boolean);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export type MediaTrimPatch = {
    start?: number;
    end?: number;
};
export type MediaPropsPatch = {
    autoplay?: boolean;
    loop?: boolean;
    muted?: boolean;
    volume?: number;
    trim?: MediaTrimPatch;
    poster?: string;
};
export declare class SetMediaPropsCmd implements EditCommand {
    private slideIdx;
    private id;
    private patch;
    readonly label = "Media properties";
    private prev;
    constructor(slideIdx: number, id: string, patch: MediaPropsPatch);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
/** Replace video/audio source bytes (clears trim/poster on replace). */
export declare class UpdateMediaSrcCmd implements EditCommand {
    private slideIdx;
    private id;
    private nextSrc;
    private nextDuration?;
    readonly label = "Replace media";
    private prev;
    constructor(slideIdx: number, id: string, nextSrc: string, nextDuration?: number | undefined);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class SetShapeBboxCmd implements EditCommand {
    private slideIdx;
    private id;
    private next;
    readonly label = "Position / Size";
    private snapshot?;
    constructor(slideIdx: number, id: string, next: Rect);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class GroupShapesCmd implements EditCommand {
    private slideIdx;
    private ids;
    readonly label = "Group";
    private snapshot?;
    constructor(slideIdx: number, ids: string[]);
    /** Id of the group created by the last successful apply. */
    get createdGroupId(): string | undefined;
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class UngroupShapesCmd implements EditCommand {
    private slideIdx;
    private id;
    readonly label = "Ungroup";
    private snapshot?;
    constructor(slideIdx: number, id: string);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export type AlignMode = "left" | "centerH" | "right" | "top" | "centerV" | "bottom";
export declare class AlignShapesCmd implements EditCommand {
    private slideIdx;
    private ids;
    private mode;
    readonly label = "Align";
    private deltas;
    constructor(slideIdx: number, ids: string[], mode: AlignMode);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class DistributeShapesCmd implements EditCommand {
    private slideIdx;
    private ids;
    private axis;
    readonly label = "Distribute";
    private deltas;
    constructor(slideIdx: number, ids: string[], axis: "h" | "v");
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class ReorderShapeCmd implements EditCommand {
    private slideIdx;
    private id;
    private direction;
    private target?;
    readonly label = "Reorder";
    private from?;
    constructor(slideIdx: number, id: string, direction: "front" | "back" | "forward" | "backward", target?: EditTarget | undefined);
    private reorderArr;
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class InsertTableRowCmd implements EditCommand {
    private slideIdx;
    private groupId;
    private afterRow;
    readonly label = "Insert Row";
    private snap?;
    constructor(slideIdx: number, groupId: string, afterRow: number);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class InsertTableColumnCmd implements EditCommand {
    private slideIdx;
    private groupId;
    private afterCol;
    readonly label = "Insert Column";
    private snap?;
    constructor(slideIdx: number, groupId: string, afterCol: number);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class RemoveTableRowCmd implements EditCommand {
    private slideIdx;
    private groupId;
    private rowIdx;
    readonly label = "Remove Row";
    private snap?;
    constructor(slideIdx: number, groupId: string, rowIdx: number);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class RemoveTableColumnCmd implements EditCommand {
    private slideIdx;
    private groupId;
    private colIdx;
    readonly label = "Remove Column";
    private snap?;
    constructor(slideIdx: number, groupId: string, colIdx: number);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export type TableCellStylePatch = {
    fill?: Paint | null;
    vAlign?: "top" | "middle" | "bottom";
    borders?: TableCellBorders | null;
    stroke?: Stroke | null;
};
/** Merge a rectangular cell range (inclusive, 0-based). Intersecting merges expand the range. */
export declare class MergeTableCellsCmd implements EditCommand {
    private slideIdx;
    private groupId;
    private startRow;
    private startCol;
    private endRow;
    private endCol;
    readonly label = "Merge Cells";
    private snap?;
    constructor(slideIdx: number, groupId: string, startRow: number, startCol: number, endRow: number, endCol: number);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
/** Split the merged region that contains (row, col). */
export declare class UnmergeTableCellsCmd implements EditCommand {
    private slideIdx;
    private groupId;
    private row;
    private col;
    readonly label = "Unmerge Cells";
    private snap?;
    constructor(slideIdx: number, groupId: string, row: number, col: number);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
/** Fill / vAlign / borders on one cell (hidden cells redirect to the merge owner). */
export declare class SetTableCellStyleCmd implements EditCommand {
    private slideIdx;
    private groupId;
    private row;
    private col;
    private patch;
    readonly label = "Cell style";
    private snap?;
    constructor(slideIdx: number, groupId: string, row: number, col: number, patch: TableCellStylePatch);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class SetSlideTransitionCmd implements EditCommand {
    private slideIdx;
    private next;
    private applyAll;
    readonly label = "Transition";
    private snapshot;
    private appliedTo;
    constructor(slideIdx: number, next: SlideTransition | undefined, applyAll?: boolean);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export {};
