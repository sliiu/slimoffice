import type { Paint } from "./paint";
import type { Shape, StyleRefColor } from "./shape";
import type { VbaProjectMeta } from "./vba-project";
import type { ViewGuides } from "./view-guides";
import type { Lecture } from "./lecture";
import type { ShowProperties } from "./show-properties";
import type { ooxml } from "@ppt/animation";

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
export function assignSlideBackground(
  host: { background?: Paint; bgRef?: BackgroundRef },
  next: Paint | undefined,
): void {
  host.background = next;
  delete host.bgRef;
}

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

// ECMA-376 §19.3.3 hf — 占位符可见性（日期/页脚/幻灯片号/页眉）。
export interface HeaderFooter {
  sldNum?: boolean;
  hdr?: boolean;
  ftr?: boolean;
  dt?: boolean;
}

// ECMA-376 §19.3.1.7 clrMap / §19.3.1.8 clrMapOvr —
// 把 OOXML 12 个槽位（bg1/tx1/.../folHlink）映射到主题颜色名。
export type ClrMap = Record<string, string>;

// ECMA-376 §19.3.1.36 sldLayoutIdLst / §19.3.1.41 sldMasterIdLst —
// slide 引用 layout，layout 引用 master。layoutRef 是 slide 在 deck 中
// 「我用哪一套版式」的弱引用：editor 改 master 时通过这个 ref 反查需要
// 重算 inheritance 的 slide；切换 layout 也基于此字段。
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
  // 弱引用 deck 级 Presentation.masters[].layouts[]。阶段 1 由 parser
  // 在解析 slide 时填上；阶段 2 改 master 时 editor 据此找受影响的 slide。
  layoutRef?: SlideLayoutRef;
  ooxmlTiming?: ooxml.OoxmlTiming;
  notes?: string;
  transition?: SlideTransition;
  builds?: BuildSpec[];
  initialParaOverrides?: InitialParaOverride[];
  initialCharOverrides?: InitialCharRangeOverride[];
  // ECMA-376 §19.3.1.37 sld 上的属性。
  show?: boolean;
  showMasterSp?: boolean;
  showMasterPhAnim?: boolean;
  hf?: HeaderFooter;
  clrMapOverride?: ClrMap;
  customData?: CustomData;
  // round-trip 保存信息：parser 通过非可枚举属性注入。serializer 在
  // pres.__source 存在时使用此字段定位原始 OOXML part 路径，做 surgical patch。
  // 编辑器代码不应读写此字段。
  __source?: SlideSource;
}

// round-trip 用，保存原始 pptx slide part 路径。
// 实际值通过 Object.defineProperty(..., { enumerable: false }) 注入，
// 不会被 JSON.stringify / structuredClone 误带出来。
export interface SlideSource {
  partPath: string;
  // 原始（未被 applyInheritance 合并 master/layout 占位符默认值的）main 层 shapes。
  // 阶段 2.1 起 parser 在解析时一并保存，editor 改 master/layout 后需要从这里
  // 重新跑 applyInheritance 得到最新合并结果（见 recomputeSlideInheritance）。
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

// ECMA-376 §19.5.50 p:transition@spd — fast/med/slow 三档对应的标准秒数。
// 这是 OOXML 规范的标定常量（不是项目内的启发式取值），parse 与 serialize 共用。
export const TRANSITION_SPEED_TO_SEC: Readonly<Record<"fast" | "med" | "slow", number>> = Object.freeze({
  fast: 0.5,
  med: 0.75,
  slow: 1.25,
});

// ECMA-376 §19.3.1.42 sldMaster — slide 母版。承载：
//   - 装饰 shape（Logo / accent / 底栏等非占位符元素）
//   - 占位符模板（title / body 默认 bbox / 字体 / 颜色）
//   - txStyles（titleStyle/bodyStyle/otherStyle）
//   - clrMap（12 个槽位 → 主题色名）
//   - background paint
//   - 一组 layout（每张 slide 选其一）
// 阶段 1 起 parser 真正填充本接口（含 layouts[]）；阶段 2 起 editor 可写。
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
  // 该 master 拥有的所有 layout。顺序与原 sldLayoutIdLst 一致。
  layouts?: SlideLayout[];
  // round-trip 保存原 part 路径，例如 "ppt/slideMasters/slideMaster1.xml"。
  __source?: SlideLikeSource;
}

// ECMA-376 §19.3.1.39 sldLayout — slide 版式。
// 与 master 共享形态（装饰 + 占位符模板 + background），但额外有 type 字段
// （title / titleOnly / blank / obj / chart / twoObj / pic / ...）。
export interface SlideLayout {
  id: string;
  name: string;
  // 版式类型：title/titleOnly/blank/obj/twoObj/...，参见 §19.7.15 ST_SlideLayoutType。
  type?: string;
  matchingName?: string;
  preserve?: boolean;
  background?: Paint;
  bgRef?: BackgroundRef;
  shapes: Shape[];
  hf?: HeaderFooter;
  // round-trip 保存原 part 路径，例如 "ppt/slideLayouts/slideLayout3.xml"。
  __source?: SlideLikeSource;
}

// 旧接口名保留：仅供少数列表展示场景使用；新代码统一用 SlideLayout。
export type SlideLayoutInfo = SlideLayout;

// master / layout / slide part 共用的 round-trip 源信息。
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

// ECMA-376 §19.2.1 presentation 根元素的全局属性。
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

// ECMA-376 §19.2.1.5 custShow / §19.2.1.4 custShowLst — 自定义放映集合。
export interface CustomShow {
  id: string;
  name: string;
  // 引用的 sld @r:id 顺序列表（parser / 导出用）。
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

// ECMA-376 §19.2.1.27 photoAlbum — 相册元数据。
export interface PhotoAlbum {
  bw?: boolean;
  showCaptions?: boolean;
  layout?: string;
  frame?: string;
}

// ECMA-376 §19.2.1.20 kinsoku — 中日韩首尾禁则字符。
export interface Kinsoku {
  lang?: string;
  invalStChars?: string;
  invalEndChars?: string;
}

// ECMA-376 §19.2.1.23 modifyVerifier — 修改保护信息。
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

// ECMA-376 §15.2.4 custData / §15.2.3 tagLst — 自定义数据/标签透传。
// 仅保留 key→value 映射；二进制 customXml 部件不展开。
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
  // round-trip 保存信息：parser 通过非可枚举属性注入。
  // 见 PresentationSource。
  __source?: PresentationSource;
}

// round-trip 用，保存解析时的原始 archive 字节，使 serializer 能做
// surgical patch 而非「从内存模型重建一份新 OOXML」。
// 重建路线必然丢失主版/版式/主题/动画/Chart/SmartArt/嵌入字体/扩展节点等大量 OOXML 信息，
// 因此凡是从 pptx 解析得到的 Presentation 都应携带此字段。
export interface PresentationSource {
  // 整份 PPTX 内每个 part 的字节（key 为归一化路径，例如 "ppt/slides/slide1.xml"）。
  files: Map<string, Uint8Array>;
  // 演示文稿主 part 路径，例如 "ppt/presentation.xml"。
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

// ECMA-376 §19.3.1.49 txStyles / 21.1.2.1.5 lstStyle — 标题/正文/其它文本样式。
export interface LevelStyleSpec {
  pPr?: TextParagraphDefaults;
  rPr?: TextRunDefaults;
  bullet?: import("./shape").BulletDef;
}

export interface TextStyles {
  title?: LevelStyleSpec[];
  body?: LevelStyleSpec[];
  other?: LevelStyleSpec[];
}

// 段落/文本默认（与 TextParagraph/TextRun 共享字段，独立类型避免循环依赖）。
export type TextParagraphDefaults = Partial<
  Pick<
    import("./shape").TextParagraph,
    | "align"
    | "lineHeight"
    | "lineHeightPx"
    | "spaceBeforePx"
    | "spaceAfterPx"
    | "indent"
    | "marginLeft"
    | "marginRight"
    | "level"
    | "rtl"
    | "fontAlign"
    | "defTabSz"
    | "tabStops"
  >
>;

export type TextRunDefaults = Partial<import("./shape").TextRun>;
