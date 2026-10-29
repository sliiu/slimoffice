import type { Paint } from "./paint.js";
import type { Shape, StyleRefColor } from "./shape.js";
import type { VbaProjectMeta } from "./vba-project.js";
import type { ViewGuides } from "./view-guides.js";
import type { Lecture } from "./lecture.js";
import type { ShowProperties } from "./show-properties.js";
import type { ooxml } from "@sliiu/present-animation";
export interface SlideSize {
    width: number;
    height: number;
}
export interface Layer {
    id: string;
    name: string;
    visible: boolean;
    locked: boolean;
    shapes: Shape[];
}
/** ECMA-376 §20.1.4.2.3 `<p:bgRef>`：背景走主题 fillStyleLst / bgFillStyleLst。 */
export interface BackgroundRef {
    idx: number;
    color?: StyleRefColor;
}
/**
 * 改背景 paint 时断开主题 bgRef，否则 from-scratch 仍会写出旧的 `<p:bgRef>`。
 */
export declare function assignSlideBackground(host: {
    background?: Paint;
    bgRef?: BackgroundRef;
}, next: Paint | undefined): void;
export interface InitialParaOverride {
    shapeId: string;
    paraIdx: number;
    opacity?: number;
    visible?: boolean;
}
export interface InitialCharRangeOverride {
    shapeId: string;
    paraIdx: number;
    unit: "char" | "word";
    start: number;
    end: number;
    opacity?: number;
    visible?: boolean;
}
export interface BuildSpec {
    kind: "para" | "diagram" | "chart" | "graphic" | "ole";
    shapeId: string;
    grpId?: number;
    build?: string;
    bldLvl?: number;
    animBg?: boolean;
    autoUpdateAnimBg?: boolean;
    rev?: boolean;
    uiExpand?: boolean;
}
export interface HeaderFooter {
    sldNum?: boolean;
    hdr?: boolean;
    ftr?: boolean;
    dt?: boolean;
}
export type ClrMap = Record<string, string>;
export interface SlideLayoutRef {
    masterId: string;
    layoutId: string;
}
export interface Slide {
    id: string;
    name: string;
    index: number;
    background?: Paint;
    /**
     * 该 part 自己的 `<p:bgRef>`。仅当 XML 里写了 bgRef 时存在；
     * 从 master/layout 继承来的 `background` 不要抄这份引用到 slide 上。
     */
    bgRef?: BackgroundRef;
    layers: Layer[];
    layoutRef?: SlideLayoutRef;
    ooxmlTiming?: ooxml.OoxmlTiming;
    notes?: string;
    transition?: SlideTransition;
    builds?: BuildSpec[];
    initialParaOverrides?: InitialParaOverride[];
    initialCharOverrides?: InitialCharRangeOverride[];
    show?: boolean;
    showMasterSp?: boolean;
    showMasterPhAnim?: boolean;
    hf?: HeaderFooter;
    clrMapOverride?: ClrMap;
    customData?: CustomData;
    __source?: SlideSource;
}
export interface SlideSource {
    partPath: string;
    rawMainShapes?: Shape[];
    /**
     * 解析时 `slide.background`（含从 layout/master 继承下来的兜底值）的深拷贝快照。
     * round-trip 保存时用 JSON 比较：未变化则保留原始 `<p:bg>` 字节（包括"原本没 `<p:bg>` →
     * 保持没"的继承场景），变化了才把内存里的 background 重新序列化写入 slide part。
     * 这是 AI 改主题（ApplyCustomThemeCmd 改 slide.background）能被保存看到的核心字段。
     */
    bgSnapshot?: Paint;
    /**
     * 解析时 `slide.ooxmlTiming` 的 JSON 快照（`JSON.stringify(ooxmlTiming ?? null)`）。
     * round-trip 保存时与当前内存 timing 比较：相等 → 原 `<p:timing>` 字节级保留；
     * 不等（编辑器动画面板改过）→ 用 serializeTiming 重写 `<p:timing>` 节点。
     * 快照缺失（缓存恢复且 rebuildOriginsFromSource 失败）时保守保留原字节。
     */
    timingSnapshot?: string;
    /** 同 timingSnapshot，对应 `slide.transition` / `<p:transition>`。 */
    transitionSnapshot?: string;
    /** 解析时 `slide.notes ?? ""` 的快照，round-trip 判断备注是否被编辑。 */
    notesSnapshot?: string;
    /** 解析时 `slide.show` 快照，round-trip 判断隐藏幻灯片是否被编辑。 */
    showSnapshot?: boolean;
    /** 该 slide 关联的 notesSlide part 路径（如 "ppt/notesSlides/notesSlide3.xml"），无备注部件时缺省。 */
    notesPartPath?: string;
    /** 解析时 `slide.customData?.tags` JSON 快照，round-trip 判断标签是否被编辑。 */
    customDataSnapshot?: string;
    /** 解析时该 slide 批注列表 JSON 快照，round-trip 判断是否被编辑。 */
    commentsSnapshot?: string;
    /** 该 slide 关联的 comments part 路径（如 "ppt/comments/comment3.xml"）。 */
    commentsPartPath?: string;
    /** slide 批注部件为 Office 2021+ modern 格式。 */
    commentsModern?: boolean;
}
export interface SlideTransition {
    kind: string;
    duration: number;
    params?: Record<string, unknown>;
}
export declare const TRANSITION_SPEED_TO_SEC: Readonly<Record<"fast" | "med" | "slow", number>>;
export interface SlideMaster {
    id: string;
    name: string;
    background?: Paint;
    bgRef?: BackgroundRef;
    shapes: Shape[];
    clrMap?: ClrMap;
    hf?: HeaderFooter;
    preserve?: boolean;
    txStyles?: TextStyles;
    layouts?: SlideLayout[];
    __source?: SlideLikeSource;
}
export interface SlideLayout {
    id: string;
    name: string;
    type?: string;
    matchingName?: string;
    preserve?: boolean;
    background?: Paint;
    bgRef?: BackgroundRef;
    shapes: Shape[];
    hf?: HeaderFooter;
    __source?: SlideLikeSource;
}
export type SlideLayoutInfo = SlideLayout;
export interface SlideLikeSource {
    partPath: string;
    /**
     * 解析时该 part 的 `background` 深拷贝快照。round-trip 用于 idempotent
     * 比较：未变化则保留原始 `<p:bg>` 字节，变化则重写。
     */
    bgSnapshot?: Paint;
}
export interface ThemeFonts {
    major?: string;
    minor?: string;
}
export interface ThemeColors {
    [name: string]: string;
}
export interface Theme {
    id: string;
    name: string;
    colors?: ThemeColors;
    fonts?: ThemeFonts;
}
export interface EmbeddedFont {
    family: string;
    weight: number;
    style: "normal" | "italic";
    src: string;
    format?: "embedded-opentype" | "truetype" | "opentype" | "woff" | "woff2";
}
export interface AssetEntry {
    id: string;
    kind: "image" | "font" | "media";
    src: string;
    mime?: string;
    bytes?: ArrayBuffer;
}
export interface PresentationOptions {
    serverZoom?: number;
    firstSlideNum?: number;
    showSpecialPlsOnTitleSld?: boolean;
    rtl?: boolean;
    removePersonalInfoOnSave?: boolean;
    compatMode?: boolean;
    strictFirstAndLastChars?: boolean;
    embedTrueTypeFonts?: boolean;
    saveSubsetFonts?: boolean;
    autoCompressPictures?: boolean;
    bookmarkIdSeed?: number;
    conformance?: string;
}
export interface CustomShow {
    id: string;
    name: string;
    slideRIds: string[];
    /** 编辑器内按 slide 下标维护的顺序；导出时解析为 slideRIds。 */
    slideIndices?: number[];
}
/** 幻灯片审阅批注（Review → Comments）。 */
export interface DeckComment {
    id: string;
    slideIndex: number;
    author: string;
    text: string;
    createdAt: number;
    /** 舞台锚点（可选）。点在空白处时只有坐标。 */
    x?: number;
    y?: number;
    /** 点在某个形状上新建时，那个形状的 id。坐标仍是落点。 */
    shapeId?: string;
    /** 回复的父批注 id（仅面板线程；classic OOXML 无此字段）。 */
    parentId?: string;
    resolved?: boolean;
    /** Office 2021+ modern comment GUID（round-trip 保留）。 */
    modernId?: string;
}
export interface PhotoAlbum {
    bw?: boolean;
    showCaptions?: boolean;
    layout?: string;
    frame?: string;
}
export interface Kinsoku {
    lang?: string;
    invalStChars?: string;
    invalEndChars?: string;
}
export interface ModifyVerifier {
    algorithmName?: string;
    hashValue?: string;
    saltValue?: string;
    spinValue?: number;
    /** Modern OOXML (Office 2013+ password verifier). */
    hashData?: string;
    saltData?: string;
    spinCount?: number;
    cryptProviderType?: string;
    cryptAlgorithmClass?: string;
    cryptAlgorithmType?: string;
    cryptAlgorithmSid?: number;
}
export interface CustomData {
    tags?: Record<string, string>;
    customXmlRefs?: string[];
}
/** PowerPoint-style slide section (deck-level grouping for the slide sorter). */
export interface DeckSection {
    id: string;
    name: string;
    /** 0-based slide index where this section begins. */
    startIndex: number;
}
export interface Presentation {
    id: string;
    size: SlideSize;
    notesSize?: SlideSize;
    slides: Slide[];
    masters?: SlideMaster[];
    notesMasters?: SlideMaster[];
    handoutMasters?: SlideMaster[];
    theme?: Theme;
    assets?: AssetEntry[];
    fonts?: EmbeddedFont[];
    options?: PresentationOptions;
    defaultTextStyle?: TextStyles;
    customShows?: CustomShow[];
    /** 审阅批注（Review → Comments）。 */
    comments?: DeckComment[];
    /** Slide sections for sorter / navigation (editor-maintained). */
    sections?: DeckSection[];
    photoAlbum?: PhotoAlbum;
    /** Parsed VBA project metadata when `ppt/vbaProject.bin` is present (macros never executed). */
    vbaProject?: VbaProjectMeta;
    kinsoku?: Kinsoku;
    modifyVerifier?: ModifyVerifier;
    customData?: CustomData;
    /** ECMA-376 `ppt/viewProps.xml` 幻灯片视图参考线 / 网格。 */
    viewGuides?: ViewGuides;
    /** ECMA-376 `ppt/presProps.xml` `showPr` 放映方式。 */
    showPr?: ShowProperties;
    /**
     * 录制放映留下的讲解：每页停留、讲解点击、出镜引用。
     * 摄像头字节不在这份 JSON 里。导出 pptx 不写这个字段。
     */
    lecture?: Lecture;
    meta?: Record<string, unknown>;
    __source?: PresentationSource;
}
export interface PresentationSource {
    files: Map<string, Uint8Array>;
    presentationPath: string;
    /**
     * 解析时 `pres.theme` 的深拷贝快照。round-trip 用于 idempotent 比较：
     * 当 AI 通过 `ApplyCustomThemeCmd` 改了 `pres.theme.colors / fonts` 后，与快照不一致
     * 触发 `ppt/theme/themeN.xml` 的 `<a:clrScheme>` / `<a:fontScheme>` 重写。
     * 未变化则原 theme XML 字节级保留。
     */
    themeSnapshot?: Theme;
    /** commentAuthors part 路径（如 ppt/commentAuthors.xml）。 */
    commentAuthorsPartPath?: string;
    /** Office 2021+ modern authors part（ppt/authors/authorN.xml）。 */
    modernAuthorsPartPath?: string;
    /** 解析时检测到 modern comment 部件（p188 命名空间）。 */
    commentsModern?: boolean;
    /** 解析时全 deck 批注 JSON 快照。 */
    commentsSnapshot?: string;
    /** SlimPPT tags 侧车：resolved / parentId 元数据快照。 */
    commentMetaSnapshot?: string;
    /** SlimPPT tags 侧车：演示文稿保护元数据快照。 */
    protectionMetaSnapshot?: string;
    /** SlimPPT tags 侧车：已启用编辑插件 id 列表快照。 */
    editorPluginsMetaSnapshot?: string;
    /** SlimPPT tags 侧车：放映插件 id 列表快照。 */
    playbackPluginsMetaSnapshot?: string;
    /** SlimPPT tags 侧车：幻灯片节列表快照。 */
    sectionsMetaSnapshot?: string;
    /** SlimPPT tags 侧车：校对语言 id 快照。 */
    proofingLangMetaSnapshot?: string;
    /** presentation tags part 路径（如 ppt/tags/tag1.xml）。 */
    tagsPartPath?: string;
    /** 原 archive 含 `ppt/vbaProject.bin`（macro-enabled deck）。round-trip 透传，不执行 VBA。 */
    macroEnabled?: boolean;
    /** VBA project part 路径（通常为 ppt/vbaProject.bin）。 */
    vbaProjectPartPath?: string;
    /** 解析时 `pres.fonts` 快照；round-trip 比较后决定是否重写 embeddedFontLst。 */
    fontsSnapshot?: string;
    /** 解析时 `pres.photoAlbum` 快照；round-trip 比较后决定是否 patch `<p:photoAlbum>`。 */
    photoAlbumSnapshot?: string;
    /** 解析时 `pres.kinsoku` 快照；round-trip 比较后决定是否 patch `<p:kinsoku>`。 */
    kinsokuSnapshot?: string;
    /** 解析时 `pres.viewGuides` 快照；round-trip 比较后决定是否 patch `viewProps.xml`。 */
    viewGuidesSnapshot?: string;
    /** presentation 的 viewProps part 路径（如 ppt/viewProps.xml）。 */
    viewPropsPartPath?: string;
    /** 解析时 `pres.showPr` 快照；round-trip 比较后决定是否 patch `presProps.xml`。 */
    showPrSnapshot?: string;
    /** presentation 的 presProps part 路径（如 ppt/presProps.xml）。 */
    presPropsPartPath?: string;
}
export interface LevelStyleSpec {
    pPr?: TextParagraphDefaults;
    rPr?: TextRunDefaults;
    bullet?: import("./shape.js").BulletDef;
}
export interface TextStyles {
    title?: LevelStyleSpec[];
    body?: LevelStyleSpec[];
    other?: LevelStyleSpec[];
}
export type TextParagraphDefaults = Partial<Pick<import("./shape.js").TextParagraph, "align" | "lineHeight" | "lineHeightPx" | "spaceBeforePx" | "spaceAfterPx" | "indent" | "marginLeft" | "marginRight" | "level" | "rtl" | "fontAlign" | "defTabSz" | "tabStops">>;
export type TextRunDefaults = Partial<import("./shape.js").TextRun>;
