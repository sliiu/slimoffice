import type { BulletDef, ChartDef, ClrMap, HeaderFooter, HyperlinkRef, LevelStyleSpec, Paint, Shape, Slide, Stroke, BackgroundRef, TextParagraph, TextStyles } from "@sliiu/present-core";
import type { MediaRegistrar } from "./media-table.js";
import type { OleEmbeddingRegistrar } from "./embedding-table.js";
import { type DiagramRelIds } from "./pptx-smartart.js";
import { type InkRel } from "./pptx-ink.js";
import type { MediaTimingHint } from "./pptx-timing.js";
/**
 * `ShapeCtx` 的 `slideSize` 字段是为了解决 WPS Office / macOS QuickLook 的渲染怪癖：
 * 当一个 `<p:sp>` 的 `<a:xfrm>` 起点为 (0,0) **且** `<a:ext>` 完全等于 slide 尺寸时，
 * 这两个 renderer 会把它当作"重复的背景层"静默丢弃。典型症状：
 *   - 用户在图片背景上叠了一层 #000 半透明矩形作压暗 overlay → 预览正常但
 *     在 WPS 打开后 overlay 消失，标题对比度退化到不可读。
 * 我们在 `xfrm()` 里检测这个 pattern 并把 offset 平移 1 EMU（≈0.0001px，肉眼
 * 完全感知不到）来绕过启发式。
 */
export type ShapeCtx = {
    media: MediaRegistrar;
    spIdCounter: {
        next: number;
    };
    /** shape.id → 本次写出的 cNvPr@id。由 assignSpIds 预填，allocSpId 查找。 */
    spIdByShapeId?: Map<string, number>;
    usedSpIds?: Set<number>;
    slideSize?: {
        width: number;
        height: number;
    };
    /**
     * 祖先 group 链上累积的 opacity（默认 1）。OOXML 没有 group / shape 级
     * opacity 字段，渲染器靠 `<g opacity>` 模拟；持久化时必须把这部分乘到每个叶子
     * shape 的 fill / stroke / image alpha 上，否则保存后 group 半透明效果全丢。
     * 由 `groupToXml` 在下钻 children 时累计：`child.ctx.parentOpacity = parent * group.opacity`。
     */
    parentOpacity?: number;
    /**
     * 因 entrance 动画而在运行时被压成 `opacity=0` 的整 shape（parser timing pass /
     * `applyInitialEntranceState` 产物）。这是"入场前隐藏"的 runtime 状态，不是用户
     * 设置的透明度；烘焙进 fill / stroke / blip alpha 会让 shape 在保存后整片消失。
     * 由 slide 渲染路径按 `computeInitialEntranceState(slide).hiddenShapes` 注入，
     * `effectiveOpacity` 对命中的 shape 按 1 处理（round-trip 路径靠 `__opacitySnapshot`
     * 做同样的区分）。
     */
    entranceHidden?: ReadonlySet<Shape>;
    /**
     * chart 部件注册器（from-scratch slide 渲染路径注入）。ChartShape 序列化时
     * 调 register 拿 relId → 输出 `<p:graphicFrame>` 引用真正的 c:chart 部件；
     * 返回 null（不支持的图表类型）或未注入（master/layout/round-trip
     * patch 上下文）时回退 rect 占位。
     */
    charts?: {
        register(def: ChartDef): {
            relId: string;
            chartEx: boolean;
        } | null;
    };
    /**
     * 外部超链接注册器（from-scratch slide 渲染路径注入）。shape / run 级
     * `hyperlink: { kind: "url" }` 序列化时调 register 拿 relId → 输出
     * `<a:hlinkClick r:id>`，rels 里补 TargetMode="External" 的 hyperlink 关系。
     * 未注入（master/layout/round-trip 新增 shape）时 URL 链接跳过不写，
     * 避免悬空 r:id 让 PowerPoint 报修复；action 型跳转（next/prev/…）不需要
     * 关系，任何上下文都照常输出。
     *
     * `registerSlide(n)` 处理「跳到第 n 页」：注册一条 internal 的 slide 关系并返回
     * relId，页码越界时返回 undefined。
     */
    links?: {
        register(url: string): string;
        registerSlide?(slideNumber: number): string | undefined;
    };
    /** OLE embedding 注册器（from-scratch slide 渲染路径注入）。 */
    embeddings?: OleEmbeddingRegistrar;
    /**
     * SmartArt diagram 部件注册器。带 `smartArtMeta` 的 group 序列化成
     * `<p:graphicFrame>` + `dgm:relIds`；未注入时回退普通 grpSp。
     */
    diagrams?: {
        register(group: Extract<Shape, {
            kind: "group";
        }>): DiagramRelIds | null;
    };
    /** Draw / Office 墨迹：path + ink 写出 `p:contentPart` + InkML。 */
    inks?: {
        register(shape: Extract<Shape, {
            kind: "path";
        }>): InkRel | null;
    };
    /**
     * 插入的视频 / 音频：写出 pic 时记下 cNvPr@id，供 slide `<p:timing>` 生成
     * `p:video` / `p:audio`（Office 单击播放 / 自动播放靠这棵时序树）。
     */
    mediaTimings?: MediaTimingHint[];
};
/** 预分配 slide 上所有 shape 的 cNvPr@id，让连接符 stCxn 能指向稳定目标。 */
export declare function assignSpIds(shapes: Shape[], ctx: ShapeCtx): void;
export declare function allocSpId(s: Shape, ctx: ShapeCtx): number;
export declare function shapeToXml(s: Shape, ctx: ShapeCtx): string;
/**
 * HyperlinkRef → `<a:hlinkClick>` / `<a:hlinkHover>`。
 * - `kind: "url"`：需要 ctx.links 注册 External 关系拿 r:id；无注册器时跳过
 *   （写悬空 r:id 会让 PowerPoint 报"需要修复"）。仅有 `<a:snd>` 时仍写出空 r:id。
 * - 放映跳转类（next/prev/…）：纯 action URI，r:id 留空，任何上下文都可写。
 * - `kind: "slide"`（跳到指定页）：target 是 1-based 页码，需要 ctx.links 注册一条
 *   internal 的 `.../relationships/slide` 关系；注册器缺失或页码非法时跳过。
 *   **不能**退化成 External URL —— 那会写出指向 `ppt/slides/slideN.xml` 的死链。
 * - `kind: "sound"`：动作设置「只播放声音」，`ppaction://noaction` + `<a:snd>`。
 */
export declare function hlinkTagXml(h: HyperlinkRef, tagName: "a:hlinkClick" | "a:hlinkHover", ctx?: ShapeCtx): string;
/** ECMA-376 §20.1.2.2.18 graphicFrameLocks。无 IR 时默认 noGrp（Office 表格/图表惯例）。 */
export declare function graphicFrameLocksXml(s: Shape): string;
export declare function nvPrXml(s: Shape, ctx?: ShapeCtx, inner?: string): string;
/**
 * OOXML `prst="line"` 从 xfrm 矩形左上画到右下；真正的端点方向靠 flipH/flipV。
 * 编辑器 LineShape 用 (x1,y1,x2,y2) 画线，bbox 只是拖拽包框（常是一个大矩形），
 * 若按 bbox 写 xfrm，WPS / PowerPoint 会把水平线画成对角线。
 */
export declare function lineXfrmFromEndpoints(x1: number, y1: number, x2: number, y2: number, transform?: {
    rotation?: number;
    scaleX?: number;
    scaleY?: number;
}): {
    x: number;
    y: number;
    w: number;
    h: number;
    rot: number;
    flipH: boolean;
    flipV: boolean;
};
/**
 * 把 Paint 转成 OOXML `<a:*Fill>` 子树。
 *
 * 支持的 Paint kind（ECMA-376 §20.1.8）：
 *   - solid     → `<a:solidFill>`
 *   - linear    → `<a:gradFill>...<a:lin/>`
 *   - radial    → `<a:gradFill>...<a:path>`
 *   - pattern   → `<a:pattFill>`
 *   - image     → `<a:blipFill>...`  （需要 mediaCtx 注册图片关系，缺则降级为 noFill）
 *   - none      → `<a:noFill/>`
 *   - groupFill → `<a:grpFill/>`
 *
 * `mediaCtx` 是可选的：shape fill 默认不会注入图片填充（避免静默丢失 media 关系），
 * 但 `<p:bg>` / `<p:bgPr>` 调用方传入它就能拿到 image background。
 *
 * `dest` 是填充目标的宽高（px）：slide background 传 slide 尺寸、shape fill 传 bbox。
 * 有它才能把 ImagePaint 的 cover/contain 语义换算成 OOXML 的 srcRect / fillRect
 * （OOXML 只有 stretch，没有等比语义）—— 不传则退化为纯 stretch（旧行为）。
 */
export declare function fillToXml(p: Paint | undefined, mediaCtx?: {
    media: MediaRegistrar;
}, dest?: {
    w: number;
    h: number;
}): string;
/**
 * `<p:bg><p:bgPr>` 序列化。和 shape fill 复用 fillToXml，并强制带 mediaCtx
 * 以支持 ImagePaint background（enrichment pass 写入的图片背景）。
 *
 * 返回完整的 `<p:bg>...</p:bg>` 片段；当 paint 为空字符串时（即未知 kind）
 * 退回到 `<a:solidFill val="FFFFFF"/>` 以保证 OOXML schema 合法（bgPr 必须至少有一个 fill 子元素）。
 */
export declare function backgroundToXml(bg: Paint | undefined, ctx: {
    media: MediaRegistrar;
}, slideSize?: {
    width: number;
    height: number;
}, bgRef?: BackgroundRef): string;
export declare function setActiveSchemeColors(colors: Record<string, string> | undefined): void;
/** hex（大写、无 #）命中当前主题色板时返回 scheme 槽位名，否则 undefined。 */
export declare function schemeSlotForHex(hexUpper: string): string | undefined;
export declare function strokeToXml(stroke: Stroke | undefined, tag?: string): string;
/** 竖排堆叠（与 renderer wrapGlyphsIntoColumns / 列方向一致）。 */
export declare function isStackedTextVert(vert: Extract<Shape, {
    kind: "text";
}>["vert"] | undefined): boolean;
/**
 * playground 竖排堆叠始终按 bbox 高度折列。
 * WPS「行顺序从右到左」对应 OOXML `vert="wordArtVertRtl"`（不是单独的 rtlCol；
 * 在 wordArtVert 上加 rtlCol 列仍从左边开始）。
 */
export declare function stackedBodyPrExport(host: {
    vert?: Extract<Shape, {
        kind: "text";
    }>["vert"];
    wrap?: boolean;
    rtlCol?: boolean;
}): {
    vert: NonNullable<Extract<Shape, {
        kind: "text";
    }>["vert"]> | undefined;
    wrap: "none" | "square" | undefined;
    rtlCol: "1" | undefined;
};
export declare function autoFitXml(af: Extract<Shape, {
    kind: "text";
}>["autoFit"]): string;
/** notesMaster `<p:notesStyle>`：有 txStyles.body 就按级写出，否则 Office 默认 12pt。 */
export declare function notesStyleToXml(body: LevelStyleSpec[] | undefined, media?: MediaRegistrar): string;
/**
 * presentation.xml `<p:defaultTextStyle>`。
 * IR 布局与 parser 对偶：body[0]=defPPr，body[1]=lvl1pPr … body[9]=lvl9pPr。
 * 与 sldMaster txStyles 不同（那边 index 0 就是 lvl1，没有 defPPr）。
 * 无有效级时返回 null，调用方回退 18pt 硬编码。
 */
export declare function defaultTextStyleToXml(styles: TextStyles | undefined, lang: string, media?: MediaRegistrar): string | null;
/** sldMaster `<p:txStyles>`：titleStyle / bodyStyle / otherStyle。全空则写空壳，避免 Office 当成无样式。 */
export declare function txStylesToXml(styles: TextStyles | undefined, media?: MediaRegistrar): string;
export declare function prstTxWarpXml(warp: Extract<Shape, {
    kind: "text";
}>["prstTxWarp"]): string;
/** 表格单元格 `<a:txBody>`（DrawingML table 用，非 `p:txBody`）。 */
export declare function aTxBodyToXml(paragraphs: TextParagraph[], host: Extract<Shape, {
    kind: "text";
}>, ctx?: ShapeCtx): string;
/** pPr 子节点：间距 → bullet → 制表位。round-trip 新增段落复用。 */
export declare function paragraphPPrInnerXml(p: TextParagraph, ctx?: ShapeCtx): string;
export declare function bulletXml(bu: BulletDef | undefined, ctx?: ShapeCtx): string;
/** ECMA-376 §19.3.3 / Microsoft CT_Slide `p:hf`（页眉页脚占位符可见性）。 */
export declare function hfToXml(hf: HeaderFooter | undefined): string;
/** ECMA-376 §19.3.1.37 `p:sld` 根属性（隐藏页 / 母版图形 / 母版占位符动画）。 */
export declare function sldRootAttrXml(slide: Slide): string;
/** `<p:cSld name>`：默认 "Slide N" 不写，避免污染 Office 侧栏。 */
export declare function cSldNameAttr(slide: Slide): string;
/** ECMA-376 §19.3.1.8 `p:clrMapOvr`。无覆盖时沿用 master。 */
export declare function clrMapOvrXml(map: ClrMap | undefined): string;
