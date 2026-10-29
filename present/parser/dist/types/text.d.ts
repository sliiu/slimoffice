import type { ExplicitRPrSnapshot, HyperlinkRef, TextAutoFit, TextInsets, TextLevelStyle, TextOverflow, TextParagraph, TextRun, TextShape, TextVert, TextVertOverflow } from "@sliiu/present-core";
export type { ExplicitRPrSnapshot } from "@sliiu/present-core";
import { type Sp3DInfo } from "./shape-3d.js";
import { type XmlNode } from "./xml.js";
import { type ThemeData } from "./theme.js";
import type { RelMap } from "./parts.js";
export interface BodyPrInfo {
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
    prstTxWarp?: TextShape["prstTxWarp"];
    body3D?: Sp3DInfo;
}
export declare function parseBodyPr(bodyPr: XmlNode | undefined): BodyPrInfo;
export interface TextCtx {
    theme?: ThemeData;
    defaultFontFamily?: string;
    rels?: RelMap;
    resolveImage?: (relPath: string) => string | undefined;
    /**
     * slide part 路径（如 `ppt/slides/slide4.xml`）→ 1-based 页码。
     * ECMA-376 §19.2.2.3 的 `ppaction://hlinksldjump` 内部跳页链接把目标页写成一条
     * `.../relationships/slide` 关系，必须靠 deck 的 sldIdLst 顺序才能换算成页码。
     * parse.ts 在解析 slides 前建好这张表注入；master/layout 等无 deck 上下文的
     * 场景不注入，此时跳页链接退化保留原始 r:id（序列化侧会跳过，不会写出坏外链）。
     */
    resolveSlideNumber?: (partPath: string) => number | undefined;
    embeddedFontFamilies?: string[];
}
export declare function parseBodyPrFull(bodyPr: XmlNode | undefined, theme: ThemeData | undefined): BodyPrInfo;
type Script = "latin" | "ea" | "cs" | "neutral";
export declare function splitTextByScript(text: string): Array<{
    text: string;
    script: Script;
}>;
export declare function parseTxBody(txBody: XmlNode | undefined, ctx: TextCtx): TextParagraph[];
export declare function parseLstStyle(txBody: XmlNode | undefined, ctx: TextCtx): TextLevelStyle[] | undefined;
export declare function parsePPrDefaults(pPr: XmlNode | undefined, ctx: TextCtx): Partial<TextParagraph>;
/**
 * 从 raw `<a:rPr>` 上抠出"显式存在"的字段，作为 round-trip 的 snapshot。
 * 与 readRunProps 区别：
 *   - 不读 ctx 继承（master / layout 默认）
 *   - 缺省的字段在 snapshot 里就是 undefined（区别于 readRunProps 把继承值塞进来）
 * 返回 undefined 表示 rPr 缺失或完全没有任何显式字段。
 */
/**
 * 把源 run 上的 origin（含 explicitRPr）拷到目标 run，用于继承 / fontRef 合并等 spread 场景，
 * 这些路径会丢失非可枚举的 __origin 字段。
 */
export declare function preserveRPrSnapshot<T extends object>(target: T, source: unknown): T;
export declare function explicitRPrFromRaw(rPr: XmlNode | undefined): ExplicitRPrSnapshot | undefined;
export declare function readRunProps(rPr: XmlNode | undefined, ctx: TextCtx): Partial<TextRun>;
/**
 * 把 hlink 视觉覆盖（若有）合并进 explicitRPr 快照，使「未编辑的超链接 run」满足
 * `内存值 == 快照` → serializer 保留原始字节。color 归一为快照口径（#rrggbb 小写）。
 */
export declare function mergeHlinkOverrideIntoSnapshot(snap: ExplicitRPrSnapshotLocal | undefined, props: Partial<TextRun>): ExplicitRPrSnapshotLocal | undefined;
/**
 * 把解析出的超链接记进快照。与 color / underline 覆盖同理：raw rPr 上确实写了
 * `<a:hlinkClick>` 时，内存 run 的 hyperlink 是"解析所得"而非"用户所加"，
 * serializer 必须能识别出未编辑，从而保留原始 r:id 字节。
 */
export declare function mergeHyperlinkIntoSnapshot(snap: ExplicitRPrSnapshotLocal | undefined, props: Partial<TextRun>): ExplicitRPrSnapshotLocal | undefined;
type ExplicitRPrSnapshotLocal = import("@sliiu/present-core").ExplicitRPrSnapshot;
/** ECMA-376 CT_Hyperlink：shape / run 的 hlinkClick、hlinkHover、hlinkMouseOver。 */
export declare function parseHlinkNode(node: XmlNode | undefined, ctx: TextCtx): HyperlinkRef | undefined;
/** `<a:hlinkClick r:id>` → 目标 slide 的 1-based 页码字符串（player / 编辑器对话框约定）。 */
export declare function resolveSlideJumpTarget(rid: string | undefined, ctx: TextCtx): string | undefined;
export declare function mapAction(action: string): HyperlinkRef["kind"] | null;
