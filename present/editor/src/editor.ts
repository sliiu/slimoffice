import {
  CommandStack,
  applyInitialEntranceState,
  computeInitialEntranceState,
  getPresentationProtection,
  isPresentationEditingBlocked,
  canApplyEditCommand,
  EditingBlockedError,
  isEditingBlockedError,
  presentationHasVbaProject,
  resolveFieldText,
  summarizeOfficeModifyVerifier,
  translatePathD,
  type EditCommand,
  type Paint,
  type Presentation,
  type Rect,
  createSlideFromMaster,
  type Shape,
  type Slide,
  type SlideTransition,
  type StrokeDashPreset,
  type MediaLibraryAdapter,
  viewGuidesSnapshot,
  showPropertiesToUi,
  applyUiToShowProperties,
  showPropertiesSnapshot,
} from "@ppt/core";
import {
  HybridBackend,
  SvgBackend,
  CanvasBackend,
  createScene,
  applyEntranceHideToScene,
  mountMorphTransitionLayers,
  stageChromeBackground,
  type Scene,
} from "@ppt/renderer";
import { createBake3DRuntime, runStageTransition, type Bake3DRuntime } from "@ppt/player";
import { combinedReadRatio, mediaKindOf } from "./file-kind";
import { hideFileProgress, readAsDataURL, setFileProgress, showFileProgress } from "./file-progress";

type AnyBackend = { destroy: () => void; flush: () => void };
import { BACKGROUND_SEL_ID, Selection, findParentGroup, findShape, findShapeAncestors, findTopLevelId, syntheticTextBoxGroupId } from "./selection";
import {
  applyPathConnectorEnds,
  cxnEndFor,
  isPathConnector,
  pathConnectorGeomEnds,
  pathConnectorWorldEnds,
  snapCxnSite,
  followGlueToSites,
  reattachConnectorGlue,
} from "./connector-glue";
import {
  applyNodeTransform,
  composeSvgTransforms,
  inverseNodeTransform,
  keepOppositeHandleWorld,
  relocalizeWorldPoints,
} from "./shape-transform";
import {
  AddShapeCmd,
  AlignShapesCmd,
  ApplyFormatCmd,
  captureFormatSnapshot,
  ClearTextFormattingCmd,
  ChangeTextCaseCmd,
  type TextCaseMode,
  DeleteShapeCmd,
  DistributeShapesCmd,
  EditTextCmd,
  FlipShapeCmd,
  GroupShapesCmd,
  MoveShapeCmd,
  registerPathPresetRegenerator,
  ReorderShapeCmd,
  ResizeShapeCmd,
  enableTextWrapOnWidthChange,
  SetLineEndpointsCmd,
  SetPathConnectorEndsCmd,
  SetPolygonPointsCmd,
  SetPresetAdjCmd,
  SetBackgroundTargetCmd,
  SetFillCmd,
  fillTargetsFor,
  textShapesForColor,
  SetShapeLockedCmd,
  SetShapeRotationCmd,
  SetParagraphsCmd,
  SetSlideNotesCmd,
  SetSlideHfCmd,
  SetSlideShowCmd,
  SetSlideSizeCmd,
  SetSlideTransitionCmd,
  SetStrokeCmd,
  SetShapeEffectsCmd,
  SetTextAlignCmd,
  SetParagraphBulletCmd,
  SetParagraphRtlCmd,
  SetParagraphCjkCmd,
  SetParagraphSpacingCmd,
  SetTextStyleCmd,
  SetTextBodyCmd,
  textRowOrderPatch,
  textRowOrderRtl,
  SetImageDescrCmd,
  SetCropFrameCmd,
  ReplaceImageSrcCmd,
  InsertTableRowCmd,
  InsertTableColumnCmd,
  RemoveTableRowCmd,
  RemoveTableColumnCmd,
  SetShapeHyperlinkCmd,
  UngroupShapesCmd,
  layoutTarget,
  masterTarget,
  notesMasterTarget,
  handoutMasterTarget,
  resolveTarget,
  slideTarget,
  type AlignMode,
  type EditTarget,
  type ParagraphSpacingPatch,
  type TextStylePatch,
} from "./commands";
import { InsertSlideCmd, MoveSlideCmd, remapIndexAfterSlideMove } from "./slide-commands";
import {
  assignCrop,
  cropFromFrames,
  cropHost,
  cropPreviewSrc,
  fittedCropWindow,
  imageFrame,
  pointInRect,
  readCrop,
  resizeCropWindow,
  scalePictureFromCorner,
  sameCrop,
  sameRect,
  type CropInsets,
} from "./crop-frame";
import { SHAPE_BY_ID } from "./shape-library";
import { applyOfficialPresetGeometry, createChart, createShapeFromPreset, officeInsertStyleRefs } from "./shape-factory";
import { dragOfficialAdjustHandle, listOfficialAdjustHandles } from "@ppt/parser";
import { mountInspector, type InspectorHandle } from "./inspector";
import { buildRibbon } from "./ribbon";
import { mountLecturePanel, type LecturePanel } from "./lecture-panel";
import { mountCommentsPanel, type CommentAssignUi } from "./comments-panel";
import { commentMentionsAi } from "./comment-assign";
import { AddCommentCmd, genCommentId, ResolveSlideCommentsCmd, SetCommentAnchorCmd } from "./comment-commands";
import { openAnchoredCommentDialog } from "./comment-composer";
import { commentShapeLabel, shapeAtPoint } from "./comment-target";
import { commentParticipants } from "./comment-mention";
import { openAccessibilityDialog } from "./accessibility-dialog";
import { openThesaurusDialog } from "./thesaurus-dialog";
import { openTranslateDialog } from "./translate-dialog";
import { openProofingLanguageDialog } from "./proofing-language-dialog";
import { SetProofingLanguageCmd } from "./proofing-language-cmd";
import { getEffectiveProofingLanguage, proofingLangTag } from "./proofing-language";
import { openCompareDialog, comparedSlideParagraphs } from "./compare-dialog";
import { openSmartLookupDialog } from "./smart-lookup-dialog";
import { openProtectDialog } from "./protect-dialog";
import { openEmbedFontsDialog } from "./embed-fonts-dialog";
import { openVbaInfoDialog } from "./vba-info-dialog";
import { openHelpDialog, openExternalHelpLink, type HelpLinks } from "./help-dialog";
import { openPhotoAlbumDialog } from "./photo-album-dialog";
import { ApplyPhotoAlbumCmd } from "./photo-album-cmd";
import { InsertModel3DCmd } from "./model3d-cmd";
import { openModel3DPickerDialog } from "./model3d-picker-dialog";
import { InsertOleCmd, downloadOleEmbed } from "./ole-cmd";
import { openOleInsertDialog } from "./ole-insert-dialog";
import { InsertWebEmbedCmd } from "./web-embed-cmd";
import { openWebEmbedDialog } from "./web-embed-dialog";
import { SetPresentationProtectionCmd } from "./protection-cmd";
import {
  createEditorPluginRuntime,
  mergeEditorPluginCatalog,
  type EditorPlugin,
  type EditorPluginCatalogEntry,
  type EditorPluginRuntime,
} from "./editor-plugins";
import { openEditorPluginMarketPopover } from "./editor-plugin-market";
import {
  proofingSelectionFromShape,
  replaceFirstWordInParagraphs,
  type ProofingSelection,
} from "./proofing-text";
import { openDesignerDialog, type DesignerAiResult } from "./designer-dialog";
import { buildInkPathShape, hitInkShapeAt, isInkShapeId, type InkMode } from "./ink-tool";
import { ClearInkOnSlideCmd, ConvertInkToShapeCmd, ConvertInkToTextCmd } from "./ink-commands";
import { disposeInkOcrWorker, inflateRect, isInkOcrSupported, rasterizeInkPaths, recognizeInkCanvas, tesseractLangFromProofing, unionInkBbox, type InkOcrResult } from "./ink-ocr";
import { disposePaddleOcr, hasPaddleModelConsent, paddleOcrReady, preloadPaddleOcr, recognizeInkPaddle, PADDLE_MODEL_APPROX_BYTES } from "./ink-ocr-paddle";
import { openInkOcrDialog, openInkOcrModelDialog } from "./ink-ocr-dialog";
import { mountInkOverlay, type InkOverlayHandle } from "./ink-overlay";
import { mountCommentPins, type CommentPinsHandle } from "./comment-pins";
import { isRecordSupported, openRecordDialog } from "./record-dialog";
import { captureScreenshot, isScreenshotSupported } from "./screenshot-capture";
import { openStockImagePickerDialog } from "./stock-image-picker-dialog";
import { openMediaLibraryDialog } from "./media-library-dialog";
import type { PasteSpecialMode } from "./paste-special-dialog";
import { openLayoutPickerDialog } from "./layout-picker-dialog";
import { openSectionDialog } from "./section-dialog";
import { openBookmarkDialog } from "./bookmark-dialog";
import { ApplyThemeVariantCmd } from "./theme-variant-cmd";
import { THEME_VARIANT_OPTIONS, variantPreviewSwatch, type ThemeVariantId } from "./theme-variants";
import { ApplySlideLayoutCmd, ResetSlideToLayoutCmd } from "./slide-layout-commands";
import { listLayoutsForSlide, findMainLayer } from "./slide-layout-utils";
import { filterLayoutsToWhitelist } from "./slide-layout-whitelist";
import { addSectionAt, SetDeckSectionsCmd } from "./section-commands";
import { QUICK_STYLE_PRESETS } from "./quick-styles";
import { FILL_GRADIENT_PRESETS } from "./fill-gradient-presets";
import { SHAPE_EFFECT_PRESETS } from "./shape-effect-presets";
import { openSetupSlideShowDialog, type SlideshowSetupState } from "./setup-slideshow-dialog";
import { SetViewGuidesCmd, SetShowPropertiesCmd } from "./view-show-commands";
import { mountSelectionPane } from "./selection-pane";
import { openSmartArtDialog } from "./smartart-dialog";
import { createSmartArtGroup, defaultSmartArtItems, convertTextShapeToSmartArt } from "./smartart-factory";
import { ConvertToSmartArtCmd } from "./smartart-commands";
import { mountTransitionPanel, type TransitionPanelHandle } from "./transition-panel";
import { mountDevPanel, type DevPanelHandle, type DevDumpSection } from "./dev-panel";
import { showContextMenu, type ContextMenuItem } from "./context-menu";
import {
  DEFAULT_AID_OPACITY,
  DEFAULT_GRID_AID_COLOR,
  DEFAULT_GUIDE_AID_COLOR,
  GRID_AID_COLOR_KEY,
  GRID_AID_OPACITY_KEY,
  GRID_AID_WIDTH,
  GUIDE_AID_COLOR_KEY,
  GUIDE_AID_OPACITY_KEY,
  GUIDE_AID_WIDTH,
  aidColorStore,
  appendAidLine,
  clearAidColor,
  normalizeAidColor,
  normalizeAidOpacity,
  readAidColor,
  readAidOpacity,
  writeAidColor,
  writeAidOpacity,
} from "./aid-color";
import { VISUAL_GRID_STEP, pickGridSnap } from "./grid-snap";
import {
  alignOverlayBaselines,
  buildTextEditOverlay,
  fitOverlayAutofit,
  clearPinnedCharSelection,
  paintEditorRangeColor,
  paintPinnedCharSelection,
  placeCaretIn,
  readEditorParagraphs,
  renderParagraphsInto,
  selectTextCharRanges,
  textCharRangesFromSelection,
} from "./text-edit-overlay";
import { runAtCharRanges, type TextCharRange } from "./text-char-style";
import { mountAnimationPanel, type AnimationPanelHandle } from "./animation/panel";
import { mountAnimTimeline, type AnimTimelineHandle } from "./animation/timeline";
import { CopyShapeAnimationsCmd } from "./animation/commands";
import { buildEffectList } from "./animation/store";
import { openPlaybackPluginPopover } from "./playback-plugins";
import { mkLucideIconButton, appendLabelWithIcon, setButtonLucideIcon } from "./icons";
import { renderMarkdown } from "./markdown";
import { getLocale, setLocale, t, type Locale } from "./i18n";
import {
  formatSubject,
  mountSelectionFormatBar,
  scaleRectAboutCenter,
  selectionFormatMode,
  type ScreenRect,
} from "./selection-format-bar";
import { mountAiInlineBox, type AiInlineUi } from "./ai-inline-box";
import {
  captureFills,
  captureRunColors,
  paintedTextColor,
  patchSolidFill,
  patchTextColor,
  restoreFills,
  restoreRunColors,
  solidHex,
  syncLiveColorInputs,
  writeFills,
  writeRunColors,
  type FillSnap,
  type RunColorSnap,
} from "./live-color";
import { ensureUiStyles, SCROLL_CLASS, Z_TOAST, closeRibbonMoreDialogs, isHostDevMode, observeHostDevMode } from "./ui-style";
import {
  defaultWordArtState,
  openHeaderFooterDialog,
  openHyperlinkDialog,
  openSymbolPicker,
  openWordArtDialog,
  type WordArtState,
} from "./dialog";
import { openFindReplacePanel, type FindReplaceHandle } from "./find-replace";
import { openFormatBackgroundDialog } from "./format-background-dialog";
import {
  encodeEquationDescr,
  openEquationDialog,
  renderEquationToDataUrl,
} from "./equation-dialog";
import {
  decodeIconDescr,
  encodeIconDescr,
  openIconPickerDialog,
} from "./icon-picker-dialog";
import { lucideIconToDataUrl, lucideIconToPngDataUrl } from "./lucide-export";
import { recomputeSlidesForMasterEdit } from "./master-refresh";
import {
  buildAuxMasterPseudoSlide,
  ensureHandoutMasters,
  ensureNotesMasters,
  ensureSlideMasters,
  handoutCanvasSize,
  notesCanvasSize,
} from "./aux-master-utils";
import {
  mountNotesPageView,
  mountOutlineView,
  mountSlideSorterView,
  type PresentationViewHost,
  type PresentationViewMode,
} from "./presentation-views";
import type { BulletDef, HyperlinkRef, PathShape, ShapeEffect, ShadowEffect, Stroke, TextRun, TextShape } from "@ppt/core";

// 旧版固定 7 种 + 任意 shape-library preset id（如 roundRect / pentagon /
// rightArrow / flowChartProcess 等）。union with `(string & {})` 让 TypeScript
// 在编辑器调用处仍能自动补全常用 7 种，同时不阻止 picker 传入新预设 id。
export type InsertShapeKind =
  | "rect"
  | "ellipse"
  | "text"
  | "triangle"
  | "star"
  | "arrow"
  | "line"
  | (string & {});

export type SaveFormat = "pptx" | "html" | "html-zip" | "pdf" | "png";

// 舞台与编辑区四周的呼吸边距（px）。
// 通过「外壳 stageHost (overflow:hidden) + 内嵌滚动容器 stageWrap (position:absolute,
// inset:STAGE_PADDING) + 居中层 stageCenter (min 100% + flex center)」实现：滚动条出现在
// 距 host 边缘 STAGE_PADDING 像素的位置；幻灯片小于视口时水平垂直居中，大于视口时可四向滚动。
// fit 模式：fitStage 用 stageWrap.clientWidth/Height 作为可用区，slide 不顶到边缘。
// 固定缩放（50% / 100% / 1.5× / 2× 等）：stage 比 wrap 大时溢出滚动，stageHost 的
// overflow:hidden 把 stage 自然裁剪在内缩区域内，避免舞台跨过 STAGE_PADDING 边界。
const STAGE_PADDING = 16;

/**
 * 编辑器视图中暴露的「放映时可选插件」描述。宿主（playground / 业务壳）把
 * 完整的可选清单传入；编辑器仅维护选中状态并通过 onPlaybackPluginsChange 回写，
 * 不持有真正的 Plugin 对象。这样 @ppt/editor 不需要硬依赖 @ppt/player。
 */
export interface PlaybackPluginOption {
  id: string;
  name: string;
  description?: string;
  /** 初始勾选状态（仅在 selectedPlaybackPlugins 未指定时生效）。 */
  defaultEnabled?: boolean;
  origin?: "official" | "imported";
}

export interface EditorOptions {
  initialSlide?: number;
  backend?: "svg" | "canvas" | "hybrid";
  // 编辑器 UI 语言，默认 "en"。可选项：见 packages/editor/src/i18n。
  // 提供这个选项后会先 setLocale 再构建 UI，让本次 mount 整体使用指定语言；
  // 不影响后续其它 mountEditor 调用前已经 setLocale 设置的全局值。
  locale?: Locale;
  onSelectionChange?: (ids: ReadonlySet<string>) => void;
  onCommandStackChange?: (info: { canUndo: boolean; canRedo: boolean }) => void;
  /** Fired after a local command is applied (not undo/redo). Used for per-command collab sync. */
  onCommandExecuted?: (cmd: EditCommand) => void;
  /**
   * 批注正文里带 @ai 并提交后调用。宿主改这一页并在该线程下回复，
   * 不打开助手。进行中、正忙和失败通过 ui 写在这张批注卡片上。
   */
  onAssignCommentToAi?: (
    comment: {
      id: string;
      slideIndex: number;
      text: string;
      shapeId?: string;
      parentId?: string;
    },
    ui: CommentAssignUi,
  ) => void;
  /**
   * AI 点选模式下，在选区旁的输入框里提交后调用。宿主只改 shapeIds，
   * 进行中、正忙、失败和完成通过 ui 写在输入框里。不提供则没有 AI 点选模式。
   */
  onAskAiInline?: (req: { slideIndex: number; shapeIds: string[]; text: string }, ui: AiInlineUi) => void;
  onAiPickModeChange?: (on: boolean) => void;
  onSlideChange?: (index: number, total: number) => void;
  /** 把 `idb:` 出镜引用换成可播放的地址。 */
  lectureCameraSrc?: (ref: string) => Promise<string | null>;
  /** 只录这一页的出镜、讲解点击和旁白。 */
  recordLectureSlide?: (slideIndex: number) => void;
  /**
   * 一张 slide 上 sp3d image 的异步 bake 全部完成（或没有需要 bake 的）后触发。
   * 宿主（playground）用它刷新该 slide 缩略图，把 baked PNG 同步到侧边栏，避免
   * "缩略图扁平 / 舞台立体"的不一致。第二个参数是该 slide 在 pres.slides 中的下
   * 标，方便宿主直接对位刷新。
   */
  onSlideBaked?: (slide: Slide, index: number) => void;
  onRequestClose?: () => void;
  /**
   * 可选：将顶栏挂到编辑器根节点之外（例如 playground 的 `#ribbon-host`）。
   * 未提供时顶栏仍放在 ppt-editor-root 顶部。
   */
  ribbonHost?: HTMLElement;
  /**
   * 可选：视图条（视图切换 · 缩放 · 放映 · 明暗 · 属性栏）挂到编辑器之外，
   * 例如 playground 顶栏下方横跨缩略图列的 `#view-bar-host`。未提供时放在舞台上方。
   */
  viewBarHost?: HTMLElement;
  /** 宿主明暗切换；提供后视图条显示太阳 / 月亮按钮。 */
  toggleAppearance?: () => void;
  isDarkAppearance?: () => boolean;
  /**
   * 外观偏好变化（账户菜单、设置、跟随系统）时通知视图条刷新太阳 / 月亮。
   * 返回取消订阅。未提供时按钮只在功能区自己刷新时更新。
   */
  subscribeAppearance?: (listener: () => void) => () => void;
  // ---- File tab 集成钩子。任一钩子提供后 ribbon File tab 才会显示。 ----
  // 保存当前演示文稿。playground 把当前 Presentation 写为指定格式。
  saveAs?: (fmt: SaveFormat) => void;
  /** Query only: Export popover lists only formats this returns true for (PPTX always). */
  canExport?: (fmt: SaveFormat) => boolean;
  /** Query only: Share modal copies this URL when present. */
  getShareUrl?: () => string | undefined;
  /** 快速保存到已打开的磁盘文件（File System Access）；无句柄时宿主可回落 saveAs。 */
  save?: () => void;
  // 让宿主弹出文件选择器加载新的 .pptx 替换当前演示文稿。
  openFile?: () => void;
  // 新建空白演示文稿。
  newPresentation?: () => void;
  /** File tab「最近」列表（由宿主提供本地缓存条目）。 */
  openRecent?: () => void;
  // 打印当前演示文稿；不传则使用 window.print() 兜底。
  print?: () => void;
  /** File tab「在线分享」；SaaS 登录后由宿主提供。 */
  share?: () => void;
  /** File tab「账号设置」。 */
  openAccount?: () => void;
  /** File tab「选项」— 语言 / 渲染 / 开发者偏好。 */
  openOptions?: () => void;
  /** File tab「协作编辑」。 */
  openCollab?: () => void;
  /** 为 false 时 File tab 隐藏分享按钮（本地模式或访客）。 */
  isShareAvailable?: () => boolean;
  /**
   * 视图切换（普通 / 浏览 / 阅读 / …）。宿主用来收起自己的缩略图列：
   * 浏览和阅读都占满画布宽度，左栏缩略图会和浏览网格重复。
   */
  onPresentationViewChange?: (mode: PresentationViewMode) => void;
  // ---- 放映插件选择 ----
  // 可选插件清单。提供后 ribbon 上会出现「Plugins」按钮，用户可勾选放映时
  // 加载哪些插件。空数组或不传则隐藏按钮。
  availablePlaybackPlugins?: PlaybackPluginOption[];
  // 初始勾选的插件 id 列表。未指定时按 availablePlaybackPlugins 中各项的
  // defaultEnabled 字段决定。
  selectedPlaybackPlugins?: string[];
  // 用户在编辑器中切换勾选时触发；宿主通常会持久化（localStorage）以便下次打开
  // 保留选择。
  onPlaybackPluginsChange?: (ids: string[]) => void;
  // ---- Slideshow tab 入口 ----
  // 任一钩子提供后，「放映」tab 的对应按钮才会显示；全部缺失时三按钮均隐藏（但
  // tab 标签依然在，以便宿主未来添加自己的放映设置）。
  // 「从头开始」: 从第 0 张幻灯片进入放映（PowerPoint 习惯的 F5）。
  startSlideshowFromBeginning?: () => void;
  // 「从当前幻灯片」: 从用户当前停留的 slide 进入放映（PowerPoint 习惯的 ⇧F5）。
  startSlideshowFromCurrent?: () => void;
  // 「直播放映」: 发布只读快照，观众打开链接后跟随主持人翻页。
  startLiveSlideshow?: () => void;
  // 「窗口模式」toggle 状态。开启后宿主的 startSlideshow* 实现应跳过
  // requestFullscreen()，仅在浏览器窗口内放映。状态由宿主持久化。
  // - windowedMode: 初始 / 当前是否启用；缺省 false。
  // - onWindowedModeChange: 用户点击 toggle 时调用，参数为切换后的新状态。
  // 不提供 onWindowedModeChange 时 ribbon 不渲染对应按钮。
  windowedMode?: boolean;
  onWindowedModeChange?: (next: boolean) => void;
  // 「循环放映」toggle 状态由宿主持久化（localStorage / pres 内 customData 等）。
  // - slideshowLoop: 初始 / 当前是否启用；缺省 false。
  // - onSlideshowLoopChange: 用户点击 toggle 时调用，参数为切换后的新状态。
  // 都不提供时 ribbon 不渲染 Loop 按钮。
  slideshowLoop?: boolean;
  onSlideshowLoopChange?: (next: boolean) => void;
  // 「演讲者视图」toggle 状态由宿主持久化。开启后宿主的 startSlideshow* 实现应进入
  // 演讲者模式（当前幻灯片 + 下一张预览 + 可编辑备注 + 计时器）。
  // - presenterMode: 初始 / 当前是否启用；缺省 false。
  // - onPresenterModeChange: 用户点击 toggle 时调用，参数为切换后的新状态。
  // 不提供 onPresenterModeChange 时 ribbon 不渲染对应按钮。
  presenterMode?: boolean;
  onPresenterModeChange?: (next: boolean) => void;
  // 「使用排练时间」toggle：放映时是否按 advAfter 自动换页。
  slideshowUseTimings?: boolean;
  onSlideshowUseTimingsChange?: (next: boolean) => void;
  // 「播放旁白」toggle：放映时是否自动播放 slide 上的音频 shape。
  slideshowPlayNarrations?: boolean;
  onSlideshowPlayNarrationsChange?: (next: boolean) => void;
  /**
   * 注入额外的右键菜单项。宿主（如 playground）可借此把"钉到 AI 对话"等跨包功能
   * 挂进 stage 的 contextmenu，无需 fork 编辑器。返回的 items 会拼到默认菜单尾部
   * （前置一个 sep 分隔）。`info.onShape` 指示右键命中的是 shape 还是空白处。
   * 不提供 / 返回空数组时菜单与原状一致。
   */
  buildExtraContextMenuItems?: (info: ExtraContextMenuInfo) => ContextMenuItem[];
  /** Extra dump sections for the Developer tab (host view/window diagnostics). */
  devDumpSections?: () => DevDumpSection[];
  /** Design tab「主题」按钮：宿主弹出主题画廊 modal，对当前 deck 执行 ApplyCustomThemeCmd。 */
  openThemeGallery?: () => void;
  /**
   * Design tab「Designer」：布局建议面板。不传 `openDesigner` 时编辑器仍可用内置
   * `designer.runAiReview` 打开规则审计；宿主注入 `openDesigner` 可完全接管（如接 AI）。
   */
  openDesigner?: () => void;
  designer?: {
    aiAvailable?: boolean;
    runAiReview?: (signal: AbortSignal) => Promise<DesignerAiResult | null>;
    onAfterApplyFixes?: () => void;
  };
  /**
   * 手写识别：宿主用视觉模型转写合成后的墨迹图。
   * 返回 null / 抛错时依次回退 PaddleOCR（本地）→ Tesseract。
   */
  recognizeHandwriting?: (input: {
    dataUrl: string;
    strokeCount: number;
    lang: string;
  }) => Promise<{ text: string } | null>;
  /** Slideshow → Custom Show / Rehearse（由宿主实现放映逻辑）。 */
  openCustomShow?: () => void;
  startRehearseTimings?: () => void;
  startRecordSlideShowFromBeginning?: () => void;
  startRecordSlideShowFromCurrent?: () => void;
  openSetupSlideShow?: () => void;
  getSlideshowSetup?: () => SlideshowSetupState;
  onSlideshowSetupChange?: (next: SlideshowSetupState) => void;
  /** Review 批注作者名；缺省 "Guest"。 */
  commentAuthor?: () => string;
  /** View → New Window：在同一演示文稿上打开辅助编辑窗口（由宿主实现）。 */
  openNewWindow?: () => void;
  /** View → 关闭全部辅助窗口（由宿主实现）。 */
  closeAllAuxWindows?: () => void;
  /** View → 聚焦最近打开的辅助窗口。 */
  focusAuxWindow?: () => void;
  /** View → 重排窗口 / 层叠窗口（由宿主实现；Web 端对同源 popup 有限支持）。 */
  arrangeAllWindows?: () => void;
  arrangeSideBySideWindows?: () => void;
  arrangeStackedWindows?: () => void;
  cascadeWindows?: () => void;
  /** Insert → 素材库：本机 / 云端媒体分类库。提供后 Ribbon 显示入口。 */
  mediaLibrary?: MediaLibraryAdapter;
  /** Insert → Online Pictures：Unsplash / Pexels API keys（缺省时隐藏或提示配置）。 */
  getStockImageKeys?: () => { unsplashKey?: string; pexelsKey?: string };
  /** 用户尝试在线搜图但未配置 API key 时，由宿主打开设置（如 AI Settings）。 */
  onRequestStockImageKeys?: () => void;
  /** Help 选项卡外链（文档 / 反馈 / 培训）；缺省时反馈与培训按钮提示未配置。 */
  helpLinks?: HelpLinks;
  /** Help 分组「功能导览」；由宿主打开 onboarding tour。 */
  openEditorTour?: () => void;
  /** Base URL for built-in 3D model presets (`public/samples/models/` when hosted at `/`). */
  model3dAssetsBaseUrl?: string;
  /** View tab editor plugin catalog (built-ins merged in). */
  availableEditorPlugins?: EditorPluginCatalogEntry[];
  /** Initially enabled catalog plugin ids (persisted by host). */
  enabledEditorPlugins?: string[];
  onEditorPluginsChange?: (ids: string[]) => void;
  /** 导入一个 .js。文件自己声明种类。种类和当前面板不一致时返回 null（仍会导入）。 */
  importPlugin?: (
    kind: "editor" | "playback",
  ) => Promise<{ id: string; name: string; description?: string } | null>;
  /** 删除账号里的导入插件。返回 false 表示没删成。 */
  deleteImportedPlugin?: (id: string) => Promise<boolean>;
  /** Edit-phase plugins (`EditorPlugin` protocol). Activated on mount; use `handle.plugins` to register more. */
  plugins?: EditorPlugin[];
}

export interface ExtraContextMenuInfo {
  /** 当前右键点击是否命中 shape（true = 选中某 shape 后弹菜单；false = 在空白处弹）。 */
  onShape: boolean;
  /** 当前 slide 索引（0-based）。 */
  slideIdx: number;
  /** 弹菜单时已选中的 shape id 列表（onShape=false 时通常为空）。 */
  selectedShapeIds: ReadonlyArray<string>;
}

// 阶段 2.2：编辑器视图上下文。
//   - kind="slides" → 正常 slide 编辑模式
//   - kind="master" → 母版视图，editTarget 指向当前正在编辑的 master 或 layout
// UI 切换由 setEditorContext 控制；buildScene / inspector / commands 都读这个状态决定操作目标。
export type EditorContext =
  | { kind: "slides" }
  | { kind: "master"; masterId: string; layoutId?: string }
  | { kind: "notesMaster"; masterId: string }
  | { kind: "handoutMaster"; masterId: string };

function isMasterEditContext(ctx: EditorContext): boolean {
  return ctx.kind === "master" || ctx.kind === "notesMaster" || ctx.kind === "handoutMaster";
}

export interface EditorHandle {
  destroy(): void;
  selection: Selection;
  stack: CommandStack;
  execute(cmd: EditCommand): void;
  undo(): boolean;
  redo(): boolean;
  current(): number;
  goto(i: number): void;
  /** 按当前 slide 索引重绘舞台（不切换页、不清选区）。 */
  redraw(): void;
  startTextEdit(id?: string): void;
  insertShape(kind: InsertShapeKind): void;
  insertImage(src: string, natural?: { w: number; h: number }): void;
  /** 读取图片 / 视频 / 音频并插入。读取过程在舞台底部显示进度。 */
  insertMediaFiles(files: readonly File[]): Promise<void>;
  /** `narration`：录制旁白——自动播放并写成 OOXML `p:audio@isNarration`。 */
  insertAudio(src: string, opts?: { duration?: number; narration?: boolean }): void;
  duplicateSelection(): void;
  reorderSelection(direction: "front" | "back" | "forward" | "backward"): void;
  setZoom(mode: "fit" | number): void;
  toggleGrid(): boolean;
  /** 返回当前用户在编辑器中勾选的放映插件 id 列表（顺序与 availablePlaybackPlugins 一致）。 */
  getSelectedPlaybackPlugins(): string[];
  /** 编程式设置放映插件勾选状态；不会触发 onPlaybackPluginsChange。 */
  setSelectedPlaybackPlugins(ids: readonly string[]): void;
  /**
   * 换成当前账号的导入插件。编辑插件 extras 与内置目录合并；
   * 放映插件列表是官方加导入的完整清单。
   */
  setImportedPluginCatalog(
    editorExtras: EditorPluginCatalogEntry[],
    playback: PlaybackPluginOption[],
  ): void;
  focusComments(slideIndex?: number): void;
  /** AI 点选模式：选中元素旁出 AI 输入框。没有 onAskAiInline 时无效。 */
  setAiPickMode(on: boolean): void;
  getAiPickMode(): boolean;
  /** 热替换演示文稿（协作远程同步等）：保留编辑器 UI，清空 undo 并重绘。 */
  syncPresentation(pres: Presentation, slideIndex?: number): void;
  /**
   * 宿主状态文案（保存 / 导出等提示），显示在底部状态栏正中。
   * `action` 在文案右侧放一个快捷按钮；传 `null` 或省略则收起。
   */
  setHostStatus(
    msg: string,
    kind?: "info" | "ok" | "err",
    action?: { label: string; onClick: () => void } | null,
  ): void;
  /** 应用协作者发来的命令：直接作用到文档，不进本地 undo 栈，也不再向上游广播。 */
  applyRemoteCommand(cmd: EditCommand): void;
  /** 协作者撤销了他之前广播的命令：在本地 revert 同一实例。 */
  revertRemoteCommand(cmd: EditCommand): void;
  /** 阶段 2.2：进入/退出母版视图。传 undefined 等价 { kind:"slides" }。 */
  setEditorContext(ctx: EditorContext | undefined): void;
  /** 当前编辑器视图上下文。 */
  getEditorContext(): EditorContext;
  /** Register / unload edit-phase plugins (see `EditorPlugin` protocol). */
  plugins: {
    register(plugin: EditorPlugin): Promise<void>;
    unregister(id: string): void;
    list(): string[];
  };
}

interface Runtime {
  scene: Scene;
  flush: () => void;
  detach: () => void;
}

// 选择框/手柄使用屏幕像素而非 slide unit，绘制时再换算回 slide unit，
// 这样无论缩放多少都保持可见和可点击。
const HANDLE_SCREEN_PX = 10;
const HANDLE_HIT_SCREEN_PX = 14;
const FRAME_STROKE_SCREEN_PX = 1.5;

// 智能参考线 / Snap 阈值（slide 单位）。
interface Guide {
  orient: "v" | "h";
  // 沿对齐方向上的坐标（v = x, h = y）。
  at: number;
  // 显示范围（slide 单位）。
  from: number;
  to: number;
}

// 阶段 2.2：母版视图把 master/layout 的 shapes 包成"伪 slide"喂给 createScene，
// 复用现成的渲染 / hit-test / inspector 路径。注意 shapes 不再 locked —— 母版视图
// 下用户就是要编辑它们。返回的 slide 是临时对象，不参与 pres.slides，也不会被
// 序列化；执行 EditCommand 仍然修改 pres.masters[]。
function buildMasterPseudoSlide(
  pres: Presentation,
  ctx: Extract<EditorContext, { kind: "master" }>,
  fallback: Slide,
): Slide {
  const master = pres.masters?.find((m) => m.id === ctx.masterId);
  const layout = ctx.layoutId ? master?.layouts?.find((l) => l.id === ctx.layoutId) : undefined;
  if (!master) return fallback;
  const shapes = layout ? layout.shapes : master.shapes;
  const background = (layout?.background ?? master.background);
  return {
    id: layout ? `__master_${master.id}__${layout.id}` : `__master_${master.id}`,
    name: layout ? `${master.name} / ${layout.name}` : master.name,
    index: -1,
    background,
    layers: [
      {
        id: "main",
        name: layout ? "Layout" : "Master",
        visible: true,
        locked: false,
        shapes,
      },
    ],
    hf: layout?.hf ?? master.hf,
    clrMapOverride: undefined,
  };
}

// 多个 Cmd 打包成一个 undoable atom。用于多选拖动场景。
class BatchCmd implements EditCommand {
  constructor(public readonly label: string, private cmds: EditCommand[]) {}
  apply(pres: Presentation): void {
    for (const c of this.cmds) c.apply(pres);
  }
  revert(pres: Presentation): void {
    for (let i = this.cmds.length - 1; i >= 0; i--) this.cmds[i]!.revert(pres);
  }
}

export function mountEditor(host: HTMLElement, initialPres: Presentation, opts: EditorOptions = {}): EditorHandle {
  // 必须在创建任何 UI 元素之前 setLocale —— 后续 toolbar / inspector / animation 面板等
  // 在 mount 时同步读 t()，locale 切换不会自动重渲。
  if (opts.locale) setLocale(opts.locale);
  // 一次性注入全局 UI 样式（滚动条等）。idempotent：多次 mount 只注入一次。
  ensureUiStyles(host.ownerDocument);
  const backend = opts.backend ?? "svg";
  let pres = initialPres;
  const stack = new CommandStack(pres);
  let editorPlugins: EditorPluginRuntime | null = null;
  const selection = new Selection();

  // 入场动画的 "初始 hide" 状态在 parser 解析阶段就已写入 shape.opacity / initialOverrides；
  // 编辑模式下让一切可见以便用户编辑。区分两种 opacity=0：
  //   1. 入场动画引发的隐藏（mount 时算一次 entrance 目标集合 → 进入这部分的 shape
  //      在 destroy 时按"当前 timing"重算 hide，覆盖用户在编辑器添加/删除动画的情况）；
  //   2. 用户在 inspector 里显式设为 0 的（不在 entrance 目标集合里）——这种要 round-trip
  //      保留，destroy 时再写回。
  const mountEntrShapes = new Set<Shape>();
  for (const slide of pres.slides) {
    const st = computeInitialEntranceState(slide);
    for (const s of st.hiddenShapes) mountEntrShapes.add(s);
  }
  const userOpacityZero = new Map<Shape, number>();
  const recordUserZero = (s: Shape): void => {
    if (s.opacity === 0 && !mountEntrShapes.has(s)) userOpacityZero.set(s, 0);
    if (s.kind === "group") for (const c of s.children) recordUserZero(c);
  };
  for (const slide of pres.slides) {
    for (const layer of slide.layers) for (const s of layer.shapes) recordUserZero(s);
  }
  forceVisibleForEdit(pres);
  for (const slide of pres.slides) {
    slide.initialParaOverrides = undefined;
    slide.initialCharOverrides = undefined;
  }

  // 编辑器整体布局（CSS Grid）：
  //   [顶栏]（跨两列；ribbonHost 外置时省略）
  //   [视图条]（跨两列；viewBarHost 外置时省略）
  //   舞台（1fr）       | 右侧属性栏（舞台行到底；默认收起为 0 列）
  //   备注/时间轴抽屉（默认 0）
  //   命令行（分组切换器 + 当前分组命令，单行）
  //   状态栏（视图下拉 · 备注开关）
  const ribbonExternal = !!opts.ribbonHost;
  const viewBarExternal = !!opts.viewBarHost;
  const viewGridRow = ribbonExternal ? 1 : 2;
  const stageGridRow = 1 + (ribbonExternal ? 0 : 1) + (viewBarExternal ? 0 : 1);
  const dockGridRow = stageGridRow + 1;
  const commandGridRow = stageGridRow + 2;
  const statusGridRow = stageGridRow + 3;
  const gridRowsTemplate = (dock: boolean): string =>
    [
      ...(ribbonExternal ? [] : ["auto"]),
      ...(viewBarExternal ? [] : ["auto"]),
      "1fr",
      dock ? "auto" : "0",
      "auto",
      "auto",
    ].join(" ");
  const root = host.ownerDocument.createElement("div");
  root.className = "ppt-editor-root";
  root.style.cssText = [
    "position:relative",
    "width:100%",
    "height:100%",
    "background:var(--editor-stage,#141414)",
    "overflow:hidden",
    "display:grid",
    `grid-template-rows:${gridRowsTemplate(false)}`,
    "grid-template-columns:minmax(0,1fr) 0",
  ].join(";");
  root.tabIndex = 0;
  host.appendChild(root);

  // 舞台区域用「外壳 + 内嵌滚动容器」两层结构，目的是让滚动条「缩进」到 STAGE_PADDING
  // 的边距之内 —— 不只是舞台与四周保持间距，连滚动条本身也不贴 host 边缘，所以
  // 缩放再大、滚到极限位置时仍然有「舞台」「滚动条」「ribbon/侧栏/时间轴」三者之间
  // 都看得见的呼吸空间。
  //
  // 结构：
  //   stageHost    — grid 单元，position:relative + overflow:hidden，只负责裁剪和定位
  //     stageWrap  — 滚动容器，position:absolute + inset:STAGE_PADDING，overflow:auto
  //     stageCenter — min 100% 尺寸 + flex 居中；内容小于视口时舞台居中，大于视口时
  //                   随 stage 撑开以支持四向滚动（避免直接在 scroll 容器上用 center
  //                   导致负向滚动不可达）。
  //       stage    — 实际放 slide 的 DOM
  const stageHost = host.ownerDocument.createElement("div");
  stageHost.className = "ppt-stage-host";
  stageHost.style.cssText = [
    "position:relative",
    "min-height:0",
    "min-width:0",
    "overflow:hidden",
    `grid-row:${stageGridRow}`,
    "grid-column:1",
  ].join(";");
  root.appendChild(stageHost);

  // 全局 toast：挂 document.body（position:fixed），与「更多」同一层叠上下文。
  // 若挂在 stageHost 内，再高的 z-index 也出不去，会被 body 上的「更多」盖住。
  const toastEl = host.ownerDocument.createElement("div");
  toastEl.dataset.pptEditorToast = "1";
  toastEl.style.cssText = [
    "position:fixed",
    "left:50%",
    "top:12px",
    "transform:translateX(-50%)",
    "background:var(--popover,#242424)",
    "color:var(--popover-foreground,var(--foreground))",
    "padding:8px 14px",
    "border-radius:6px",
    "font-size:13px",
    "max-width:min(420px,calc(100vw - 24px))",
    "text-align:center",
    "box-shadow:var(--shadow-lg,0 6px 20px rgba(0,0,0,0.18))",
    "border:1px solid var(--border)",
    "opacity:0",
    "transition:opacity .18s ease-out",
    "pointer-events:none",
    `z-index:${Z_TOAST}`,
  ].join(";");
  host.ownerDocument.body.appendChild(toastEl);
  let toastTimer: number | undefined;
  const placeToast = (): void => {
    const r = stageHost.getBoundingClientRect();
    toastEl.style.left = `${r.left + r.width / 2}px`;
    toastEl.style.top = `${Math.max(12, r.top + 12)}px`;
    toastEl.style.maxWidth = `${Math.max(160, Math.min(420, r.width - 24))}px`;
  };
  const showToast = (msg: string, durationMs = 2200): void => {
    closeRibbonMoreDialogs(host.ownerDocument);
    placeToast();
    toastEl.textContent = msg;
    toastEl.style.opacity = "1";
    if (toastTimer !== undefined) {
      host.ownerDocument.defaultView?.clearTimeout(toastTimer);
    }
    toastTimer = host.ownerDocument.defaultView?.setTimeout(() => {
      toastEl.style.opacity = "0";
      toastTimer = undefined;
    }, durationMs);
  };

  // 取色拖动先改画面，松手才 execute。这里在其它命令 / 撤销之前把那次拖动收成一条。
  let committingLive = false;
  let commitLivePreview = (): void => {};
  const rawStackExecute = stack.execute.bind(stack);
  stack.execute = (cmd: EditCommand) => {
    if (!committingLive) commitLivePreview();
    if (!canApplyEditCommand(pres, cmd)) {
      showToast(t("protect.blocked"));
      throw new EditingBlockedError();
    }
    rawStackExecute(cmd);
    editorPlugins?.notifyCommand({ label: cmd.label, kind: "apply" });
    opts.onCommandExecuted?.(cmd);
  };
  const rawUndo = stack.undo.bind(stack);
  const rawRedo = stack.redo.bind(stack);
  stack.undo = (): boolean => {
    if (!committingLive) commitLivePreview();
    return rawUndo();
  };
  stack.redo = (): boolean => {
    if (!committingLive) commitLivePreview();
    return rawRedo();
  };

  const stageWrap = host.ownerDocument.createElement("div");
  stageWrap.className = `${SCROLL_CLASS} ppt-stage-wrap`;
  stageWrap.style.cssText = [
    "position:absolute",
    `inset:${STAGE_PADDING}px`,
    "overflow:auto",
  ].join(";");
  stageHost.appendChild(stageWrap);

  const stageCenter = host.ownerDocument.createElement("div");
  stageCenter.className = "ppt-stage-center";
  stageCenter.style.cssText = [
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "min-width:100%",
    "min-height:100%",
    "width:max-content",
    "height:max-content",
    "box-sizing:border-box",
  ].join(";");
  stageWrap.appendChild(stageCenter);

  // 右侧面板栏：内容区 + 右侧竖向 tab（属性 / 动画 / 切换 / 图层 / 批注 / 开发者）。
  const rightPanel = host.ownerDocument.createElement("div");
  rightPanel.className = "ppt-right-panel";
  rightPanel.style.cssText = [
    `grid-row:${stageGridRow} / -1`,
    "grid-column:2",
    "display:none",
    "flex-direction:row",
    "min-height:0",
    "min-width:0",
    "position:relative",
    "background:var(--editor-panel,#191919)",
    "border-left:1px solid var(--border,#3a3a3a)",
    "overflow:hidden",
  ].join(";");
  root.appendChild(rightPanel);

  const rightBody = host.ownerDocument.createElement("div");
  rightBody.style.cssText =
    "flex:1 1 0;min-width:0;min-height:0;display:flex;flex-direction:column;overflow:hidden";
  rightPanel.appendChild(rightBody);

  const rightTabBar = host.ownerDocument.createElement("div");
  rightTabBar.style.cssText = [
    "display:flex",
    "flex-direction:column",
    "align-items:stretch",
    "flex:0 0 36px",
    "width:36px",
    "padding:6px 0",
    "box-sizing:border-box",
    "background:var(--card,#1c1c1c)",
    "border-left:1px solid var(--border,#3a3a3a)",
    "gap:2px",
  ].join(";");
  const mkRightTab = (iconName: string, label: string): HTMLButtonElement => {
    const b = mkLucideIconButton(host.ownerDocument, iconName, "", label, 16);
    b.style.cssText = [
      "flex:0 0 auto",
      "width:36px",
      "height:36px",
      "padding:0",
      "background:transparent",
      "color:var(--muted-foreground)",
      "border:none",
      "border-radius:0",
      "cursor:pointer",
      "display:inline-flex",
      "align-items:center",
      "justify-content:center",
    ].join(";");
    return b;
  };
  const propsTabBtn = mkRightTab("sliders-horizontal", t("rightPanel.tab.properties"));
  const animTabBtn = mkRightTab("play", t("rightPanel.tab.animations"));
  const transTabBtn = mkRightTab("blend", t("rightPanel.tab.transitions"));
  const layersTabBtn = mkRightTab("layers", t("rightPanel.tab.layers"));
  const commentsTabBtn = mkRightTab("message-square", t("rightPanel.tab.comments"));
  const devTabBtn = mkRightTab("bug", t("rightPanel.tab.developer"));
  const rightCloseBtn = mkLucideIconButton(
    host.ownerDocument,
    "x",
    "",
    t("editor.rightPanel.close"),
    14,
  );
  rightCloseBtn.style.cssText = [
    "margin-top:auto",
    "flex:0 0 auto",
    "width:36px",
    "height:36px",
    "padding:0",
    "background:transparent",
    "color:var(--muted-foreground)",
    "border:none",
    "border-radius:0",
    "cursor:pointer",
    "display:inline-flex",
    "align-items:center",
    "justify-content:center",
  ].join(";");
  rightCloseBtn.addEventListener("mouseenter", () => {
    rightCloseBtn.style.background = "var(--accent)";
    rightCloseBtn.style.color = "var(--foreground)";
  });
  rightCloseBtn.addEventListener("mouseleave", () => {
    rightCloseBtn.style.background = "transparent";
    rightCloseBtn.style.color = "var(--muted-foreground)";
  });
  rightTabBar.append(propsTabBtn, animTabBtn, transTabBtn, layersTabBtn, commentsTabBtn, devTabBtn, rightCloseBtn);
  rightPanel.appendChild(rightTabBar);

  const RIGHT_PANEL_MIN = 280;
  const RIGHT_PANEL_MAX = 480;
  const RIGHT_PANEL_DEFAULT = 320;
  const RIGHT_PANEL_WIDTH_KEY = "pp.rightPanelWidth";
  const clampRightPanel = (px: number): number =>
    Math.round(Math.min(RIGHT_PANEL_MAX, Math.max(RIGHT_PANEL_MIN, px)));
  const readStoredRightPanel = (): number => {
    try {
      const n = Number(host.ownerDocument.defaultView?.localStorage.getItem(RIGHT_PANEL_WIDTH_KEY));
      return Number.isFinite(n) && n > 0 ? clampRightPanel(n) : RIGHT_PANEL_DEFAULT;
    } catch {
      return RIGHT_PANEL_DEFAULT;
    }
  };
  let rightPanelWidth = readStoredRightPanel();
  const rightResizer = host.ownerDocument.createElement("div");
  rightResizer.className = "ppt-right-panel-resizer";
  rightResizer.setAttribute("role", "separator");
  rightResizer.setAttribute("aria-orientation", "vertical");
  rightResizer.tabIndex = 0;
  rightResizer.setAttribute("aria-valuemin", String(RIGHT_PANEL_MIN));
  rightResizer.setAttribute("aria-valuemax", String(RIGHT_PANEL_MAX));
  rightResizer.setAttribute("aria-valuenow", String(rightPanelWidth));
  const rightResizeLabel = t("editor.rightPanel.resize");
  rightResizer.title = rightResizeLabel;
  rightResizer.setAttribute("aria-label", rightResizeLabel);
  rightPanel.appendChild(rightResizer);

  const propsWrap = host.ownerDocument.createElement("div");
  propsWrap.style.cssText = "flex:1 1 0;min-height:0;display:flex;flex-direction:column;position:relative;overflow:hidden";
  rightBody.appendChild(propsWrap);

  // 当属性 tab 被选中但没有选中任何元素时，给一个友好提示，避免空白页面让用户困惑。
  const propsEmpty = host.ownerDocument.createElement("div");
  propsEmpty.textContent = t("rightPanel.empty.noSelection");
  propsEmpty.style.cssText = [
    "color:var(--muted-foreground)",
    "font:12px system-ui,sans-serif",
    "padding:20px 14px",
    "text-align:center",
    "line-height:1.5",
    "display:none",
  ].join(";");
  propsWrap.appendChild(propsEmpty);

  const animWrap = host.ownerDocument.createElement("div");
  animWrap.style.cssText = "flex:1 1 0;min-height:0;display:flex;flex-direction:column;position:relative;overflow:hidden";
  rightBody.appendChild(animWrap);

  const transWrap = host.ownerDocument.createElement("div");
  transWrap.style.cssText = "flex:1 1 0;min-height:0;display:flex;flex-direction:column;position:relative;overflow:hidden";
  rightBody.appendChild(transWrap);

  const layersWrap = host.ownerDocument.createElement("div");
  layersWrap.style.cssText = "flex:1 1 0;min-height:0;display:flex;flex-direction:column;position:relative;overflow:hidden";
  rightBody.appendChild(layersWrap);

  const commentsWrap = host.ownerDocument.createElement("div");
  commentsWrap.style.cssText = "flex:1 1 0;min-height:0;display:flex;flex-direction:column;position:relative;overflow:hidden";
  rightBody.appendChild(commentsWrap);
  const commentsHost = host.ownerDocument.createElement("div");
  commentsHost.style.cssText = "position:absolute;inset:0;min-height:0;overflow:hidden";
  commentsWrap.appendChild(commentsHost);

  const devWrap = host.ownerDocument.createElement("div");
  devWrap.style.cssText = "flex:1 1 0;min-height:0;display:flex;flex-direction:column;position:relative;overflow:hidden";
  rightBody.appendChild(devWrap);

  type RightTab = "properties" | "animations" | "transitions" | "layers" | "comments" | "developer";
  let activeRightTab: RightTab = "properties";
  let devPanel: DevPanelHandle | undefined;
  const focusRightTab = (tab: RightTab): void => {
    if (!rightPanelOpen) {
      rightPanelOpen = true;
      applyRightPanelLayout();
    }
    activeRightTab = tab;
    refreshRightTabs();
    if (tab === "comments") {
      setCommentsMarkupVisible(true);
      commentsPanel?.refresh();
    }
    if (tab === "developer") devPanel?.refresh();
  };
  const onRightTabClick = (tab: RightTab): void => {
    if (rightPanelOpen && activeRightTab === tab) {
      togglePropertiesPanel();
      return;
    }
    focusRightTab(tab);
  };
  const refreshRightTabs = (): void => {
    const styleTab = (btn: HTMLButtonElement, on: boolean): void => {
      btn.style.color = on ? "var(--foreground)" : "var(--muted-foreground)";
      btn.style.background = on ? "var(--editor-tab-active,var(--accent,#333333))" : "transparent";
      btn.style.boxShadow = on ? "inset -2px 0 0 var(--primary)" : "none";
    };
    styleTab(propsTabBtn, activeRightTab === "properties");
    styleTab(animTabBtn, activeRightTab === "animations");
    styleTab(transTabBtn, activeRightTab === "transitions");
    styleTab(layersTabBtn, activeRightTab === "layers");
    styleTab(commentsTabBtn, activeRightTab === "comments");
    const devOn = isHostDevMode(host.ownerDocument);
    if (!devOn && activeRightTab === "developer") activeRightTab = "properties";
    styleTab(devTabBtn, activeRightTab === "developer");
    devTabBtn.style.display = devOn ? "inline-flex" : "none";
    propsWrap.style.display = activeRightTab === "properties" ? "flex" : "none";
    animWrap.style.display = activeRightTab === "animations" ? "flex" : "none";
    transWrap.style.display = activeRightTab === "transitions" ? "flex" : "none";
    layersWrap.style.display = activeRightTab === "layers" ? "flex" : "none";
    commentsWrap.style.display = activeRightTab === "comments" ? "flex" : "none";
    devWrap.style.display = devOn && activeRightTab === "developer" ? "flex" : "none";
    // inspector 现在在"无选中"时也会渲染背景/幻灯片编辑面板（见 inspector.ts
    // backgroundSection），因此不再需要 propsEmpty 占位提示，始终隐藏它。
    propsEmpty.style.display = "none";
  };
  propsTabBtn.addEventListener("click", () => onRightTabClick("properties"));
  animTabBtn.addEventListener("click", () => onRightTabClick("animations"));
  transTabBtn.addEventListener("click", () => onRightTabClick("transitions"));
  layersTabBtn.addEventListener("click", () => onRightTabClick("layers"));
  commentsTabBtn.addEventListener("click", () => onRightTabClick("comments"));
  devTabBtn.addEventListener("click", () => onRightTabClick("developer"));
  // 选中变化时刷新空状态可见性。
  selection.subscribe(() => refreshRightTabs());

  // 底部停靠栏：贴底部、与舞台行不重叠。用 tab 在「动画时间轴」与「备注」之间切换，
  // 二者共享同一块底部空间——避免再各占一行去挤压舞台 / 互相冲突。
  const bottomDock = host.ownerDocument.createElement("div");
  bottomDock.style.cssText = [
    `grid-row:${dockGridRow}`,
    "grid-column:1",
    "display:none",
    "flex-direction:column",
    "height:188px",
    "min-height:0",
    "background:var(--editor-panel,#191919)",
    "border-top:1px solid var(--border,#3a3a3a)",
  ].join(";");
  root.appendChild(bottomDock);

  const dockTabBar = host.ownerDocument.createElement("div");
  dockTabBar.style.cssText = [
    "flex:0 0 auto",
    "display:flex",
    "align-items:center",
    "gap:6px",
    "height:32px",
    "padding:0 8px",
    "box-sizing:border-box",
    "background:var(--card,#1c1c1c)",
    "border-bottom:1px solid var(--border,#3a3a3a)",
  ].join(";");
  const mkDockTab = (iconName: string, label: string): HTMLButtonElement => {
    const b = host.ownerDocument.createElement("button");
    b.style.cssText = [
      "display:inline-flex",
      "align-items:center",
      "background:transparent",
      "color:var(--muted-foreground)",
      "border:none",
      "border-radius:6px",
      "padding:4px 10px",
      "cursor:pointer",
      "font:12px system-ui,sans-serif",
    ].join(";");
    appendLabelWithIcon(host.ownerDocument, b, iconName, label, 14);
    return b;
  };
  const dockTimelineTab = mkDockTab("clock", t("editor.dock.timeline"));
  const dockNotesTab = mkDockTab("sticky-note", t("editor.dock.notes"));
  const dockLectureTab = mkDockTab("video", t("editor.dock.lecture"));
  const dockCloseBtn = mkLucideIconButton(
    host.ownerDocument,
    "x",
    "",
    t("editor.dock.close"),
    14,
  );
  dockCloseBtn.style.cssText = [
    "margin-left:auto",
    "flex:0 0 auto",
    "width:28px",
    "height:28px",
    "padding:0",
    "background:transparent",
    "color:var(--muted-foreground)",
    "border:none",
    "border-radius:6px",
    "cursor:pointer",
    "display:inline-flex",
    "align-items:center",
    "justify-content:center",
  ].join(";");
  dockCloseBtn.addEventListener("mouseenter", () => {
    dockCloseBtn.style.background = "var(--accent)";
    dockCloseBtn.style.color = "var(--foreground)";
  });
  dockCloseBtn.addEventListener("mouseleave", () => {
    dockCloseBtn.style.background = "transparent";
    dockCloseBtn.style.color = "var(--muted-foreground)";
  });
  dockTabBar.append(dockTimelineTab, dockNotesTab, dockLectureTab, dockCloseBtn);

  const dockBody = host.ownerDocument.createElement("div");
  dockBody.style.cssText = "flex:1 1 0;min-height:0;position:relative;";
  bottomDock.append(dockTabBar, dockBody);

  // 动画时间轴挂这里（保持原 mountAnimTimeline 目标）。
  const timelineHost = host.ownerDocument.createElement("div");
  timelineHost.style.cssText = ["position:absolute", "inset:0", "min-height:0", "overflow:hidden"].join(";");
  dockBody.appendChild(timelineHost);
  const lectureHost = host.ownerDocument.createElement("div");
  lectureHost.style.cssText = ["position:absolute", "inset:0", "min-height:0", "overflow:hidden", "display:none"].join(";");
  dockBody.appendChild(lectureHost);

  // 状态栏：贴最底部。左端视图下拉，正中宿主保存/提示，右端底栏下拉。
  const statusBar = host.ownerDocument.createElement("div");
  statusBar.className = "ppt-status-bar";
  statusBar.style.cssText = [
    `grid-row:${statusGridRow}`,
    "grid-column:1",
    "display:flex",
    "align-items:center",
    "gap:12px",
    "padding:0 8px",
    "position:relative",
    "background:var(--editor-header,#181818)",
    "color:var(--muted-foreground)",
    "border-top:1px solid var(--border,#3a3a3a)",
    "font:var(--chrome-bar-font, 12px) system-ui,sans-serif",
    "height:32px",
    "box-sizing:border-box",
    "user-select:none",
  ].join(";");
  const statusSlide = host.ownerDocument.createElement("span");
  const statusCluster = host.ownerDocument.createElement("div");
  statusCluster.className = "ppt-status-cluster";
  statusCluster.style.cssText = [
    "position:absolute",
    "left:50%",
    "top:50%",
    "transform:translate(-50%,-50%)",
    "display:flex",
    "align-items:center",
    "gap:4px",
    "max-width:min(560px,62%)",
    "pointer-events:none",
  ].join(";");
  const statusHost = host.ownerDocument.createElement("span");
  statusHost.dataset.pptStatusHost = "1";
  statusHost.style.cssText = [
    "min-width:0",
    "overflow:hidden",
    "text-overflow:ellipsis",
    "white-space:nowrap",
    "text-align:center",
  ].join(";");
  statusHost.hidden = true;
  const statusAction = host.ownerDocument.createElement("button");
  statusAction.type = "button";
  statusAction.className = "ppt-status-action-btn";
  statusAction.hidden = true;
  statusAction.style.pointerEvents = "auto";
  let statusActionHandler: (() => void) | null = null;
  statusAction.addEventListener("click", (ev) => {
    ev.stopPropagation();
    statusActionHandler?.();
  });
  statusCluster.append(statusHost, statusAction);
  const setHostStatus = (
    msg: string,
    kind: "info" | "ok" | "err" = "info",
    action: { label: string; onClick: () => void } | null = null,
  ): void => {
    statusHost.textContent = msg;
    statusHost.title = msg;
    statusHost.hidden = !msg;
    statusHost.style.color =
      kind === "err" ? "var(--destructive)" : kind === "ok" ? "var(--success)" : "var(--muted-foreground)";
    const showAction = Boolean(msg && action);
    statusActionHandler = showAction ? action!.onClick : null;
    statusAction.hidden = !showAction;
    statusAction.textContent = showAction ? action!.label : "";
    if (showAction) {
      statusAction.title = action!.label;
      statusAction.setAttribute("aria-label", action!.label);
    } else {
      statusAction.removeAttribute("title");
      statusAction.removeAttribute("aria-label");
    }
  };
  // 离散缩放档位：0.1 / 0.25 / 0.5 / 0.75 / 1 / 1.25 / 1.5 / 2 / 3 / 4（视图条 − / +）。
  const ZOOM_STEPS = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
  const stepZoom = (dir: -1 | 1): void => {
    const cur = zoomMode === "fit" ? stageScale : (zoomMode as number);
    const i =
      dir > 0
        ? ZOOM_STEPS.findIndex((v) => v > cur + 1e-4)
        : ZOOM_STEPS.map((v, idx) => (v < cur - 1e-4 ? idx : -1)).filter((idx) => idx >= 0).pop() ?? -1;
    if (i < 0) return;
    setZoom(ZOOM_STEPS[i]!);
  };
  const statusSpacer = host.ownerDocument.createElement("span");
  statusSpacer.style.flex = "1";
  statusBar.append(statusSlide, statusCluster, statusSpacer);
  root.appendChild(statusBar);

  const refreshStatus = (): void => {
    if (editorContext.kind === "notesMaster") {
      statusSlide.textContent = t("editor.status.notesMaster");
    } else if (editorContext.kind === "handoutMaster") {
      statusSlide.textContent = t("editor.status.handoutMaster");
    } else if (editorContext.kind === "master") {
      statusSlide.textContent = t("editor.status.slideMaster");
    } else {
      const prot = getPresentationProtection(pres);
      if (prot) {
        const badge = prot.kind === "final" ? t("protect.badgeFinal") : t("protect.badgeRestricted");
        const office =
          pres.modifyVerifier && summarizeOfficeModifyVerifier(pres.modifyVerifier)
            ? ` · ${t("protect.badgeOffice")}`
            : "";
        statusSlide.textContent = `${badge}${office}`;
      } else {
        statusSlide.textContent = "";
      }
    }
    refreshZoomChrome?.();
  };

  // 面板开关状态。隐藏时同步调整 grid-template，让舞台铺满。
  // 属性栏默认收起（连竖向 Tab 一起），视图条「属性栏」按钮或聚焦动画 / 切换时打开。
  let rightPanelOpen = false;
  // 备注/时间轴默认收起。状态栏右端「面板」下拉可开时间轴或备注。
  // 用户点「动画」时自动展开时间轴；若用户把它关掉，同一轮编辑里不再自动弹回。
  let dockOpen = false;
  let dockTab: "timeline" | "notes" | "lecture" = "notes";
  let lecturePanel: LecturePanel | null = null;
  let timelineDismissed = false;
  let refreshZoomChrome: (() => void) | undefined;
  const applyRightPanelLayout = (): void => {
    const reading = presentationView === "reading";
    rightPanel.style.display = !reading && rightPanelOpen ? "flex" : "none";
    rightBody.style.display = !reading && rightPanelOpen ? "flex" : "none";
    rightTabBar.style.borderLeft = !reading && rightPanelOpen
      ? "1px solid var(--border,#3a3a3a)"
      : "none";
    rightCloseBtn.style.visibility = !reading && rightPanelOpen ? "visible" : "hidden";
    updateGridTemplate();
    refreshRibbonToggles?.();
    queueMicrotask(() => {
      fitStage();
      renderOverlay();
    });
  };
  const phoneChromeQuery = host.ownerDocument.defaultView?.matchMedia("(max-width: 720px)");
  const phoneChrome = (): boolean => phoneChromeQuery?.matches ?? false;
  const updateGridTemplate = (): void => {
    const reading = presentationView === "reading";
    const cover = !reading && rightPanelOpen && phoneChrome();
    root.classList.toggle("ppt-right-panel-cover", cover);
    root.style.gridTemplateColumns = !reading && rightPanelOpen && !cover
      ? `minmax(0,1fr) ${rightPanelWidth}px`
      : "minmax(0,1fr) 0";
    if (cover) {
      rightPanel.style.gridColumn = "1";
      rightPanel.style.gridRow = String(stageGridRow);
      rightPanel.style.zIndex = "30";
      rightPanel.style.width = "100%";
      rightPanel.style.height = "100%";
    } else {
      rightPanel.style.gridColumn = "2";
      rightPanel.style.gridRow = `${stageGridRow} / -1`;
      rightPanel.style.zIndex = "";
      rightPanel.style.width = "";
      rightPanel.style.height = "";
    }
    // 行定义必须与 stage/dock/command/status 的 grid-row 一致；漏掉状态栏行或把 1fr
    // 分给空行，都会把舞台压到底部。
    root.style.gridTemplateRows = gridRowsTemplate(dockOpen);
  };
  phoneChromeQuery?.addEventListener("change", () => applyRightPanelLayout());
  let rightPanelFitQueued = false;
  const scheduleRightPanelFit = (): void => {
    if (rightPanelFitQueued) return;
    rightPanelFitQueued = true;
    queueMicrotask(() => {
      rightPanelFitQueued = false;
      fitStage();
      renderOverlay();
    });
  };
  const applyRightPanelWidth = (px: number, persist: boolean): void => {
    rightPanelWidth = clampRightPanel(px);
    rightResizer.setAttribute("aria-valuenow", String(rightPanelWidth));
    updateGridTemplate();
    if (persist) {
      try {
        host.ownerDocument.defaultView?.localStorage.setItem(RIGHT_PANEL_WIDTH_KEY, String(rightPanelWidth));
      } catch {
        /* private mode or blocked storage */
      }
    }
    scheduleRightPanelFit();
  };
  const rightPanelWidthFromPointer = (clientX: number): number => {
    const right = root.getBoundingClientRect().right;
    return clampRightPanel(right - clientX);
  };
  rightResizer.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    if (!rightPanelOpen || presentationView === "reading") return;
    e.preventDefault();
    rightResizer.setPointerCapture(e.pointerId);
    host.ownerDocument.body.classList.add("ppt-right-panel-resizing");
    const move = (ev: PointerEvent): void => {
      applyRightPanelWidth(rightPanelWidthFromPointer(ev.clientX), false);
    };
    const up = (ev: PointerEvent): void => {
      rightResizer.removeEventListener("pointermove", move);
      rightResizer.removeEventListener("pointerup", up);
      rightResizer.removeEventListener("pointercancel", up);
      if (rightResizer.hasPointerCapture(ev.pointerId)) rightResizer.releasePointerCapture(ev.pointerId);
      host.ownerDocument.body.classList.remove("ppt-right-panel-resizing");
      applyRightPanelWidth(rightPanelWidthFromPointer(ev.clientX), true);
    };
    rightResizer.addEventListener("pointermove", move);
    rightResizer.addEventListener("pointerup", up);
    rightResizer.addEventListener("pointercancel", up);
  });
  rightResizer.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    if (!rightPanelOpen || presentationView === "reading") return;
    e.preventDefault();
    const cur = Number(rightResizer.getAttribute("aria-valuenow")) || RIGHT_PANEL_DEFAULT;
    applyRightPanelWidth(cur + (e.key === "ArrowLeft" ? 16 : -16), true);
  });
  rightResizer.addEventListener("dblclick", () => {
    if (!rightPanelOpen || presentationView === "reading") return;
    applyRightPanelWidth(RIGHT_PANEL_DEFAULT, true);
  });
  const togglePropertiesPanel = (): boolean => {
    rightPanelOpen = !rightPanelOpen;
    applyRightPanelLayout();
    return rightPanelOpen;
  };
  // dock tab 切换 + 显隐：refreshDockTabs 仅切内容；showDock 改整块显隐并重排舞台。
  // 注意 syncNotesPane / animTimeline?.refresh 在备注/时间轴面板初始化后才存在，
  // 这里用可选的 hook 持有，避免前向引用。
  let onDockTabActivate: ((tab: "timeline" | "notes" | "lecture") => void) | undefined;
  // toolbar 在后面才构造；切 dock 后回调它刷新 ribbon，让「时间轴/备注」两个互斥
  // toggle 按钮的高亮同步（live getter + 一次 refresh）。
  let refreshRibbonToggles: (() => void) | undefined;
  const refreshDockTabs = (): void => {
    const styleTab = (btn: HTMLButtonElement, on: boolean): void => {
      btn.style.color = on ? "var(--foreground)" : "var(--muted-foreground)";
      btn.style.background = on ? "var(--editor-tab-active,var(--accent,#333333))" : "transparent";
    };
    styleTab(dockTimelineTab, dockTab === "timeline");
    styleTab(dockNotesTab, dockTab === "notes");
    styleTab(dockLectureTab, dockTab === "lecture");
    timelineHost.style.display = dockTab === "timeline" ? "block" : "none";
    notesContent.style.display = dockTab === "notes" ? "flex" : "none";
    lectureHost.style.display = dockTab === "lecture" ? "flex" : "none";
    bottomDock.style.height = dockTab === "lecture" ? "248px" : "188px";
    lecturePanel?.setActive(dockOpen && dockTab === "lecture");
    queueMicrotask(() => {
      fitStage();
      renderOverlay();
    });
  };
  const showDock = (open: boolean): void => {
    dockOpen = open;
    bottomDock.style.display = open ? "flex" : "none";
    updateGridTemplate();
    refreshRibbonToggles?.();
    queueMicrotask(() => {
      fitStage();
      renderOverlay();
    });
  };
  const setDockTab = (tab: "timeline" | "notes" | "lecture"): void => {
    dockTab = tab;
    refreshDockTabs();
    onDockTabActivate?.(tab);
    refreshRibbonToggles?.();
  };
  // 普通编辑之外（阅读 / 浏览 / 备注页）不抢底栏。animation：用户关掉之后不再自动打开。
  const openTimeline = (reason: "explicit" | "animation"): boolean => {
    if (presentationView !== "normal") return dockOpen && dockTab === "timeline";
    if (reason === "animation" && timelineDismissed) return false;
    if (reason === "explicit") timelineDismissed = false;
    setDockTab("timeline");
    if (!dockOpen) showDock(true);
    return true;
  };
  dockTimelineTab.addEventListener("click", () => {
    openTimeline("explicit");
  });
  dockNotesTab.addEventListener("click", () => {
    if (!dockOpen) showDock(true);
    setDockTab("notes");
  });
  dockLectureTab.addEventListener("click", () => {
    if (!dockOpen) showDock(true);
    setDockTab("lecture");
  });
  dockCloseBtn.addEventListener("click", () => {
    if (dockTab === "timeline") timelineDismissed = true;
    showDock(false);
  });
  rightCloseBtn.addEventListener("click", () => {
    if (rightPanelOpen) togglePropertiesPanel();
  });
  // ribbon「底部面板」：只切换 dock 整体显隐，保留当前 tab —— 时间轴 / 备注 的切换
  // 完全交给 dock 内的 tab，避免"切时间轴把备注也带没了"的耦合。
  const toggleDockPanel = (): boolean => {
    if (dockOpen && dockTab === "timeline") timelineDismissed = true;
    showDock(!dockOpen);
    return dockOpen;
  };

  const stage = host.ownerDocument.createElement("div");
  stage.style.position = "relative";
  // 舞台里的 scene 是「渲染预览」，不应被当成文本选区：否则点击元素拖动 8 点缩放 /
  // 框选 / 移动时，鼠标扫过场景文字会触发浏览器原生文本选中（蓝色高亮）。双击进入的
  // contentEditable 编辑器挂在 stageWrap（stage 的兄弟）上，不受此影响，仍可正常选字。
  stage.style.userSelect = "none";
  (stage.style as CSSStyleDeclaration & { webkitUserSelect?: string }).webkitUserSelect = "none";
  stageCenter.appendChild(stage);

  const altViewHost = host.ownerDocument.createElement("div");
  altViewHost.style.cssText = "position:absolute;inset:0;display:none;z-index:2";
  stageHost.appendChild(altViewHost);

  const rulerTop = host.ownerDocument.createElement("div");
  rulerTop.style.cssText =
    "position:absolute;top:0;left:20px;right:0;height:18px;display:none;background:var(--card,#1c1c1c);border-bottom:1px solid var(--border);overflow:hidden;pointer-events:none;z-index:3;font:9px/18px ui-monospace,monospace;color:var(--muted-foreground)";
  const rulerLeft = host.ownerDocument.createElement("div");
  rulerLeft.style.cssText =
    "position:absolute;top:18px;left:0;bottom:0;width:20px;display:none;background:var(--card,#1c1c1c);border-right:1px solid var(--border);overflow:hidden;pointer-events:none;z-index:3;font:9px ui-monospace,monospace;color:var(--muted-foreground)";
  stageHost.appendChild(rulerTop);
  stageHost.appendChild(rulerLeft);

  const overlay = host.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "svg");
  overlay.style.position = "absolute";
  overlay.style.inset = "0";
  overlay.style.pointerEvents = "none";
  overlay.style.overflow = "visible";
  overlay.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  stage.appendChild(overlay);

  const rawStackUndo = stack.undo.bind(stack);
  const rawStackRedo = stack.redo.bind(stack);
  stack.undo = (): boolean => {
    const label = stack.info().undoLabel;
    const ok = rawStackUndo();
    if (ok && label) editorPlugins?.notifyCommand({ label, kind: "undo" });
    return ok;
  };
  stack.redo = (): boolean => {
    const label = stack.info().redoLabel;
    const ok = rawStackRedo();
    if (ok && label) editorPlugins?.notifyCommand({ label, kind: "redo" });
    return ok;
  };
  const rawStackJumpTo = stack.jumpTo.bind(stack);
  stack.jumpTo = (mark: number): number => {
    const before = stack.size();
    const n = rawStackJumpTo(mark);
    if (n > 0) {
      editorPlugins?.notifyCommand({
        label: stack.info().undoLabel ?? "History",
        kind: mark < before ? "undo" : "redo",
      });
    }
    return n;
  };

  const gotoSlideRef: { fn: (i: number) => void } = { fn: () => {} };

  editorPlugins = createEditorPluginRuntime(
    {
      doc: host.ownerDocument,
      host,
      root,
      stage,
      locale: opts.locale ?? getLocale(),
      getPresentation: () => pres,
      getSlideIndex: () => index,
      getSelectedShapeIds: () => selection.values,
      execute: (cmd) => stack.execute(cmd),
      undo: () => stack.undo(),
      redo: () => stack.redo(),
      stackInfo: () => stack.info(),
      gotoSlide: (i) => gotoSlideRef.fn(i),
    },
    opts.plugins ?? [],
  );

  let editorPluginExtras: EditorPluginCatalogEntry[] = opts.availableEditorPlugins ?? [];
  let editorPluginCatalog = mergeEditorPluginCatalog(editorPluginExtras);
  let editorPluginCatalogById = new Map(editorPluginCatalog.map((e) => [e.id, e]));
  const rebuildEditorPluginCatalog = (): void => {
    editorPluginCatalog = mergeEditorPluginCatalog(editorPluginExtras);
    editorPluginCatalogById = new Map(editorPluginCatalog.map((e) => [e.id, e]));
  };
  const enabledEditorPlugins = new Set<string>();
  if (opts.enabledEditorPlugins) {
    for (const id of opts.enabledEditorPlugins) {
      if (editorPluginCatalogById.has(id)) enabledEditorPlugins.add(id);
    }
  } else {
    for (const e of editorPluginCatalog) {
      if (e.defaultEnabled) enabledEditorPlugins.add(e.id);
    }
  }
  for (const id of enabledEditorPlugins) {
    const entry = editorPluginCatalogById.get(id);
    if (entry && !editorPlugins.list().includes(id)) {
      void editorPlugins.register(entry.create());
    }
  }

  let runtime: Runtime | null = null;
  let index = Math.max(0, Math.min(opts.initialSlide ?? 0, pres.slides.length - 1));
  // ECMA-376 §20.1.5.5 scene3d / §20.1.5.12 sp3d — 编辑器同样要把 image shape 的
  // 3D 信息烘成 PNG，否则切到含 sp3d 的 slide 时只看到一张扁平 2D 图（svg-backend
  // 已经移除了 CSS 3D fallback，bake 才是唯一 3D 渲染路径）。每次 drawSlide 都把
  // 同一个 bakeRuntime 应用到新 scene；实例内部记 baked Set 防同一 shape 重复 bake，
  // 跨 slide 切换 / backend 切换都不会重复跑 WebGL。
  // bake 完成后通过 onSlideBaked 通知宿主，让 playground 把对应缩略图也刷成 baked
  // 状态——shape.src/bbox 被 bake mutate 后，缩略图重建 Scene 即可拿到 baked PNG。
  const bakeRuntime: Bake3DRuntime = createBake3DRuntime({
    onSlideBaked: (s) => {
      const idx = pres.slides.indexOf(s);
      if (idx >= 0) opts.onSlideBaked?.(s, idx);
    },
  });
  let stageScale = 1;
  let zoomMode: "fit" | number = "fit";
  // 当前打开的行内文本编辑器（双击文本框进入的 contenteditable overlay）。切页 /
  // 缩放 / 销毁都必须经由它收口，否则 overlay 会残留在舞台上，而且提交时读到的
  // `index` 已经变成新的一页 → 文字被写进错误的 slide。声明必须在 fitStage /
  // drawSlide 之前，两者在 mount 期就会被调用（否则触发 TDZ）。
  let activeTextEdit: {
    close: (commit: boolean) => void;
    targetId: string;
    editor: HTMLElement;
    charRanges: () => TextCharRange[] | null;
    syncFromModel: () => void;
    hideSource: () => void;
  } | null = null;
  const FORMAT_CHROME = ".ppt-inspector, .ppt-command-strip, .ppt-selection-format, .ui-combobox-menu";
  let gridOn = false;
  let gridEl: SVGGElement | null = null;
  let guideAidColor = readAidColor(aidColorStore(), GUIDE_AID_COLOR_KEY, DEFAULT_GUIDE_AID_COLOR);
  let gridAidColor = readAidColor(aidColorStore(), GRID_AID_COLOR_KEY, DEFAULT_GRID_AID_COLOR);
  let guideAidOpacity = readAidOpacity(aidColorStore(), GUIDE_AID_OPACITY_KEY, DEFAULT_AID_OPACITY);
  let gridAidOpacity = readAidOpacity(aidColorStore(), GRID_AID_OPACITY_KEY, DEFAULT_AID_OPACITY);
  const commitAidColor = (key: string, color: string, assign: (next: string) => void): void => {
    const next = normalizeAidColor(color);
    if (!next) return;
    assign(next);
    writeAidColor(aidColorStore(), key, next);
    renderOverlay();
  };
  const commitAidOpacity = (key: string, opacity: number, assign: (next: number) => void): void => {
    const next = normalizeAidOpacity(String(opacity));
    if (next == null) return;
    assign(next);
    writeAidOpacity(aidColorStore(), key, next);
    renderOverlay();
  };
  let snapToGrid = false;
  let snapToShapes = true;
  // marquee 框选状态：在 stage 坐标系中描述。
  let marqueeBox: Rect | null = null;
  let pendingShapeKind: InsertShapeKind | null = null;
  let commentPlacementOn = false;
  let spellingEnabled = true;
  type ColorViewMode = "color" | "grayscale" | "blackWhite";
  let colorViewMode: ColorViewMode = "color";
  const updateShapeDrawCursor = (): void => {
    if (panState || spaceHeld) return;
    if (
      (pendingShapeKind || commentPlacementOn) &&
      presentationView === "normal" &&
      !isMasterEditContext(editorContext)
    ) {
      stageWrap.style.cursor = "crosshair";
      return;
    }
    stageWrap.style.cursor = "";
  };
  const applyColorViewMode = (): void => {
    if (colorViewMode === "color") stage.style.filter = "";
    else if (colorViewMode === "grayscale") stage.style.filter = "grayscale(1)";
    else stage.style.filter = "grayscale(1) contrast(1.35) brightness(0.95)";
  };
  // 智能参考线：拖动 / resize 过程中实时计算并 snap。
  let guides: Guide[] = [];
  let presentationView: PresentationViewMode = "normal";
  let altView: PresentationViewHost | null = null;
  let rulersOn = false;
  let staticGuidesOn = false;
  const staticGuideLines = { v: [] as number[], h: [] as number[] };
  let readingSavedLayout: { rightPanel: boolean; dock: boolean } | null = null;
  let guidePlacement: { orient: "v" | "h"; at: number } | null = null;
  /** Assigned after slideshow locals exist; stack.subscribe calls it on undo/collab. */
  let syncSlideshowLocalsFromPres = (): void => {};

  const persistViewGuides = (): void => {
    const prev = pres.viewGuides;
    const next = {
      ...prev,
      slide: [
        ...staticGuideLines.v.map((pos) => ({ orient: "vert" as const, pos })),
        ...staticGuideLines.h.map((pos) => ({ orient: "horz" as const, pos })),
      ],
      showGuides: staticGuidesOn,
      snapToGrid,
      snapToObjects: snapToShapes,
    };
    if (viewGuidesSnapshot(next) === viewGuidesSnapshot(prev)) return;
    try {
      stack.execute(new SetViewGuidesCmd(next));
    } catch (e) {
      if (!isEditingBlockedError(e)) throw e;
    }
    // 保护态下 execute 会 toast 并抛 EditingBlockedError：从 pres 回读，避免本地 UI 脏掉。
    hydrateViewGuides();
  };

  const hydrateViewGuides = (): void => {
    const g = pres.viewGuides;
    staticGuideLines.v = [];
    staticGuideLines.h = [];
    for (const line of g?.slide ?? []) {
      if (line.orient === "horz") staticGuideLines.h.push(line.pos);
      else staticGuideLines.v.push(line.pos);
    }
    if (g?.showGuides !== undefined) staticGuidesOn = g.showGuides;
    if (g?.snapToGrid !== undefined) snapToGrid = g.snapToGrid;
    if (g?.snapToObjects !== undefined) snapToShapes = g.snapToObjects;
    syncRulerPointerEvents();
  };

  const syncRulerPointerEvents = (): void => {
    const on = staticGuidesOn;
    rulerTop.style.pointerEvents = on ? "auto" : "none";
    rulerLeft.style.pointerEvents = on ? "auto" : "none";
    rulerTop.style.cursor = on ? "col-resize" : "default";
    rulerLeft.style.cursor = on ? "row-resize" : "default";
  };
  hydrateViewGuides();

  const updateRulers = (): void => {
    if (!rulersOn) {
      rulerTop.style.display = "none";
      rulerLeft.style.display = "none";
      return;
    }
    rulerTop.style.display = "block";
    rulerLeft.style.display = "block";
    const sw = pres.size.width;
    const sh = pres.size.height;
    const step = sw >= 1920 ? 100 : 50;
    const topTicks: string[] = [];
    for (let x = 0; x <= sw; x += step) topTicks.push(`<span style="position:absolute;left:${x * stageScale}px;transform:translateX(-50%)">${x}</span>`);
    rulerTop.innerHTML = topTicks.join("");
    const leftTicks: string[] = [];
    for (let y = 0; y <= sh; y += step) {
      leftTicks.push(`<span style="position:absolute;top:${y * stageScale}px;left:2px;transform:translateY(-50%)">${y}</span>`);
    }
    rulerLeft.innerHTML = leftTicks.join("");
  };

  let endCropSession: (commit: boolean) => void = () => {};
  let endCropIfSelectionLeft: (ids: ReadonlySet<string>) => void = () => {};
  let cropSession: {
    id: string;
    snap: Map<string, { bbox: Rect; line?: { x1: number; y1: number; x2: number; y2: number }; points?: Array<[number, number]>; pathD?: string; textWrap?: boolean | null }>;
    originCrop: CropInsets;
    originFit?: "fill" | "contain" | "cover" | "tile";
  } | null = null;

  const applyPresentationView = (mode: PresentationViewMode): void => {
    const leavingMaster = isMasterEditContext(editorContext);
    if (leavingMaster) {
      editorContext = { kind: "slides" };
    }
    if (presentationView === "reading" && mode !== "reading" && readingSavedLayout) {
      rightPanelOpen = readingSavedLayout.rightPanel;
      showDock(readingSavedLayout.dock);
      readingSavedLayout = null;
    }
    presentationView = mode;
    root.classList.toggle("ppt-reading", mode === "reading");
    root.classList.toggle("ppt-sorter", mode === "sorter");
    stageWrap.style.inset = mode === "reading" ? "32px" : `${STAGE_PADDING}px`;
    opts.onPresentationViewChange?.(mode);
    if (mode !== "normal") {
      cancelCommentPlacement();
      endCropSession(true);
    }
    altView?.destroy();
    altView = null;
    if (mode === "normal") {
      stageWrap.style.display = "";
      altViewHost.style.display = "none";
      drawSlide(index);
    } else if (mode === "reading") {
      if (!readingSavedLayout) readingSavedLayout = { rightPanel: rightPanelOpen, dock: dockOpen };
      rightPanelOpen = false;
      rightPanel.style.display = "none";
      showDock(false);
      stageWrap.style.display = "";
      altViewHost.style.display = "none";
      selection.clear();
      setZoom("fit");
      drawSlide(index);
    } else {
      stageWrap.style.display = "none";
      altViewHost.style.display = "block";
      const onPick = (i: number): void => {
        drawSlide(i);
        if (mode !== "notesPage") applyPresentationView("normal");
      };
      if (mode === "sorter") {
        altView = mountSlideSorterView(altViewHost, {
          pres,
          getCurrentIndex: () => index,
          onSelect: onPick,
          onMoveSlide: (from, to) => {
            stack.execute(new MoveSlideCmd(from, to));
            index = remapIndexAfterSlideMove(from, to, index);
            altView?.refresh();
          },
        });
      } else if (mode === "outline") {
        altView = mountOutlineView(altViewHost, { pres, currentIndex: index, onSelect: onPick });
      } else {
        altView = mountNotesPageView(altViewHost, {
          pres,
          getCurrentIndex: () => index,
          spellcheck: spellingEnabled,
          onSelect: (i) => {
            drawSlide(i);
          },
          getNotes: (i) => pres.slides[i]?.notes ?? "",
          onNotesChange: (i, notes) => {
            stack.execute(new SetSlideNotesCmd(i, notes));
          },
        });
      }
    }
    applyRightPanelLayout();
    if (mode === "reading") root.focus({ preventScroll: true });
    if (mode === "normal" || mode === "reading") {
      host.ownerDocument.defaultView?.requestAnimationFrame(() => {
        if (presentationView === mode) fitStage();
      });
    }
    if (leavingMaster) syncNotesPane();
    refreshRibbonToggles?.();
  };

  let syncFormatBar = (): void => {};
  let scheduleSyncFormatBar = (): void => {};
  let formatBarRaf = 0;

  const fitStage = (): void => {
    const { width: sw, height: sh } = viewCanvasSize();
    if (!sw || !sh) return;
    // stageWrap 自身 inset:STAGE_PADDING 已经把视觉边距内缩到 stageHost 里了，
    // 所以这里直接拿 clientWidth/Height 当作 fit 模式的可用区即可。
    const aw = stageWrap.clientWidth;
    const ah = stageWrap.clientHeight;
    if (aw <= 0 || ah <= 0) return;
    let scale: number;
    if (zoomMode === "fit") {
      scale = Math.min(aw / sw, ah / sh);
    } else {
      scale = zoomMode;
    }
    if (!Number.isFinite(scale) || scale <= 0) return;
    // 缩放 / 窗口尺寸变了，行内文本编辑器的 px 几何（位置、字号、行距）整套都失效。
    // 提交并关掉比"留一个错位的编辑框"更可预期；文字不会丢。
    if (scale !== stageScale) activeTextEdit?.close(true);
    const w = sw * scale;
    const h = sh * scale;
    stage.style.width = w + "px";
    stage.style.height = h + "px";
    stage.style.transform = "";
    stage.style.flex = "0 0 auto";
    overlay.setAttribute("viewBox", `0 0 ${sw} ${sh}`);
    overlay.setAttribute("preserveAspectRatio", "xMidYMid meet");
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    stageScale = scale;
    updateRulers();
    refreshZoomChrome?.();
    syncFormatBar();
  };

  // 切页后面板刷新的代际。销毁或再次切页时递增，让已经排队的回调空返。
  let slideChromeToken = 0;
  let slideChromeTimer = 0;
  const teardown = (): void => {
    slideChromeToken++;
    const win = host.ownerDocument.defaultView;
    if (slideChromeTimer) {
      win?.clearTimeout(slideChromeTimer);
      slideChromeTimer = 0;
    }
    activeTextEdit?.close(true);
    if (runtime) {
      runtime.detach();
      runtime = null;
    }
  };

  // 阶段 2.2：母版视图。editorContext 默认 slides；切到 master 后 buildScene 用
  // 当前 layout（或 master）的 shapes 临时合成"伪 slide"，复用 createScene 渲染。
  // 退出母版视图后又回到正常 slide 渲染。
  let editorContext: EditorContext = { kind: "slides" };

  const viewCanvasSize = (): { width: number; height: number } => {
    if (editorContext.kind === "notesMaster") return notesCanvasSize(pres);
    if (editorContext.kind === "handoutMaster") return handoutCanvasSize(pres);
    return pres.size;
  };

  const viewSlide = (): Slide | undefined => {
    const real = pres.slides[index];
    if (editorContext.kind === "master") {
      if (!real) return undefined;
      return buildMasterPseudoSlide(pres, editorContext, real);
    }
    if (editorContext.kind === "notesMaster") {
      ensureNotesMasters(pres);
      return buildAuxMasterPseudoSlide(pres, "notesMaster", editorContext.masterId) ?? real;
    }
    if (editorContext.kind === "handoutMaster") {
      ensureHandoutMasters(pres);
      return buildAuxMasterPseudoSlide(pres, "handoutMaster", editorContext.masterId) ?? real;
    }
    return real;
  };

  const viewTarget = (): EditTarget => {
    if (editorContext.kind === "master") {
      return editorContext.layoutId
        ? layoutTarget(editorContext.masterId, editorContext.layoutId)
        : masterTarget(editorContext.masterId);
    }
    if (editorContext.kind === "notesMaster") {
      return notesMasterTarget(editorContext.masterId);
    }
    if (editorContext.kind === "handoutMaster") {
      return handoutMasterTarget(editorContext.masterId);
    }
    return slideTarget(index);
  };

  const renderOverlay = (): void => {
    overlay.replaceChildren();
    gridEl = null;
    if (gridOn) renderGrid();
    const slide = viewSlide();
    if (!slide || presentationView === "reading") {
      scheduleSyncFormatBar();
      return;
    }
    const pxToSlide = stageScale > 0 ? 1 / stageScale : 1;
    const canvas = viewCanvasSize();
    // 背景被选中：画一个覆盖整页的虚线选框（不带 8 个手柄）。
    if (selection.isBackground()) {
      drawBackgroundFrame(host.ownerDocument, overlay, canvas.width, canvas.height, pxToSlide);
    } else {
      for (const id of selection.values) {
        if (id === BACKGROUND_SEL_ID) continue;
        const shape = findShape(slide, id);
        if (!shape) continue;
        if (cropSession?.id === id) {
          drawCropChrome(host.ownerDocument, overlay, shape, pxToSlide, findShapeAncestors(slide, id));
          continue;
        }
        drawShapeSelectionFrame(
          host.ownerDocument,
          overlay,
          shape,
          pxToSlide,
          findShapeAncestors(slide, id),
        );
      }
    }
    // marquee 框
    if (marqueeBox) drawMarquee(host.ownerDocument, overlay, marqueeBox);
    // 智能参考线（拖动时）
    for (const gd of guides) drawGuide(host.ownerDocument, overlay, gd, canvas.width, canvas.height);
    // 静态参考线（View → Guides）
    if (staticGuidesOn) {
      for (const x of staticGuideLines.v) {
        drawStaticGuide(host.ownerDocument, overlay, { orient: "v", at: x, from: 0, to: canvas.height }, canvas.width, canvas.height, guideAidColor, guideAidOpacity);
      }
      for (const y of staticGuideLines.h) {
        drawStaticGuide(host.ownerDocument, overlay, { orient: "h", at: y, from: 0, to: canvas.width }, canvas.width, canvas.height, guideAidColor, guideAidOpacity);
      }
      if (guidePlacement) {
        const g =
          guidePlacement.orient === "v"
            ? { orient: "v" as const, at: guidePlacement.at, from: 0, to: canvas.height }
            : { orient: "h" as const, at: guidePlacement.at, from: 0, to: canvas.width };
        drawStaticGuide(host.ownerDocument, overlay, g, canvas.width, canvas.height, guideAidColor, guideAidOpacity);
      }
    }
    scheduleSyncFormatBar();
  };

  const buildScene = (slide: Slide): Scene => {
    const size = viewCanvasSize();
    if (editorContext.kind === "master") {
      const pseudo = buildMasterPseudoSlide(pres, editorContext, slide);
      return createScene(pseudo, size);
    }
    if (editorContext.kind === "notesMaster") {
      const pseudo = buildAuxMasterPseudoSlide(pres, "notesMaster", editorContext.masterId);
      if (pseudo) return createScene(pseudo, size);
    }
    if (editorContext.kind === "handoutMaster") {
      const pseudo = buildAuxMasterPseudoSlide(pres, "handoutMaster", editorContext.masterId);
      if (pseudo) return createScene(pseudo, size);
    }
    return createScene(slide, size, { masters: pres.masters });
  };

  // 编辑器舞台不跑 slide 间过渡（仅 player / 放映模式才跑）；这里仅保留可能的旧 ghost
  // 引用，以便 drawSlide 在切页时清理（一般 active 始终为 null）。
  let activeTransitionGhost: HTMLElement | null = null;

  // 备注面板的"立即提交"句柄，在备注面板初始化时赋值（见下方 Speaker Notes 区块）。
  // drawSlide 切页前调用它，把上一页待提交的备注先落库。
  let flushNotesCommit: (() => void) | undefined;

  const drawSlide = (i: number): void => {
    // 双缓冲式切换：先构造新 backend 并同步刷新到 DOM，再销毁旧 backend；
    // 避免"先空一帧再绘制"的闪屏（拖动 / undo / redo / 频繁重绘场景）。
    // 同一页上改字体 / 字号也会走到这里。编辑框挂在 stageWrap，不在被拆掉的
    // 场景节点里；这时关掉它，字符选区就没了，下一次字号会改到整段。
    // 切页、或正在编辑的形状已经不在这一页上，才提交并关闭。
    const nextIndex = Math.max(0, Math.min(i, pres.slides.length - 1));
    const leavingSlide = nextIndex !== index;
    const editTarget = activeTextEdit?.targetId;
    const editStillThere =
      !leavingSlide &&
      !!editTarget &&
      !!pres.slides[nextIndex] &&
      !!findShape(pres.slides[nextIndex]!, editTarget);
    if (!editStillThere) activeTextEdit?.close(true);
    const oldRuntime = runtime;
    const prevIndex = index;
    // 切页前先把上一页待提交的备注落库（commitNotes 用当前仍是旧值的 index）。
    if (Math.max(0, Math.min(i, pres.slides.length - 1)) !== prevIndex) {
      flushNotesCommit?.();
      if (!committingLive) commitLivePreview();
      endCropSession(true);
    }
    index = Math.max(0, Math.min(i, pres.slides.length - 1));
    const slideChanged = index !== prevIndex;
    // 切页时清掉跨 slide 残留的 marquee / 参考线 / 拖动状态。
    if (slideChanged) {
      marqueeBox = null;
      guides = [];
      drag = null;
      pendingShapeKind = null;
      updateShapeDrawCursor();
    }
    const slide = pres.slides[index];
    if (!slide) {
      if (oldRuntime) oldRuntime.detach();
      runtime = null;
      return;
    }
    // 编辑器舞台是"编辑视图"而不是放映视图：用户切页时希望立即看到新 slide 的
    // 可编辑布局，并保留选中 / 拖动 / undo 这类操作的可预测性。slide 间过渡（淡入、
    // 推入、覆盖等）只在 player / 放映模式下才有意义。这里把过渡完全跳过：
    // - 切页瞬时完成，不会克隆 ghost、不会出现"等待动画完成"的卡顿；
    // - selection / overlay / inspector 都能与新 slide 立即对齐；
    // - 旧 backend 仍会被销毁（见下方 oldRuntime.detach()），不会泄漏。
    if (activeTransitionGhost) {
      activeTransitionGhost.remove();
      activeTransitionGhost = null;
    }
    const scene = buildScene(slide);
    const chromeBg = stageChromeBackground(slide);
    stage.style.background = chromeBg;
    const transparentChrome = chromeBg === "transparent";
    // 普通编辑：伸出白色幻灯片的形状仍画在灰色工作区。阅读视图保持裁切。
    const clipToSlide = presentationView !== "normal";
    const be: AnyBackend =
      backend === "svg"
        ? new SvgBackend(scene, stage, { transparent: transparentChrome, clipToSlide })
        : backend === "canvas"
          ? new CanvasBackend(scene, stage, { transparent: transparentChrome })
          : new HybridBackend(scene, stage, { background: chromeBg, clipToSlide });
    // 在销毁旧 backend 之前，强制把新 backend 的 scene 同步绘制到 DOM。
    // 否则新 backend 默认走 rAF 调度，旧 backend 被移除后直到下一帧才有内容。
    be.flush();
    // backend 把 scene 根 SVG / canvas appendChild 到 stage，会成为 overlay 的后兄弟，
    // 在 SVG/HTML 默认绘制顺序下"后兄弟覆盖前兄弟"，导致选中边框 / 手柄被场景内容
    // 完全遮住——既看不到也无法命中。这里把 overlay 重新挪到 stage 最末，保证它一直
    // 显示在场景之上（同时也让 elementFromPoint 优先命中 data-handle 元素）。
    stage.appendChild(overlay);
    runtime = { scene, flush: () => be.flush(), detach: () => be.destroy() };
    // 新内容已经同步写入 DOM。先拆掉旧 backend，再 fit / 量尺寸，避免一次 layout
    // 同时走两套场景树。这里还没把控制权交还浏览器，中间不会画出空白帧。
    if (oldRuntime) oldRuntime.detach();
    // 同 player.ts mount()：让 bakeRuntime 异步烘 sp3d 的 image，写完 setProperty
    // 触发 backend redraw。bakeRuntime 内部 dedupe 同一 shape.id，所以 slide 切回
    // 时不会重复 bake。
    bakeRuntime.kick(slide, scene);
    fitStage();
    applyColorViewMode();
    renderOverlay();
    // 旧 backend 已拆掉，扫描只会落到新场景的 <video>/<audio> 上。
    adaptMediaForEditor(stage, slide);
    // slide 切换时通知右侧/底部面板刷新（drawSlide 自身不会触发 stack，因此面板的
    // stack.subscribe 不会被调用）。Inspector 由 selection 订阅驱动，无需手动刷新。
    // 这些刷新不参与舞台首帧：排到绘制之后，避免全稿审计和功能区重建挡住新页。
    if (slideChanged) scheduleSlideChrome();
    refreshStatus();
    opts.onSlideChange?.(index, pres.slides.length);
  };
  // 切页后刷新功能区、侧栏、备注、批注和时间轴。rAF 在绘制前执行，所以真正的
  // 面板工作放进它排队的 setTimeout，让新 slide 先画出来。
  const runSlideChrome = (): void => {
    animPanel?.refresh();
    animTimeline?.refresh();
    transitionPanel?.refresh();
    // Ribbon 自身的 refresh 由 selection / stack 订阅驱动，但 selection.clear()
    // 在已空时不会触发，导致 ribbon 上"与当前 slide 相关"的 toggle（如「隐藏当前页」）
    // 切页时不刷新。onSlideChangeHooks 里包含 toolbar.refresh。
    for (const fn of onSlideChangeHooks) fn();
    altView?.refresh();
    editorPlugins?.notifySlideChange();
  };
  const scheduleSlideChrome = (): void => {
    const token = ++slideChromeToken;
    const win = host.ownerDocument.defaultView;
    if (!win?.requestAnimationFrame || !win.setTimeout) {
      runSlideChrome();
      return;
    }
    if (slideChromeTimer) {
      win.clearTimeout(slideChromeTimer);
      slideChromeTimer = 0;
    }
    win.requestAnimationFrame(() => {
      if (token !== slideChromeToken) return;
      slideChromeTimer = win.setTimeout(() => {
        slideChromeTimer = 0;
        if (token !== slideChromeToken) return;
        runSlideChrome();
      }, 0);
    });
  };
  const refreshLive = (): void => {
    if (!runtime) {
      drawSlide(index);
      return;
    }
    runtime.scene.root.walk((n) => {
      const t = n.shape.transform;
      n.tx = t?.tx ?? 0;
      n.ty = t?.ty ?? 0;
      n.rotation = t?.rotation ?? 0;
    });
    runtime.flush();
    const slide = viewSlide();
    if (slide) adaptMediaForEditor(stage, slide);
    renderOverlay();
  };
  // drawSlide 在 toolbar 之前定义，无法直接调 toolbar.refresh —— 改成 hook 列表，
  // toolbar 构造完成后再 push 一个 refresh 闭包进来。
  const onSlideChangeHooks: Array<() => void> = [];

  // ==========================================================================
  // 备注（Speaker Notes）—— 作为底部停靠栏的「备注」tab，与动画时间轴共享同一块
  // 底部空间（点 tab 切换，不再各占一行）。编辑走 EditCommand（可撤销 + 触发宿主
  // 自动保存），切页 / 失焦 / 销毁前提交，避免每个字符一条历史。
  // ==========================================================================
  let notesBaseline = ""; // 当前 slide 上次已提交的备注值
  let notesCommitTimer: number | undefined;

  // 备注预览（渲染后的 Markdown）样式：注入一次，scoped 到 .ppt-notes-preview。
  const NOTES_PREVIEW_STYLE_ID = "ppt-notes-preview-style";
  if (!host.ownerDocument.getElementById(NOTES_PREVIEW_STYLE_ID)) {
    const st = host.ownerDocument.createElement("style");
    st.id = NOTES_PREVIEW_STYLE_ID;
    st.textContent = `
.ppt-notes-preview{color:var(--foreground);font:14px/1.65 ui-sans-serif,system-ui,sans-serif;padding:12px 16px;}
.ppt-notes-preview h1,.ppt-notes-preview h2,.ppt-notes-preview h3,.ppt-notes-preview h4,.ppt-notes-preview h5,.ppt-notes-preview h6{margin:.4em 0 .3em;line-height:1.3;font-weight:600;}
.ppt-notes-preview h1{font-size:1.5em;} .ppt-notes-preview h2{font-size:1.3em;} .ppt-notes-preview h3{font-size:1.15em;}
.ppt-notes-preview p{margin:.4em 0;}
.ppt-notes-preview ul,.ppt-notes-preview ol{margin:.3em 0;padding-left:1.5em;}
.ppt-notes-preview li{margin:.15em 0;}
.ppt-notes-preview a{color:var(--primary);text-decoration:underline;}
.ppt-notes-preview code{background:var(--accent);border-radius:3px;padding:1px 4px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.92em;}
.ppt-notes-preview blockquote{margin:.4em 0;padding:.1em 0 .1em .8em;border-left:3px solid var(--border);color:var(--muted-foreground);}
.ppt-notes-preview hr{border:none;border-top:1px solid var(--border);margin:.6em 0;}
.ppt-notes-area::placeholder{color:var(--muted-foreground);opacity:1;}
`;
    host.ownerDocument.head.appendChild(st);
  }

  const notesContent = host.ownerDocument.createElement("div");
  notesContent.style.cssText = [
    "position:absolute",
    "inset:0",
    "display:none",
    "flex-direction:column",
  ].join(";");

  // Markdown 工具栏
  const mdToolbar = host.ownerDocument.createElement("div");
  mdToolbar.style.cssText = [
    "flex:0 0 auto",
    "display:flex",
    "align-items:center",
    "gap:2px",
    "padding:4px 8px",
    "background:var(--editor-panel,#191919)",
    "border-bottom:1px solid var(--border,#3a3a3a)",
  ].join(";");
  const formatBtns: HTMLButtonElement[] = [];
  const mkMdBtn = (
    icon: string,
    titleKey: Parameters<typeof t>[0],
    fn: () => void,
    track = true,
  ): HTMLButtonElement => {
    const b = mkLucideIconButton(host.ownerDocument, icon, "", t(titleKey), 14);
    b.style.cssText = [
      "background:transparent",
      "color:var(--foreground)",
      "border:1px solid transparent",
      "border-radius:4px",
      "width:26px",
      "height:24px",
      "cursor:pointer",
      "display:inline-flex",
      "align-items:center",
      "justify-content:center",
    ].join(";");
    b.addEventListener("mouseenter", () => { if (!b.disabled) b.style.background = "var(--accent,#333333)"; });
    b.addEventListener("mouseleave", () => { b.style.background = "transparent"; });
    b.addEventListener("mousedown", (e) => e.preventDefault()); // 不抢 textarea 选区焦点
    b.addEventListener("click", (e) => {
      e.preventDefault();
      fn();
    });
    mdToolbar.appendChild(b);
    if (track) formatBtns.push(b);
    return b;
  };

  // 在选区两侧包裹标记（无选区时插入占位符并选中占位符文本）。
  const surroundSel = (before: string, after: string, placeholder: string): void => {
    notesArea.focus();
    const s = notesArea.selectionStart;
    const e = notesArea.selectionEnd;
    const val = notesArea.value;
    const sel = val.slice(s, e) || placeholder;
    notesArea.value = val.slice(0, s) + before + sel + after + val.slice(e);
    const cs = s + before.length;
    notesArea.setSelectionRange(cs, cs + sel.length);
    notesArea.dispatchEvent(new Event("input", { bubbles: true }));
  };
  // 给选中的每一行加前缀（列表 / 标题 / 引用）。
  const linePrefix = (mk: (line: string, i: number) => string): void => {
    notesArea.focus();
    const s = notesArea.selectionStart;
    const e = notesArea.selectionEnd;
    const val = notesArea.value;
    const lineStart = val.lastIndexOf("\n", s - 1) + 1;
    let lineEnd = val.indexOf("\n", e);
    if (lineEnd === -1) lineEnd = val.length;
    const block = val.slice(lineStart, lineEnd) || "";
    const transformed = block.split("\n").map(mk).join("\n");
    notesArea.value = val.slice(0, lineStart) + transformed + val.slice(lineEnd);
    notesArea.setSelectionRange(lineStart, lineStart + transformed.length);
    notesArea.dispatchEvent(new Event("input", { bubbles: true }));
  };

  mkMdBtn("bold", "editor.notes.md.bold", () => surroundSel("**", "**", t("editor.notes.md.boldText")));
  mkMdBtn("italic", "editor.notes.md.italic", () => surroundSel("*", "*", t("editor.notes.md.italicText")));
  mkMdBtn("heading", "editor.notes.md.heading", () => linePrefix((ln) => (ln.startsWith("## ") ? ln : `## ${ln}`)));
  mkMdBtn("list", "editor.notes.md.ul", () => linePrefix((ln) => (/^[-*+]\s/.test(ln) ? ln : `- ${ln}`)));
  mkMdBtn("list-ordered", "editor.notes.md.ol", () => linePrefix((ln, i) => (/^\d+\.\s/.test(ln) ? ln : `${i + 1}. ${ln}`)));
  mkMdBtn("quote", "editor.notes.md.quote", () => linePrefix((ln) => (ln.startsWith("> ") ? ln : `> ${ln}`)));
  mkMdBtn("link", "editor.notes.md.link", () => surroundSel("[", "](https://)", t("editor.notes.md.linkText")));
  mkMdBtn("code", "editor.notes.md.code", () => surroundSel("`", "`", t("editor.notes.md.codeText")));

  const mdSpacer = host.ownerDocument.createElement("span");
  mdSpacer.style.flex = "1";
  mdToolbar.appendChild(mdSpacer);
  let notesPreviewOn = false;
  const previewToggleBtn = mkMdBtn("eye", "editor.notes.md.preview", () => setNotesPreview(!notesPreviewOn), false);

  const notesArea = host.ownerDocument.createElement("textarea");
  notesArea.spellcheck = spellingEnabled;
  const syncProofingLang = (): void => {
    notesArea.lang = proofingLangTag(pres);
  };
  syncProofingLang();
  notesArea.placeholder = t("editor.notes.placeholder");
  notesArea.className = "ppt-notes-area";
  notesArea.style.cssText = [
    "flex:1 1 0",
    "min-height:0",
    "resize:none",
    "width:100%",
    "box-sizing:border-box",
    "border:none",
    "background:var(--background)",
    "color:var(--foreground)",
    "caret-color:var(--foreground)",
    "font:14px/1.6 ui-sans-serif,system-ui,sans-serif",
    "padding:12px 16px",
  ].join(";");

  const notesPreview = host.ownerDocument.createElement("div");
  notesPreview.className = "ppt-notes-preview";
  notesPreview.style.cssText = "flex:1 1 0;min-height:0;overflow:auto;display:none;background:var(--background,#18181a);";

  notesContent.append(mdToolbar, notesArea, notesPreview);
  dockBody.appendChild(notesContent);

  const commentAuthor = (): string => opts.commentAuthor?.() ?? "Guest";
  let commentsPanel: ReturnType<typeof mountCommentsPanel> | undefined;
  let commentPins: CommentPinsHandle | undefined;
  let selectedCommentId: string | null = null;
  let commentsMarkupVisible = (pres.comments?.length ?? 0) > 0;
  let inkMode: InkMode | null = null;
  let inkOverlay: InkOverlayHandle | undefined;

  const selectComment = (
    commentId: string,
    opts2?: { refreshPanel?: boolean },
  ): void => {
    const changed = selectedCommentId !== commentId;
    selectedCommentId = commentId;
    if (changed) commentPins?.refresh();
    if (opts2?.refreshPanel) {
      if (changed) commentsPanel?.refresh();
    } else {
      commentsPanel?.syncSelectionHighlight();
    }
  };

  const focusComment = (commentId: string): void => {
    selectComment(commentId, { refreshPanel: true });
    commentsPanel?.scrollToComment(commentId);
  };

  const clearCommentSelection = (): void => {
    if (!selectedCommentId) return;
    selectedCommentId = null;
    commentPins?.refresh();
    commentsPanel?.syncSelectionHighlight();
  };

  root.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const el = e.target as HTMLElement;
    if (el.closest(".ppt-comment-pin")) return;
    if (el.closest("[data-thread-root-id]")) return;
    clearCommentSelection();
  });

  const setCommentsMarkupVisible = (on: boolean): void => {
    commentsMarkupVisible = on;
    commentPins?.refresh();
    toolbar.refresh();
  };

  const addCommentAt = async (
    x: number,
    y: number,
    shapeId?: string,
    compose?: {
      clientX: number;
      clientY: number;
      targetLabel?: string;
      restoreSelection?: () => void;
    },
  ): Promise<void> => {
    let text: string | null = null;
    try {
      text = await openAnchoredCommentDialog(host.ownerDocument, {
        anchor: { x: compose?.clientX ?? 0, y: compose?.clientY ?? 0 },
        ...(compose?.targetLabel ? { targetLabel: compose.targetLabel } : {}),
        participants: commentParticipants((pres.comments ?? []).map((c) => c.author)),
      });
    } finally {
      compose?.restoreSelection?.();
    }
    if (!text) return;
    const id = genCommentId();
    stack.execute(
      new AddCommentCmd({
        id,
        slideIndex: index,
        author: commentAuthor(),
        text,
        createdAt: Date.now(),
        x,
        y,
        ...(shapeId ? { shapeId } : {}),
      }),
    );
    commentsPanel?.refresh();
    commentPins?.refresh();
    focusRightTab("comments");
    focusComment(id);
    if (commentMentionsAi(text)) commentsPanel?.noteAssign(id);
  };

  const cancelCommentPlacement = (): void => {
    if (!commentPlacementOn) return;
    commentPlacementOn = false;
    updateShapeDrawCursor();
  };

  const startCommentPlacement = (): void => {
    if (isMasterEditContext(editorContext)) {
      showToast(t("comments.masterHint"));
      return;
    }
    pendingShapeKind = null;
    inkMode = null;
    inkOverlay?.setMode(null);
    setCommentsMarkupVisible(true);
    commentPlacementOn = true;
    focusRightTab("comments");
    updateShapeDrawCursor();
    showToast(t("comments.placeHint"));
  };

  commentsPanel = mountCommentsPanel(commentsHost, {
    pres,
    stack,
    getSlideIndex: () => index,
    getAuthor: commentAuthor,
    getSelectedId: () => selectedCommentId,
    onJumpToSlide: (idx) => goto(idx),
    onNewComment: () => startCommentPlacement(),
    onSelect: (commentId, silent) => {
      if (selectedCommentId === commentId && silent) return;
      selectComment(commentId, { refreshPanel: !silent });
    },
    onFocusShape: (slideIndex, shapeId) => {
      if (slideIndex !== index) goto(slideIndex);
      const slide = pres.slides[slideIndex];
      if (!slide) return;
      selection.set([findTopLevelId(slide, shapeId) ?? shapeId]);
    },
    onAssignAi: (comment, ui) =>
      opts.onAssignCommentToAi?.(
        {
          id: comment.id,
          slideIndex: comment.slideIndex,
          text: comment.text,
          ...(comment.shapeId ? { shapeId: comment.shapeId } : {}),
          ...(comment.parentId ? { parentId: comment.parentId } : {}),
        },
        ui,
      ),
  });

  // 编辑 / 预览切换：预览时渲染 Markdown，禁用格式按钮（避免对不可编辑文本操作）。
  function setNotesPreview(on: boolean): void {
    notesPreviewOn = on;
    if (on) notesPreview.innerHTML = renderMarkdown(notesArea.value);
    notesPreview.style.display = on ? "block" : "none";
    notesArea.style.display = on ? "none" : "block";
    for (const b of formatBtns) b.disabled = on;
    setButtonLucideIcon(host.ownerDocument, previewToggleBtn, on ? "pen-line" : "eye");
    previewToggleBtn.title = on ? t("editor.notes.md.edit") : t("editor.notes.md.preview");
  }

  // 母版视图下没有"幻灯片备注"概念，禁用输入 + 工具栏并提示。
  const syncNotesPane = (): void => {
    const inMaster = isMasterEditContext(editorContext);
    notesArea.disabled = inMaster;
    for (const b of formatBtns) b.disabled = inMaster || notesPreviewOn;
    previewToggleBtn.disabled = inMaster;
    if (inMaster) {
      if (notesPreviewOn) setNotesPreview(false);
      notesArea.value = "";
      notesArea.placeholder = t("editor.notes.masterHint");
      notesBaseline = "";
      return;
    }
    notesArea.placeholder = t("editor.notes.placeholder");
    const slide = pres.slides[index];
    const v = slide?.notes ?? "";
    notesArea.value = v;
    notesBaseline = v;
    if (notesPreviewOn) notesPreview.innerHTML = renderMarkdown(v);
  };

  // 提交当前 textarea 编辑：与 baseline 比较，变化才入栈（可撤销）+ 触发宿主自动保存。
  const commitNotes = (): void => {
    if (notesCommitTimer !== undefined) {
      host.ownerDocument.defaultView?.clearTimeout(notesCommitTimer);
      notesCommitTimer = undefined;
    }
    if (isMasterEditContext(editorContext)) return;
    const slide = pres.slides[index];
    if (!slide) return;
    const raw = notesArea.value;
    if (raw === notesBaseline) return;
    const next = raw.trim().length > 0 ? raw : undefined;
    notesBaseline = raw;
    stack.execute(new SetSlideNotesCmd(index, next));
  };

  notesArea.addEventListener("input", () => {
    if (notesCommitTimer !== undefined) host.ownerDocument.defaultView?.clearTimeout(notesCommitTimer);
    notesCommitTimer = host.ownerDocument.defaultView?.setTimeout(() => {
      notesCommitTimer = undefined;
      commitNotes();
    }, 900);
  });
  notesArea.addEventListener("blur", () => commitNotes());
  flushNotesCommit = commitNotes;

  // 切页后把备注 tab 同步成新页内容（切页前的 flush 已由 drawSlide 负责）。
  onSlideChangeHooks.push(() => syncNotesPane());
  onSlideChangeHooks.push(() => lecturePanel?.refresh());
  onSlideChangeHooks.push(() => {
    selectedCommentId = null;
    commentPins?.refresh();
    commentsPanel?.refresh();
  });

  // dock tab 激活回调：切到时间轴时刷新时间轴；切到备注时同步并聚焦。
  onDockTabActivate = (tab): void => {
    if (tab === "timeline") {
      animTimeline?.refresh();
    } else if (tab === "notes") {
      syncNotesPane();
      if (!notesArea.disabled) notesArea.focus();
    } else {
      lecturePanel?.refresh();
    }
  };
  syncNotesPane();
  refreshDockTabs();

  let pendingRedraw = false;
  let playbackOn = false;
  let skipNextRemount = false;
  const drawSlideIfNeeded = (): void => {
    if (pendingRedraw) return;
    if (playbackOn) return;
    pendingRedraw = true;
    const live = skipNextRemount;
    skipNextRemount = false;
    queueMicrotask(() => {
      pendingRedraw = false;
      if (playbackOn) return;
      if (live) refreshLive();
      else drawSlide(index);
    });
  };

  let selectionPluginNotifyRaf = 0;
  const scheduleSelectionPluginNotify = (): void => {
    const win = host.ownerDocument.defaultView;
    if (!win?.requestAnimationFrame) {
      editorPlugins?.notifySelectionChange();
      return;
    }
    if (selectionPluginNotifyRaf) return;
    selectionPluginNotifyRaf = win.requestAnimationFrame(() => {
      selectionPluginNotifyRaf = 0;
      editorPlugins?.notifySelectionChange();
    });
  };
  selection.subscribe((ids) => {
    if (!committingLive) commitLivePreview();
    endCropIfSelectionLeft(ids);
    renderOverlay();
    opts.onSelectionChange?.(ids);
    scheduleSelectionPluginNotify();
  });
  let stackFirstEmit = true;
  stack.subscribe((info) => {
    if (stackFirstEmit) {
      stackFirstEmit = false;
      opts.onCommandStackChange?.({ canUndo: info.canUndo, canRedo: info.canRedo });
      return;
    }
    hydrateViewGuides();
    renderOverlay();
    syncSlideshowLocalsFromPres();
    drawSlideIfNeeded();
    // 重绘是微任务，会换掉场景节点并把编辑中的文字重新显示出来。等它画完再藏一次。
    if (activeTextEdit) queueMicrotask(() => activeTextEdit?.hideSource());
    if (editorContext.kind === "master") {
      recomputeSlidesForMasterEdit(pres, editorContext);
    }
    altView?.refresh();
    commentsPanel?.refresh();
    commentPins?.refresh();
    opts.onCommandStackChange?.({ canUndo: info.canUndo, canRedo: info.canRedo });
    lecturePanel?.refresh();
  });

  const screenToStage = (clientX: number, clientY: number): { x: number; y: number } => {
    const r = stage.getBoundingClientRect();
    return {
      x: (clientX - r.left) / stageScale,
      y: (clientY - r.top) / stageScale,
    };
  };

  commentPins = mountCommentPins({
    stage,
    slideW: pres.size.width,
    slideH: pres.size.height,
    getComments: () => pres.comments ?? [],
    getSlideIndex: () => index,
    getVisible: () => commentsMarkupVisible,
    getSelectedId: () => selectedCommentId,
    screenToStage,
    onSelect: (commentId) => {
      focusRightTab("comments");
      focusComment(commentId);
    },
    onMove: (commentId, x, y) => {
      const c = pres.comments?.find((item) => item.id === commentId);
      if (!c) return;
      stack.execute(
        new SetCommentAnchorCmd(commentId, { x, y }, { x: c.x, y: c.y }),
      );
    },
  });

  let inkPenColor = "#111827";
  let inkPenWidth = 3;
  const inkToolStyle: Record<"pen" | "highlighter", { color: string; width: number }> = {
    pen: { color: "#111827", width: 3 },
    highlighter: { color: "#facc15", width: 22 },
  };
  const applyInkToolStyle = (tool: "pen" | "highlighter"): void => {
    const s = inkToolStyle[tool];
    inkPenColor = s.color;
    inkPenWidth = s.width;
    inkOverlay?.setPenColor(s.color);
    inkOverlay?.setPenWidth(s.width);
  };
  inkOverlay = mountInkOverlay({
    stage,
    slideW: pres.size.width,
    slideH: pres.size.height,
    screenToStage,
    onStroke(points, mode) {
      const shape = buildInkPathShape(points, mode, inkPenColor, inkPenWidth);
      if (!shape) return;
      stack.execute(new AddShapeCmd(index, 0, shape));
      drawSlide(index);
      inkOverlay?.bringToFront();
    },
    onEraseAt(pt) {
      const slide = pres.slides[index];
      if (!slide) return;
      const shapes = slide.layers.flatMap((l) => l.shapes);
      const id = hitInkShapeAt(shapes, pt, 14);
      if (!id) return;
      stack.execute(new DeleteShapeCmd(index, id));
      drawSlide(index);
      inkOverlay?.bringToFront();
    },
  });

  const placeGuideFromClient = (clientX: number, clientY: number): void => {
    if (!guidePlacement) return;
    const pt = screenToStage(clientX, clientY);
    const sw = pres.size.width;
    const sh = pres.size.height;
      if (guidePlacement.orient === "v") {
      const x = Math.max(0, Math.min(sw, pt.x));
      if (!staticGuideLines.v.some((v) => Math.abs(v - x) < 2)) staticGuideLines.v.push(x);
    } else {
      const y = Math.max(0, Math.min(sh, pt.y));
      if (!staticGuideLines.h.some((h) => Math.abs(h - y) < 2)) staticGuideLines.h.push(y);
    }
    persistViewGuides();
    guidePlacement = null;
    renderOverlay();
  };

  const onGuidePointerMove = (e: PointerEvent): void => {
    if (!guidePlacement) return;
    const pt = screenToStage(e.clientX, e.clientY);
    guidePlacement = {
      orient: guidePlacement.orient,
      at: guidePlacement.orient === "v" ? pt.x : pt.y,
    };
    renderOverlay();
  };

  const endGuidePlacement = (e: PointerEvent): void => {
    if (!guidePlacement) return;
    placeGuideFromClient(e.clientX, e.clientY);
    host.ownerDocument.removeEventListener("pointermove", onGuidePointerMove);
    host.ownerDocument.removeEventListener("pointerup", endGuidePlacement);
  };

  rulerTop.addEventListener("pointerdown", (e) => {
    if (!staticGuidesOn) return;
    e.preventDefault();
    guidePlacement = { orient: "v", at: 0 };
    host.ownerDocument.addEventListener("pointermove", onGuidePointerMove);
    host.ownerDocument.addEventListener("pointerup", endGuidePlacement);
  });
  rulerLeft.addEventListener("pointerdown", (e) => {
    if (!staticGuidesOn) return;
    e.preventDefault();
    guidePlacement = { orient: "h", at: 0 };
    host.ownerDocument.addEventListener("pointermove", onGuidePointerMove);
    host.ownerDocument.addEventListener("pointerup", endGuidePlacement);
  });

  const hitIdFromDom = (target: Element | null): string | undefined => {
    const g = target?.closest?.("g[data-id]");
    const id = g?.getAttribute("data-id");
    if (!id || id.startsWith("__bg_") || id.startsWith("__slide_")) return undefined;
    return id;
  };

  const hitTest = (x: number, y: number): string | undefined => {
    const slide = viewSlide();
    if (!slide) return undefined;
    // 后绘制的 layer / shape 在上层；倒序命中到第一个即可返回，避免每击扫完整页。
    for (let li = slide.layers.length - 1; li >= 0; li--) {
      const layer = slide.layers[li]!;
      for (let si = layer.shapes.length - 1; si >= 0; si--) {
        const id = hitWalk(layer.shapes[si]!, x, y);
        if (id) return id;
      }
    }
    return undefined;
  };

  const hitAtPointer = (e: PointerEvent): string | undefined => {
    const dom = hitIdFromDom(e.target as Element | null);
    if (dom) return dom;
    const pt = screenToStage(e.clientX, e.clientY);
    return hitTest(pt.x, pt.y);
  };

  type PosSnapshot = Map<string, { bbox: Rect; line?: { x1: number; y1: number; x2: number; y2: number } }>;
  type DragState =
    | {
        type: "move";
        ids: string[];
        startX: number;
        startY: number;
        startBboxes: Map<string, Rect>;
        snapshots: Map<string, PosSnapshot>;
        /** 首次 pointermove 越过拖动阈值后再拍快照，避免单击选中被大 group 递归遍历拖慢。 */
        snapshotsCaptured: boolean;
        moved: boolean;
        duplicated: boolean;
        // 表格 deep-select 候选：当用户点击"已选中的 table group"内某个 cell，
        // 我们不能立刻把 selection 切到 cell —— 那会让"拖动整张表"的同一个 pointer
        // 手势失效（pointerdown 立刻 return，drag 没机会启动）。
        // 折衷做法：仍然 prepare move drag、selection 暂时保持在 group；如果
        // pointermove 触发到 moved=true，pendingCellSelect 直接丢弃（用户是想拖整
        // 张表）；如果 pointerup 时 moved 仍为 false，才把 selection 切到记下的
        // cell（用户的意图就是"再点一下进入 cell 模式"）。
        pendingCellSelect?: string;
      }
    | { type: "resize"; id: string; startX: number; startY: number; startBbox: Rect; corner: string; snapshot: PosSnapshot; moved: boolean }
    | { type: "lineEndpoint"; id: string; end: "start" | "end"; snapshot: PosSnapshot; moved: boolean; snapped?: { startCxn?: import("@ppt/core").ShapeCxnEnd | null; endCxn?: import("@ppt/core").ShapeCxnEnd | null } }
    | {
        type: "connectorEndpoint";
        id: string;
        end: "start" | "end";
        snapshot: PosSnapshot;
        startTransform: import("@ppt/core").Transform;
        startCxn?: import("@ppt/core").ShapeCxnEnd;
        endCxn?: import("@ppt/core").ShapeCxnEnd;
        moved: boolean;
        snapped?: { startCxn?: import("@ppt/core").ShapeCxnEnd | null; endCxn?: import("@ppt/core").ShapeCxnEnd | null };
      }
    | { type: "polygonVertex"; id: string; vertex: number; snapshot: PosSnapshot; moved: boolean }
    | { type: "adjHandle"; id: string; handleIndex: number; startAdj: Record<string, number>; moved: boolean }
    | { type: "rotate"; id: string; cx: number; cy: number; startAngle: number; startRotation: number; moved: boolean }
    | { type: "marquee"; startX: number; startY: number; addToSelection: boolean }
    | { type: "createShape"; kind: InsertShapeKind; startX: number; startY: number; moved: boolean }
    | {
        type: "cropEdge";
        id: string;
        corner: string;
        startX: number;
        startY: number;
        startWindow: Rect;
        image: Rect;
        snapshot: PosSnapshot;
        moved: boolean;
      }
    | { type: "cropPan"; id: string; startX: number; startY: number; image: Rect; window: Rect; moved: boolean }
    | { type: "cropMove"; id: string; startX: number; startY: number; image: Rect; window: Rect; snapshot: PosSnapshot; moved: boolean }
    | { type: "cropScale"; id: string; corner: string; startX: number; startY: number; image: Rect; window: Rect; moved: boolean };
  let drag: DragState | null = null;

  const cropShapeNow = (): Shape | undefined => {
    if (!cropSession) return undefined;
    const slide = viewSlide();
    return slide ? findShape(slide, cropSession.id) : undefined;
  };
  const exitCropSession = (commit: boolean): void => {
    const session = cropSession;
    if (!session) return;
    cropSession = null;
    if (drag?.type === "cropEdge" || drag?.type === "cropPan" || drag?.type === "cropMove" || drag?.type === "cropScale") drag = null;
    const slide = viewSlide();
    const shape = slide ? findShape(slide, session.id) : undefined;
    if (!shape) {
      renderOverlay();
      return;
    }
    const afterBox = { ...shape.bbox };
    const afterCrop = readCrop(shape);
    const originBox = session.snap.get(shape.id)?.bbox ?? afterBox;
    const changed = !sameRect(afterBox, originBox) || !sameCrop(afterCrop, session.originCrop);
    restorePositions(shape, session.snap);
    assignCrop(shape, session.originCrop, session.originFit);
    if (commit && changed && cropHost(shape)) {
      skipNextRemount = true;
      stack.execute(new SetCropFrameCmd(index, session.id, afterBox, afterCrop));
      return;
    }
    refreshLive();
  };
  const enterCropSession = (id: string): void => {
    const slide = viewSlide();
    const shape = slide ? findShape(slide, id) : undefined;
    if (!shape || !cropHost(shape)) return;
    if (cropSession && cropSession.id !== id) exitCropSession(true);
    if (cropSession?.id === id) return;
    const snap = new Map() as PosSnapshot;
    snapshotPositions(shape, snap);
    cropSession = {
      id,
      snap,
      originCrop: readCrop(shape),
      originFit: shape.fill?.kind === "image" ? shape.fill.fit : undefined,
    };
    const nextWindow = fittedCropWindow(shape, pres.size.width, pres.size.height);
    if (nextWindow) {
      rescaleInPlace(shape, { ...shape.bbox }, nextWindow);
      refreshLive();
      return;
    }
    renderOverlay();
  };
  const cropSessionDirty = (): boolean => {
    const shape = cropShapeNow();
    if (!shape || !cropSession) return false;
    const origin = cropSession.snap.get(shape.id)?.bbox;
    if (!origin) return true;
    return !sameRect(shape.bbox, origin) || !sameCrop(readCrop(shape), cropSession.originCrop);
  };
  endCropSession = exitCropSession;
  endCropIfSelectionLeft = (ids) => {
    if (!cropSession) return;
    if (ids.size === 1 && ids.has(cropSession.id)) return;
    exitCropSession(true);
  };
  const CROP_HANDLES = new Set(["nw", "n", "ne", "e", "se", "s", "sw", "w"]);

  // 平移舞台手势状态。
  //   - 按住空格 → 进入 panning 候选态（鼠标变 grab，下一次按下就开始拖）；
  //   - 中键按下 = 临时一次 panning；
  //   - 平移时改的是 stageWrap.scrollLeft/Top（stage 本身位置由 fitStage 决定）。
  let spaceHeld = false;
  let panState: { startClientX: number; startClientY: number; startScrollX: number; startScrollY: number; pointerId: number } | null = null;
  const setPanCursor = (on: boolean): void => {
    if (on) {
      stageWrap.style.cursor = panState ? "grabbing" : "grab";
      return;
    }
    updateShapeDrawCursor();
  };

  stageWrap.addEventListener("pointerdown", (e) => {
    const target = e.target as Element | null;
    // 行内文本编辑器挂在 stageWrap 上。点它只是放光标，不能当成点空白处。
    if (target?.closest?.("[data-ppt-text-editor]")) return;
    // 滚动条落在 client 区之外。点滚动条只滚动，不开始拖选。
    const wrapRect = stageWrap.getBoundingClientRect();
    if (
      e.clientX - wrapRect.left >= stageWrap.clientWidth ||
      e.clientY - wrapRect.top >= stageWrap.clientHeight
    ) {
      return;
    }
    if (presentationView === "reading" && e.button === 0 && !spaceHeld) {
      e.preventDefault();
      e.stopPropagation();
      root.focus({ preventScroll: true });
      const rect = stage.getBoundingClientRect();
      const back = e.clientX < rect.left + rect.width * 0.28;
      gotoSlideRef.fn(back ? index - 1 : index + 1);
      return;
    }
    // 中键 / 空格 = 平移舞台。
    if (e.button === 1 || (e.button === 0 && spaceHeld)) {
      e.preventDefault();
      stage.setPointerCapture(e.pointerId);
      panState = {
        startClientX: e.clientX,
        startClientY: e.clientY,
        startScrollX: stageWrap.scrollLeft,
        startScrollY: stageWrap.scrollTop,
        pointerId: e.pointerId,
      };
      setPanCursor(true);
      return;
    }
    if (e.button !== 0) return;
    if (commentPlacementOn) {
      e.preventDefault();
      e.stopPropagation();
      const pt = screenToStage(e.clientX, e.clientY);
      const x = Math.max(0, Math.min(pres.size.width, Math.round(pt.x)));
      const y = Math.max(0, Math.min(pres.size.height, Math.round(pt.y)));
      commentPlacementOn = false;
      updateShapeDrawCursor();
      const slide = pres.slides[index];
      const shape = slide ? shapeAtPoint(slide, x, y) : undefined;
      let restoreSelection: (() => void) | undefined;
      if (shape && slide) {
        const prev = [...selection.values];
        selection.set([findTopLevelId(slide, shape.id) ?? shape.id]);
        restoreSelection = () => selection.set(prev);
      }
      void addCommentAt(x, y, shape?.id, {
        clientX: e.clientX,
        clientY: e.clientY,
        ...(shape ? { targetLabel: commentShapeLabel(shape) } : {}),
        ...(restoreSelection ? { restoreSelection } : {}),
      });
      return;
    }
    // Animation Painter 激活时：单击目标 shape 复制动画序列。
    if (animationPainter.sourceId) {
      e.preventDefault();
      root.focus();
      const hit = hitAtPointer(e);
      if (!hit) {
        if (!animationPainter.persistent) cancelAnimationPainter();
        return;
      }
      const pt = screenToStage(e.clientX, e.clientY);
      const slide = viewSlide();
      if (!slide) return;
      const targetId = findTopLevelId(slide, hit) ?? hit;
      const targetShape = findShape(slide, targetId);
      if (targetShape?.locked) {
        showToast(t("editor.toast.locked.cantEdit"));
        return;
      }
      if (targetId !== animationPainter.sourceId) {
        stack.execute(new CopyShapeAnimationsCmd(index, animationPainter.sourceId, targetId));
        animPanel?.refresh();
        animTimeline?.refresh();
      }
      selection.set([targetId]);
      drawSlide(index);
      if (!animationPainter.persistent) cancelAnimationPainter();
      else toolbar.refresh();
      return;
    }
    // Format Painter 激活时：单击目标 shape 刷格式，不进入拖动 / 框选。
    if (formatPainter.snapshot) {
      e.preventDefault();
      root.focus();
      const hit = hitAtPointer(e);
      if (!hit) {
        if (!formatPainter.persistent) cancelFormatPainter();
        return;
      }
      const pt = screenToStage(e.clientX, e.clientY);
      const slide = viewSlide();
      if (!slide) return;
      const hitShape = findShape(slide, hit);
      let targetId: string;
      if (hitShape?.kind === "text" || hitShape?.cellMeta) {
        targetId = hit;
      } else {
        const topId = findTopLevelId(slide, hit) ?? hit;
        const topShape = findShape(slide, topId);
        if (topShape?.kind === "group" && topShape.tableMeta) {
          const leafId = hitLeafTextId(topShape, pt.x, pt.y);
          targetId = leafId ?? topId;
        } else {
          targetId = topId;
        }
      }
      const targetShape = findShape(slide, targetId);
      if (targetShape?.locked) {
        showToast(t("editor.toast.locked.cantEdit"));
        return;
      }
      if (targetId !== formatPainter.sourceId) {
        stack.execute(new ApplyFormatCmd(index, targetId, formatPainter.snapshot));
      }
      selection.set([targetId]);
      drawSlide(index);
      if (!formatPainter.persistent) cancelFormatPainter();
      else toolbar.refresh();
      return;
    }
    // 阻止浏览器在按下并拖动时启动原生文本选中（拖动 resize 手柄 / 移动 / 框选都会扫过
    // 场景文字）。文本编辑器的按下在函数开头就返回，不会走到这里。
    e.preventDefault();
    root.focus();
    stage.setPointerCapture(e.pointerId);
    const pt = screenToStage(e.clientX, e.clientY);
    const pointerHitId = hitAtPointer(e);
    // 形状绘制模式：点击/拖动任意位置都开始画新形状，不走已有元素的选中 / 移动 / 手柄。
    if (pendingShapeKind) {
      drag = { type: "createShape", kind: pendingShapeKind, startX: pt.x, startY: pt.y, moved: false };
      selection.clear();
      return;
    }
    if (cropSession) {
      const cropping = cropShapeNow();
      const handleId = findHandleAt(overlay, e.clientX, e.clientY);
      if (cropping && handleId?.startsWith("pic-")) {
        drag = {
          type: "cropScale",
          id: cropping.id,
          corner: handleId.slice(4),
          startX: pt.x,
          startY: pt.y,
          image: imageFrame(cropping.bbox, readCrop(cropping)),
          window: { ...cropping.bbox },
          moved: false,
        };
        return;
      }
      if (cropping && handleId && CROP_HANDLES.has(handleId)) {
        const snapshot = new Map() as PosSnapshot;
        snapshotPositions(cropping, snapshot);
        drag = {
          type: "cropEdge",
          id: cropping.id,
          corner: handleId,
          startX: pt.x,
          startY: pt.y,
          startWindow: { ...cropping.bbox },
          image: imageFrame(cropping.bbox, readCrop(cropping)),
          snapshot,
          moved: false,
        };
        return;
      }
      if (cropping) {
        const local = inverseNodeTransform(cropping, pt.x, pt.y);
        const crop = readCrop(cropping);
        const picture = imageFrame(cropping.bbox, crop);
        if (pointInRect(local.x, local.y, cropping.bbox)) {
          const snapshot = new Map() as PosSnapshot;
          snapshotPositions(cropping, snapshot);
          drag = {
            type: "cropMove",
            id: cropping.id,
            startX: pt.x,
            startY: pt.y,
            image: picture,
            window: { ...cropping.bbox },
            snapshot,
            moved: false,
          };
          return;
        }
        if (pointInRect(local.x, local.y, picture)) {
          drag = {
            type: "cropPan",
            id: cropping.id,
            startX: pt.x,
            startY: pt.y,
            image: picture,
            window: { ...cropping.bbox },
            moved: false,
          };
          return;
        }
      }
      exitCropSession(true);
    }
    const handleId = findHandleAt(overlay, e.clientX, e.clientY);
    if (handleId && selection.values.size === 1 && !selection.isBackground()) {
      const rawId = [...selection.values][0]!;
      const slide = viewSlide();
      const id = slide ? syntheticTextBoxGroupId(slide, rawId) : rawId;
      const s = slide ? findShape(slide, id) : undefined;
      // 锁定 shape 不允许 resize / rotate（与 move 一致），并 toast 提示。
      if (s?.locked) {
        showToast(t("editor.toast.locked.cantMove"));
        return;
      }
      if (s && handleId === "rotate") {
        const cx = s.bbox.x + s.bbox.w / 2;
        const cy = s.bbox.y + s.bbox.h / 2;
        const startAngle = Math.atan2(pt.y - cy, pt.x - cx);
        drag = {
          type: "rotate",
          id,
          cx,
          cy,
          startAngle,
          startRotation: s.transform?.rotation ?? 0,
          moved: false,
        };
        return;
      }
      if (s?.kind === "line" && (handleId === "line-start" || handleId === "line-end")) {
        const snapshot: PosSnapshot = new Map();
        snapshotPositions(s, snapshot);
        drag = {
          type: "lineEndpoint",
          id,
          end: handleId === "line-start" ? "start" : "end",
          snapshot,
          moved: false,
        };
        return;
      }
      if (s && isPathConnector(s) && (handleId === "cxn-start" || handleId === "cxn-end")) {
        const snapshot: PosSnapshot = new Map();
        snapshotPositions(s, snapshot);
        drag = {
          type: "connectorEndpoint",
          id,
          end: handleId === "cxn-start" ? "start" : "end",
          snapshot,
          startTransform: { ...s.transform },
          startCxn: s.startCxn ? { ...s.startCxn } : undefined,
          endCxn: s.endCxn ? { ...s.endCxn } : undefined,
          moved: false,
        };
        return;
      }
      const polyMatch = handleId ? /^poly-(\d+)$/.exec(handleId) : null;
      if (s?.kind === "polygon" && polyMatch) {
        const snapshot: PosSnapshot = new Map();
        snapshotPositions(s, snapshot);
        drag = {
          type: "polygonVertex",
          id,
          vertex: Number(polyMatch[1]),
          snapshot,
          moved: false,
        };
        return;
      }
      const adjMatch = handleId ? /^adj-(\d+)$/.exec(handleId) : null;
      if (s?.kind === "path" && s.presetType && adjMatch && !s.locks?.noAdjustHandles) {
        drag = {
          type: "adjHandle",
          id,
          handleIndex: Number(adjMatch[1]),
          startAdj: { ...(s.presetAdj ?? {}) },
          moved: false,
        };
        return;
      }
      if (s) {
        const snapshot: PosSnapshot = new Map();
        snapshotPositions(s, snapshot);
        drag = { type: "resize", id, startX: pt.x, startY: pt.y, startBbox: { ...s.bbox }, corner: handleId, snapshot, moved: false };
        return;
      }
    }
    const hit = pointerHitId;
    if (!hit) {
      // 空白处 = 起 marquee 框选；Shift 累加。非 Shift 的"纯单击"（无拖动）会在
      // finishDrag 里落到"选中背景"（见 marquee 分支）。
      drag = { type: "marquee", startX: pt.x, startY: pt.y, addToSelection: e.shiftKey };
      if (!e.shiftKey) selection.clear();
      return;
    }
    const slide = viewSlide();
    if (!slide) return;
    const topId = findTopLevelId(slide, hit) ?? hit;
    // ── 表格 cell 的「deep-select / re-enter」语义 ──────────────────────────────
    // PowerPoint 的表格选择是两层的：第一次点 = 选中整个 table，第二次点
    // ↘ 命中某个 cell，selection 直接落到该 cell（Inspector 显示 cell 的独立属性，
    // 用于"只改这一格"）。两种触发情景：
    //   (A) cell 模式下点同一张表：立即切到具体被点的 cell（cell 不能独立 drag，
    //       直接 return 不进 drag）。
    //   (B) table group 已选 → 再点表内某 cell：不能立即切 selection —— 那样会
    //       让"按住表格继续拖动整张表"的同一个手势失效。改为把 leafId 暂存到
    //       move drag 的 pendingCellSelect，pointermove 时若 moved=true 自动丢弃，
    //       pointerup 时若仍未移动则在那时切换 selection。
    // 跳出 cell 模式：点击表格外的任意 shape / 空白。
    let pendingCellSelectId: string | undefined;
    {
      const curOnly = selection.values.size === 1 ? [...selection.values][0]! : null;
      let cellModeGroupId: string | null = null;
      if (curOnly) {
        const curShape = findShape(slide, curOnly);
        if (curShape?.cellMeta) {
          const parent = findParentGroup(slide, curOnly);
          if (parent?.tableMeta) cellModeGroupId = parent.id;
        }
      }
      if (!e.shiftKey && cellModeGroupId && cellModeGroupId === topId) {
        // 情景 (A)：已经在 cell 模式 + 点同一张表 → 立即切到精确 cell。
        const groupShape = findShape(slide, cellModeGroupId);
        if (groupShape?.kind === "group") {
          const leafId = hitLeafTextId(groupShape, pt.x, pt.y);
          const newSel = leafId ?? curOnly!;
          selection.set([newSel]);
          return;
        }
      } else if (!e.shiftKey && selection.has(topId) && selection.values.size === 1) {
        // 情景 (B)：单选状态、再点击该 table group → 记下 leafId，进入 move drag。
        const topShape = findShape(slide, topId);
        if (topShape?.kind === "group" && topShape.tableMeta) {
          const leafId = hitLeafTextId(topShape, pt.x, pt.y);
          if (leafId) pendingCellSelectId = leafId;
        }
      }
    }
    if (e.shiftKey) selection.toggle(topId);
    else if (!selection.has(topId)) selection.set([topId]);
    else renderOverlay();
    // 锁定的 shape 不允许拖动。给一次性的 toast 提示，避免用户疑惑"为什么按下去没反应"。
    const lockedHit = (() => {
      for (const id of selection.values) {
        const s = findShape(slide, id);
        if (s?.locked) return true;
      }
      return false;
    })();
    if (lockedHit) {
      showToast(t("editor.toast.locked.cantMove"));
      return;
    }
    // 多选时把所有选中的 shapes 一起作为移动对象。
    const ids = [...selection.values].map((id) => syntheticTextBoxGroupId(slide, id));
    const startBboxes = new Map<string, Rect>();
    const snapshots = new Map<string, PosSnapshot>();
    for (const id of ids) {
      const s = findShape(slide, id);
      if (!s) continue;
      startBboxes.set(id, { ...s.bbox });
    }
    drag = {
      type: "move",
      ids,
      startX: pt.x,
      startY: pt.y,
      startBboxes,
      snapshots,
      snapshotsCaptured: false,
      moved: false,
      duplicated: false,
      pendingCellSelect: pendingCellSelectId,
    };
  });

  let dragRaf = 0;
  let dragNeedsRemount = false;
  const scheduleDragRedraw = (): void => {
    scheduleSyncFormatBar();
    if (dragRaf) return;
    dragRaf = requestAnimationFrame(() => {
      dragRaf = 0;
      if (dragNeedsRemount) {
        dragNeedsRemount = false;
        drawSlide(index);
      } else {
        refreshLive();
      }
    });
  };
  stage.addEventListener("pointermove", (e) => {
    if (panState && e.pointerId === panState.pointerId) {
      const dx = e.clientX - panState.startClientX;
      const dy = e.clientY - panState.startClientY;
      stageWrap.scrollLeft = panState.startScrollX - dx;
      stageWrap.scrollTop = panState.startScrollY - dy;
      return;
    }
    if (!drag) return;
    const pt = screenToStage(e.clientX, e.clientY);
    if (drag.type === "marquee" || drag.type === "createShape") {
      const box = rectFromPts(drag.startX, drag.startY, pt.x, pt.y);
      if (drag.type === "marquee") {
        const slop = stageScale > 0 ? 4 / stageScale : 4;
        marqueeBox = box.w < slop && box.h < slop ? null : box;
      } else {
        marqueeBox = box;
        drag.moved = true;
      }
      if (dragRaf) return;
      dragRaf = requestAnimationFrame(() => {
        dragRaf = 0;
        renderOverlay();
      });
      return;
    }
    if (drag.type === "rotate") {
      const ang = Math.atan2(pt.y - drag.cy, pt.x - drag.cx);
      let deg = drag.startRotation + ((ang - drag.startAngle) * 180) / Math.PI;
      if (e.shiftKey) deg = Math.round(deg / 15) * 15;
      deg = ((deg % 360) + 360) % 360;
      const slide = viewSlide();
      if (!slide) return;
      const s = findShape(slide, drag.id);
      if (!s) return;
      s.transform = { ...s.transform, rotation: deg };
      drag.moved = true;
      liveFollowGlue(slide, [s], true);
      scheduleDragRedraw();
      return;
    }
    if (drag.type === "lineEndpoint") {
      const slide = viewSlide();
      if (!slide) return;
      const s = findShape(slide, drag.id);
      if (!s || s.kind !== "line") return;
      restorePositions(s, drag.snapshot);
      // 在世界坐标改端点，再 relocalize：旋转中心随 bbox 变时，另一端视觉位置不动。
      let w1 = applyNodeTransform(s, s.x1, s.y1);
      let w2 = applyNodeTransform(s, s.x2, s.y2);
      if (drag.end === "start") {
        w1 = { x: pt.x, y: pt.y };
        if (e.shiftKey) w1 = snapLineEndpoint(w2.x, w2.y, w1.x, w1.y);
        const hit = snapCxnSite(slide, w1.x, w1.y, drag.id);
        if (hit) {
          w1 = { x: hit.x, y: hit.y };
          drag.snapped = { startCxn: cxnEndFor(hit.shape, hit.idx) };
        } else {
          drag.snapped = { startCxn: null };
        }
      } else {
        w2 = { x: pt.x, y: pt.y };
        if (e.shiftKey) w2 = snapLineEndpoint(w1.x, w1.y, w2.x, w2.y);
        const hit = snapCxnSite(slide, w2.x, w2.y, drag.id);
        if (hit) {
          w2 = { x: hit.x, y: hit.y };
          drag.snapped = { endCxn: cxnEndFor(hit.shape, hit.idx) };
        } else {
          drag.snapped = { endCxn: null };
        }
      }
      const geo = relocalizeWorldPoints(
        [
          [w1.x, w1.y],
          [w2.x, w2.y],
        ],
        s.transform,
      );
      const p1 = geo.points[0]!;
      const p2 = geo.points[1]!;
      s.x1 = p1[0];
      s.y1 = p1[1];
      s.x2 = p2[0];
      s.y2 = p2[1];
      s.bbox = bboxFromLineEndpoints(p1[0], p1[1], p2[0], p2[1]);
      drag.moved = true;
      scheduleDragRedraw();
      return;
    }
    if (drag.type === "connectorEndpoint") {
      const slide = viewSlide();
      if (!slide) return;
      const s = findShape(slide, drag.id);
      if (!s || !isPathConnector(s)) return;
      restorePositions(s, drag.snapshot);
      s.transform = { ...drag.startTransform };
      if (drag.startCxn) s.startCxn = { ...drag.startCxn };
      else delete s.startCxn;
      if (drag.endCxn) s.endCxn = { ...drag.endCxn };
      else delete s.endCxn;
      const ends = pathConnectorWorldEnds(s);
      if (drag.end === "start") {
        ends.start = { x: pt.x, y: pt.y };
        if (e.shiftKey) ends.start = snapLineEndpoint(ends.end.x, ends.end.y, ends.start.x, ends.start.y);
        const hit = snapCxnSite(slide, ends.start.x, ends.start.y, drag.id);
        if (hit) {
          ends.start = { x: hit.x, y: hit.y };
          drag.snapped = { startCxn: cxnEndFor(hit.shape, hit.idx) };
        } else {
          drag.snapped = { startCxn: null };
        }
      } else {
        ends.end = { x: pt.x, y: pt.y };
        if (e.shiftKey) ends.end = snapLineEndpoint(ends.start.x, ends.start.y, ends.end.x, ends.end.y);
        const hit = snapCxnSite(slide, ends.end.x, ends.end.y, drag.id);
        if (hit) {
          ends.end = { x: hit.x, y: hit.y };
          drag.snapped = { endCxn: cxnEndFor(hit.shape, hit.idx) };
        } else {
          drag.snapped = { endCxn: null };
        }
      }
      applyPathConnectorEnds(s, ends.start, ends.end);
      regeneratePathShape(s);
      drag.moved = true;
      scheduleDragRedraw();
      return;
    }
    if (drag.type === "adjHandle") {
      const slide = viewSlide();
      const s = slide ? findShape(slide, drag.id) : undefined;
      if (!s || s.kind !== "path" || !s.presetType) return;
      const local = inverseNodeTransform(s, pt.x, pt.y);
      s.presetAdj = dragOfficialAdjustHandle(
        s.presetType,
        s.bbox,
        drag.startAdj,
        drag.handleIndex,
        local.x - s.bbox.x,
        local.y - s.bbox.y,
      );
      regeneratePathShape(s);
      drag.moved = true;
      scheduleDragRedraw();
      return;
    }
    if (drag.type === "polygonVertex") {
      const slide = viewSlide();
      const s = slide ? findShape(slide, drag.id) : undefined;
      if (!s || s.kind !== "polygon") return;
      const vi = drag.vertex;
      if (vi < 0 || vi >= s.points.length) return;
      restorePositions(s, drag.snapshot);
      const world = s.points.map((p) => {
        const w = applyNodeTransform(s, p[0], p[1]);
        return [w.x, w.y] as [number, number];
      });
      world[vi] = [pt.x, pt.y];
      const geo = relocalizeWorldPoints(world, s.transform);
      s.points = geo.points;
      s.bbox = geo.bbox;
      drag.moved = true;
      scheduleDragRedraw();
      return;
    }
    if (drag.type === "cropEdge" || drag.type === "cropPan" || drag.type === "cropMove" || drag.type === "cropScale") {
      const slide = viewSlide();
      const s = slide ? findShape(slide, drag.id) : undefined;
      if (!s) return;
      const localStart = inverseNodeTransform(s, drag.startX, drag.startY);
      const localPt = inverseNodeTransform(s, pt.x, pt.y);
      const dx = localPt.x - localStart.x;
      const dy = localPt.y - localStart.y;
      if (!drag.moved && Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
      drag.moved = true;
      const fillFit = cropHost(s) === "fill" ? "fill" as const : undefined;
      if (drag.type === "cropEdge") {
        restorePositions(s, drag.snapshot);
        const next = resizeCropWindow(drag.startWindow, drag.corner, dx, dy);
        rescaleInPlace(s, drag.startWindow, next);
        assignCrop(s, cropFromFrames(drag.image, next), fillFit);
      } else if (drag.type === "cropMove") {
        restorePositions(s, drag.snapshot);
        const next = { ...drag.window, x: drag.window.x + dx, y: drag.window.y + dy };
        rescaleInPlace(s, drag.window, next);
        assignCrop(s, cropFromFrames(drag.image, next), fillFit);
      } else if (drag.type === "cropScale") {
        assignCrop(s, cropFromFrames(scalePictureFromCorner(drag.image, drag.corner, dx, dy), drag.window), fillFit);
      } else {
        assignCrop(
          s,
          cropFromFrames({ ...drag.image, x: drag.image.x + dx, y: drag.image.y + dy }, drag.window),
          fillFit,
        );
      }
      scheduleDragRedraw();
      return;
    }
    const dxRaw = pt.x - drag.startX;
    const dyRaw = pt.y - drag.startY;
    if (!drag.moved && Math.abs(dxRaw) < 0.5 && Math.abs(dyRaw) < 0.5) return;
    drag.moved = true;
    const slide = viewSlide();
    if (!slide) return;
    if (drag.type === "move") {
      captureMoveDragSnapshots(slide, drag);
      // Alt 第一次进入 move 时复制选中 shapes（PowerPoint Ctrl+drag）。
      if (e.altKey && !drag.duplicated) {
        drag.duplicated = true;
        const newIds: string[] = [];
        for (const id of drag.ids) {
          const orig = findShape(slide, id);
          if (!orig) continue;
          const copy = cloneShape(orig, true);
          // 新 shape 加到原 shape 所在 layer 顶部。
          const layer = slide.layers.find((ly) => ly.shapes.some((sh) => sh.id === id));
          if (layer) layer.shapes.push(copy);
          newIds.push(copy.id);
        }
        if (newIds.length) {
          drag.ids = newIds;
          // 新 ids 的 startBbox / snapshot 沿用原坐标（已被复制到相同位置）。
          const newStart = new Map<string, Rect>();
          const newSnap = new Map<string, PosSnapshot>();
          for (const nid of newIds) {
            const ns = findShape(slide, nid);
            if (!ns) continue;
            newStart.set(nid, { ...ns.bbox });
            const ssnap = new Map() as PosSnapshot;
            snapshotPositions(ns, ssnap);
            newSnap.set(nid, ssnap);
          }
          drag.startBboxes = newStart;
          drag.snapshots = newSnap;
          drag.snapshotsCaptured = true;
          selection.set(newIds);
          dragNeedsRemount = true;
        }
      }
      // 计算原始 dx/dy，可能因 Shift / snap 修正。
      let dx = dxRaw;
      let dy = dyRaw;
      if (e.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      if (snapToGrid) {
        const step = pres.viewGuides?.gridSpacing?.x || 25;
        dx = Math.round(dx / step) * step;
        dy = Math.round(dy / step) * step;
      }
      // 智能参考线，以及开着的视图网格：边或中心靠近时吸上去。
      let snapDx = 0;
      let snapDy = 0;
      guides = [];
      if (!snapToGrid && !e.altKey && (snapToShapes || gridOn)) {
        const movedIds = new Set(drag.ids);
        const unionStart = unionFromMap(drag.startBboxes);
        if (unionStart) {
          const movedRect = { x: unionStart.x + dx, y: unionStart.y + dy, w: unionStart.w, h: unionStart.h };
          const others = snapToShapes ? collectStaticBboxes(slide, movedIds) : [];
          const result = computeSnap(
            movedRect,
            others,
            6 / Math.max(0.001, stageScale),
            snapToShapes && staticGuidesOn ? staticGuideLines : undefined,
            gridOn
              ? { step: VISUAL_GRID_STEP, width: pres.size.width, height: pres.size.height }
              : undefined,
          );
          snapDx = result.dx;
          snapDy = result.dy;
          guides = result.guides;
        }
      }
      const finalDx = dx + snapDx;
      const finalDy = dy + snapDy;
      for (const id of drag.ids) {
        const s = findShape(slide, id);
        const snap = drag.snapshots.get(id);
        if (!s || !snap) continue;
        restorePositions(s, snap);
        translateInPlace(s, finalDx, finalDy);
      }
      liveFollowGlue(
        slide,
        drag.ids.map((id) => findShape(slide, id)).filter((sh): sh is Shape => !!sh),
      );
    } else if (drag.type === "resize") {
      const s = findShape(slide, drag.id);
      if (!s) return;
      restorePositions(s, drag.snapshot);
      // 鼠标位移变到未旋转局部空间，对侧锚点再按世界坐标钉住，避免旋转后整块滑走。
      const localStart = inverseNodeTransform(s, drag.startX, drag.startY);
      const localPt = inverseNodeTransform(s, pt.x, pt.y);
      let dx = localPt.x - localStart.x;
      let dy = localPt.y - localStart.y;
      // 对角：Shift / lockAspect / 预设几何（rightArrow 等）按比例缩放；
      // 边中点仍只改宽或高。
      const isCorner =
        drag.corner === "nw" || drag.corner === "ne" || drag.corner === "sw" || drag.corner === "se";
      const lockAspect =
        isCorner &&
        (e.shiftKey ||
          s.lockAspect === true ||
          s.locks?.noChangeAspect === true ||
          (s.kind === "path" && !!s.presetType));
      if (lockAspect) {
        const aspect = drag.startBbox.h === 0 ? 1 : drag.startBbox.w / drag.startBbox.h;
        // 对角 corner：按主导轴折算另一边。
        const signX = drag.corner === "ne" || drag.corner === "se" ? 1 : -1;
        const signY = drag.corner === "sw" || drag.corner === "se" ? 1 : -1;
        const ux = dx * signX;
        const uy = dy * signY;
        if (Math.abs(ux) >= Math.abs(uy)) {
          dy = (ux / aspect) * signY;
        } else {
          dx = uy * aspect * signX;
        }
      }
      let next = computeResize(drag.startBbox, drag.corner, dx, dy);
      next = keepOppositeHandleWorld(s.transform, drag.startBbox, next, drag.corner);
      rescaleInPlace(s, drag.startBbox, next);
      liveFollowGlue(slide, [s], true);
    }
    scheduleDragRedraw();
  });

  const captureMoveDragSnapshots = (slide: Slide, d: Extract<DragState, { type: "move" }>): void => {
    if (d.snapshotsCaptured) return;
    for (const id of d.ids) {
      if (d.snapshots.has(id)) continue;
      const s = findShape(slide, id);
      if (!s) continue;
      const snap = new Map() as PosSnapshot;
      snapshotPositions(s, snap);
      d.snapshots.set(id, snap);
    }
    d.snapshotsCaptured = true;
  };

  const executeLive = (cmd: EditCommand): void => {
    skipNextRemount = true;
    stack.execute(cmd);
  };
  const finishDrag = (e?: PointerEvent): void => {
    if (!drag) return;
    if (dragRaf) {
      cancelAnimationFrame(dragRaf);
      dragRaf = 0;
    }
    dragNeedsRemount = false;
    if (drag.type === "createShape") {
      const kind = drag.kind;
      let bbox = marqueeBox;
      const minDrag = 4;
      if (!bbox || (!drag.moved && bbox.w < minDrag && bbox.h < minDrag)) {
        const w = kind === "line" || kind === "arrow" ? 200 : 160;
        const h = kind === "line" || kind === "arrow" ? 2 : 100;
        bbox = { x: drag.startX - w / 2, y: drag.startY - h / 2, w, h };
      } else if (bbox.w < minDrag && bbox.h < minDrag) {
        const w = kind === "line" || kind === "arrow" ? 200 : 160;
        const h = kind === "line" || kind === "arrow" ? 2 : 100;
        bbox = { x: drag.startX - w / 2, y: drag.startY - h / 2, w, h };
      } else if ((kind === "line" || kind === "arrow") && bbox.h < 2) {
        bbox = { ...bbox, h: 2 };
      }
      const shape = makeShape(kind, bbox);
      pendingShapeKind = null;
      updateShapeDrawCursor();
      addShapeCmd(shape);
      selection.set([shape.id]);
      marqueeBox = null;
      drag = null;
      renderOverlay();
      return;
    }
    if (drag.type === "marquee") {
      if (marqueeBox) {
        const slide = viewSlide();
        const hits: string[] = [];
        if (slide) {
          for (const layer of slide.layers) {
            for (const s of layer.shapes) {
              if (rectIntersect(s.bbox, marqueeBox)) hits.push(s.id);
            }
          }
        }
        if (drag.addToSelection) {
          for (const id of hits) selection.toggle(id);
        } else if (hits.length) {
          selection.set(hits);
        }
      } else if (!drag.addToSelection) {
        const canvas = viewCanvasSize();
        const outsideSlide =
          drag.startX < 0 ||
          drag.startY < 0 ||
          drag.startX > canvas.width ||
          drag.startY > canvas.height;
        // 幻灯片里的空白单击选中背景。灰色工作区的空白单击只取消选中。
        if (outsideSlide) selection.clear();
        else selection.set([BACKGROUND_SEL_ID]);
      }
      marqueeBox = null;
      drag = null;
      renderOverlay();
      return;
    }
    if (drag.type === "rotate") {
      const slide = viewSlide();
      const s = slide ? findShape(slide, drag.id) : undefined;
      if (!s) {
        drag = null;
        return;
      }
      if (!drag.moved) {
        drag = null;
        return;
      }
      const after = s.transform.rotation;
      // 回滚到原值，然后通过 Cmd 重新应用，以便 undo / redo 正确。
      s.transform = { ...s.transform, rotation: drag.startRotation };
      executeLive(new SetShapeRotationCmd(index, drag.id, after));
      drag = null;
      return;
    }
    if (drag.type === "lineEndpoint") {
      const slide = viewSlide();
      const s = slide ? findShape(slide, drag.id) : undefined;
      if (!s || s.kind !== "line") {
        drag = null;
        return;
      }
      if (!drag.moved) {
        drag = null;
        return;
      }
      const after = { x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 };
      const afterBbox = { ...s.bbox };
      restorePositions(s, drag.snapshot);
      executeLive(new SetLineEndpointsCmd(index, drag.id, after, afterBbox, drag.snapped));
      drag = null;
      renderOverlay();
      return;
    }
    if (drag.type === "connectorEndpoint") {
      const slide = viewSlide();
      const s = slide ? findShape(slide, drag.id) : undefined;
      if (!s || !isPathConnector(s)) {
        drag = null;
        return;
      }
      if (!drag.moved) {
        drag = null;
        return;
      }
      const afterBbox = { ...s.bbox };
      const afterSX = s.transform.scaleX;
      const afterSY = s.transform.scaleY;
      restorePositions(s, drag.snapshot);
      s.transform = { ...drag.startTransform };
      if (drag.startCxn) s.startCxn = { ...drag.startCxn };
      else delete s.startCxn;
      if (drag.endCxn) s.endCxn = { ...drag.endCxn };
      else delete s.endCxn;
      regeneratePathShape(s);
      executeLive(new SetPathConnectorEndsCmd(index, drag.id, afterBbox, afterSX, afterSY, drag.snapped));
      drag = null;
      renderOverlay();
      return;
    }
    if (drag.type === "adjHandle") {
      const slide = viewSlide();
      const s = slide ? findShape(slide, drag.id) : undefined;
      if (!s || s.kind !== "path" || !s.presetType) {
        drag = null;
        return;
      }
      if (!drag.moved) {
        drag = null;
        return;
      }
      const after = { ...(s.presetAdj ?? {}) };
      s.presetAdj = { ...drag.startAdj };
      regeneratePathShape(s);
      executeLive(new SetPresetAdjCmd(index, drag.id, after));
      drag = null;
      renderOverlay();
      return;
    }
    if (drag.type === "polygonVertex") {
      const slide = viewSlide();
      const s = slide ? findShape(slide, drag.id) : undefined;
      if (!s || s.kind !== "polygon") {
        drag = null;
        return;
      }
      if (!drag.moved) {
        drag = null;
        return;
      }
      const afterPts = s.points.map((p) => [p[0], p[1]] as [number, number]);
      const afterBbox = { ...s.bbox };
      restorePositions(s, drag.snapshot);
      executeLive(new SetPolygonPointsCmd(index, drag.id, afterPts, afterBbox));
      drag = null;
      renderOverlay();
      return;
    }
    if (drag.type === "cropEdge" || drag.type === "cropPan" || drag.type === "cropMove" || drag.type === "cropScale") {
      drag = null;
      renderOverlay();
      return;
    }
    const slide = viewSlide();
    if (drag.type === "move") {
      const ids = drag.ids;
      if (!drag.moved) {
        // 表格 deep-select 的延迟分支（pointerdown 注释里的情景 B）：用户在
        // 已选中的 table group 上点了一下、没有拖动 → 现在才把 selection 切到
        // 具体被点的 cell。pointermove 一旦触发，moved=true 会跳过这里，让"拖
        // 动整张表"和"再点进入 cell 模式"共享同一个 pointer 手势。
        if (drag.pendingCellSelect) selection.set([drag.pendingCellSelect]);
        drag = null;
        guides = [];
        renderOverlay();
        return;
      }
      if (slide) captureMoveDragSnapshots(slide, drag);
      // 收集每个 shape 实际位移（可能含 snap）；先回滚再发命令，便于 undo / redo。
      const finalDeltas = new Map<string, { dx: number; dy: number }>();
      for (const id of ids) {
        const s = slide ? findShape(slide, id) : undefined;
        const start = drag.startBboxes.get(id);
        if (!s || !start) continue;
        const dx = s.bbox.x - start.x;
        const dy = s.bbox.y - start.y;
        if (dx !== 0 || dy !== 0) finalDeltas.set(id, { dx, dy });
        const snap = drag.snapshots.get(id);
        if (snap) restorePositions(s, snap);
      }
      // 多选合并一个 batch 命令（使用 BatchCmd）。
      const cmds: EditCommand[] = [];
      for (const [id, d] of finalDeltas) cmds.push(new MoveShapeCmd(index, id, d.dx, d.dy));
      if (cmds.length === 1) executeLive(cmds[0]!);
      else if (cmds.length > 1) executeLive(new BatchCmd("Move", cmds));
    } else if (drag.type === "resize") {
      const s = slide ? findShape(slide, drag.id) : undefined;
      if (!s) {
        drag = null;
        return;
      }
      if (!drag.moved) {
        drag = null;
        return;
      }
      const after: Rect = { ...s.bbox };
      restorePositions(s, drag.snapshot);
      executeLive(new ResizeShapeCmd(index, drag.id, after));
    }
    guides = [];
    drag = null;
    renderOverlay();
    void e;
  };
  const finishPan = (e: PointerEvent): void => {
    if (!panState || e.pointerId !== panState.pointerId) return;
    panState = null;
    setPanCursor(spaceHeld);
  };
  stage.addEventListener("pointerup", (e) => {
    if (panState && e.pointerId === panState.pointerId) {
      finishPan(e);
      return;
    }
    finishDrag(e);
  });
  stage.addEventListener("pointercancel", (e) => {
    if (panState && e.pointerId === panState.pointerId) {
      finishPan(e);
      return;
    }
    finishDrag(e);
  });

  stage.addEventListener("dblclick", (e) => {
    if (presentationView === "reading") return;
    const pt = screenToStage(e.clientX, e.clientY);
    const hit = hitTest(pt.x, pt.y);
    if (!hit) return;
    const slide = viewSlide();
    if (!slide) return;
    const top = findTopLevelId(slide, hit) ?? hit;
    // 命中的可能是 group（hitWalk 对 group 返回 group.id）；如果该 group 是表格
    // 或者其它带可编辑文本 cell 的 group，应该让用户直接编辑命中的具体 cell，
    // 而不是把整个 group 选中并尝试编辑"group 内第一个 text"（行为不直观）。
    const topShape = findShape(slide, top);
    const leafId = topShape?.kind === "group" ? hitLeafTextId(topShape, pt.x, pt.y) : null;
    if (leafId) {
      // 进入 cell 编辑：selection 直接落到具体 cell，Inspector 就显示 cell 的独立
      // 属性与"选中整张表格"返回按钮 —— 与 deep-select 单击行为一致；这样用户从
      // 编辑模式退出后还能继续修改 cell 的填充/描边/文字样式，而不会因为
      // selection 在 group 上而把改动应用到全部 cell。
      // 锁定保护统一在 startTextEdit 内部；这里仍然先 set selection，让用户能看到
      // 自己点中了什么并随后看到 toast 提示。
      selection.set([leafId]);
      startTextEdit(leafId, { clientX: e.clientX, clientY: e.clientY });
      return;
    }
    selection.set([top]);
    startTextEdit(top, { clientX: e.clientX, clientY: e.clientY });
  });


  const ro = new ResizeObserver(() => {
    fitStage();
    renderOverlay();
  });
  ro.observe(stageWrap);

  // Ctrl/Cmd + 滚轮缩放舞台：以鼠标位置为缩放锚点，让用户「放大去看哪儿，鼠标就一直停在哪儿」。
  // 阻止默认 = 阻止浏览器自身的页面级缩放。普通滚轮交给浏览器（让 stageWrap 滚动平移）。
  // 锚点本身的「reanchor scroll」逻辑统一在 setZoom 里实现，这里只负责换算 scale 和锚点。
  stageWrap.addEventListener(
    "wheel",
    (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const prev = stageScale;
      // wheel.deltaY > 0 表示向下滚 = 缩小；exp(-dy/300) 给一个平滑的指数手感。
      const factor = Math.exp(-e.deltaY / 300);
      const next = Math.max(0.1, Math.min(8, prev * factor));
      if (Math.abs(next - prev) < 1e-4) return;
      const wrapRect = stageWrap.getBoundingClientRect();
      setZoom(next, { x: e.clientX - wrapRect.left, y: e.clientY - wrapRect.top });
    },
    { passive: false },
  );

  // 磁盘文件拖放由外层标出舞台落点并插入。这里只接从其它窗口拖来的图片 URL，
  // 且不 preventDefault 文件拖放，否则外层看不到这次拖入。
  const onDragOver = (e: DragEvent): void => {
    const dt = e.dataTransfer;
    if (!dt || Array.from(dt.types ?? []).includes("Files")) return;
    if (!Array.from(dt.types ?? []).includes("text/uri-list")) return;
    e.preventDefault();
    dt.dropEffect = "copy";
  };
  const onDrop = (e: DragEvent): void => {
    const dt = e.dataTransfer;
    if (!dt || dt.files.length > 0) return;
    const url = dt.getData("text/uri-list") || dt.getData("text/plain");
    if (url && /^https?:|^data:image\//.test(url)) {
      e.preventDefault();
      const img = new Image();
      img.onload = () => insertImage(url, { w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => insertImage(url);
      img.src = url;
    }
  };
  stageWrap.addEventListener("dragover", onDragOver);
  stageWrap.addEventListener("drop", onDrop);

  let clipboard: Shape[] = [];

  const onKey = (e: KeyboardEvent): void => {
    // 用 target 命名，避免遮蔽顶部从 i18n 导入的 t()。
    const target = e.target as HTMLElement | null;
    if (target && (target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) {
      return;
    }
    if (presentationView === "reading") {
      const modKey = e.metaKey || e.ctrlKey;
      if (e.key === "Escape") {
        e.preventDefault();
        applyPresentationView("normal");
        return;
      }
      if (modKey && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        stack.undo();
        return;
      }
      if (modKey && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        stack.redo();
        return;
      }
      if (e.key === "Home") {
        e.preventDefault();
        gotoSlideRef.fn(0);
        return;
      }
      if (e.key === "End") {
        e.preventDefault();
        gotoSlideRef.fn(pres.slides.length - 1);
        return;
      }
      if (
        e.key === "ArrowRight" ||
        e.key === "ArrowDown" ||
        e.key === "PageDown" ||
        e.key === " " ||
        e.key === "Enter"
      ) {
        e.preventDefault();
        gotoSlideRef.fn(index + 1);
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "PageUp" || e.key === "Backspace") {
        e.preventDefault();
        gotoSlideRef.fn(index - 1);
        return;
      }
      return;
    }
    // Space 按下进入 pan 模式，松开退出。不消费事件（让其它处理器也能看到）。
    if (e.key === " " || e.code === "Space") {
      if (!spaceHeld) {
        spaceHeld = true;
        setPanCursor(true);
      }
      e.preventDefault();
      return;
    }
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      if (cropSession) {
        const dirty = cropSessionDirty();
        exitCropSession(false);
        if (dirty) return;
      }
      stack.undo();
    } else if (mod && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
      e.preventDefault();
      if (cropSession) {
        const dirty = cropSessionDirty();
        exitCropSession(false);
        if (dirty) return;
      }
      stack.redo();
    } else if (e.key === "Delete" || e.key === "Backspace") {
      if (cropSession) exitCropSession(true);
      e.preventDefault();
      // 锁定的 shape 不允许删除（与右键菜单 "Delete" 在 locked 时 disabled 行为对齐）。
      // 一致性策略：选中里只要有一个锁定，整次删除直接 noop —— 避免出现"勾掉一半"
      // 的视觉错位。要删请先 unlock。
      const slide = viewSlide();
      if (!slide) return;
      const ids = [...selection.values].filter((id) => id !== BACKGROUND_SEL_ID);
      if (ids.length === 0) return;
      const anyLocked = ids.some((id) => findShape(slide, id)?.locked);
      if (anyLocked) {
        showToast(t("editor.toast.locked.cantDelete"));
        return;
      }
      const tgt = viewTarget();
      for (const id of ids) {
        stack.execute(new DeleteShapeCmd(index, id, tgt));
      }
      selection.clear();
    } else if (mod && e.key === "ArrowLeft") {
      e.preventDefault();
      goto(index - 1);
    } else if (mod && e.key === "ArrowRight") {
      e.preventDefault();
      goto(index + 1);
    } else if (mod && e.key.toLowerCase() === "d") {
      e.preventDefault();
      duplicateSelection();
    } else if (mod && e.key.toLowerCase() === "g") {
      // 不可分组 / 取消分组时放行，保留浏览器的 ⌘G「查找下一个」。
      if (e.shiftKey ? !isSelectionGroup() : selection.values.size < 2) return;
      e.preventDefault();
      if (e.shiftKey) ungroupSelection();
      else groupSelection();
      toolbar.refresh();
    } else if (mod && e.key.toLowerCase() === "c") {
      e.preventDefault();
      copySelection();
      toolbar.refresh();
    } else if (mod && e.key.toLowerCase() === "x") {
      e.preventDefault();
      cutSelection();
      toolbar.refresh();
    } else if (mod && e.key.toLowerCase() === "v") {
      e.preventDefault();
      pasteClipboard();
      toolbar.refresh();
    } else if (mod && e.shiftKey && e.key === "]") {
      e.preventDefault();
      reorderSelection("front");
    } else if (mod && e.shiftKey && e.key === "[") {
      e.preventDefault();
      reorderSelection("back");
    } else if (mod && e.key === "]") {
      e.preventDefault();
      reorderSelection("forward");
    } else if (mod && e.key === "[") {
      e.preventDefault();
      reorderSelection("backward");
    } else if (mod && e.key.toLowerCase() === "a") {
      // §PowerPoint Ctrl+A：选中当前 slide 所有顶层 shape。group 视为整体。
      e.preventDefault();
      const slide = viewSlide();
      if (!slide) return;
      const ids: string[] = [];
      for (const ly of slide.layers) {
        if (!ly.visible) continue;
        for (const s of ly.shapes) {
          if (!s.locked) ids.push(s.id);
        }
      }
      selection.set(ids);
    } else if (mod && e.key.toLowerCase() === "f") {
      e.preventDefault();
      openFindReplace("find");
    } else if (mod && e.key.toLowerCase() === "h") {
      e.preventDefault();
      openFindReplace("replace");
    } else if (!mod && e.key === "F5") {
      if (e.shiftKey) {
        if (!opts.startSlideshowFromCurrent) return;
        e.preventDefault();
        opts.startSlideshowFromCurrent();
      } else if (opts.startSlideshowFromBeginning) {
        e.preventDefault();
        opts.startSlideshowFromBeginning();
      }
    } else if (!mod && e.key === "Tab") {
      // Tab / Shift+Tab：在当前 slide 的顶层 shapes 之间循环选中。
      e.preventDefault();
      const slide = viewSlide();
      if (!slide) return;
      const flat: string[] = [];
      for (const ly of slide.layers) {
        if (!ly.visible) continue;
        for (const s of ly.shapes) flat.push(s.id);
      }
      if (flat.length === 0) return;
      const cur = [...selection.values][0];
      let idx = cur ? flat.indexOf(cur) : -1;
      idx = (idx + (e.shiftKey ? -1 : 1) + flat.length) % flat.length;
      const next = flat[idx];
      if (next) selection.set([next]);
    } else if (!mod && e.key === "Escape") {
      if (cropSession) {
        e.preventDefault();
        exitCropSession(true);
        return;
      }
      if (inkMode) {
        e.preventDefault();
        inkMode = null;
        inkOverlay?.setMode(null);
        toolbar.refresh();
        return;
      }
      if (commentPlacementOn) {
        e.preventDefault();
        cancelCommentPlacement();
        return;
      }
      if (pendingShapeKind) {
        e.preventDefault();
        pendingShapeKind = null;
        updateShapeDrawCursor();
        return;
      }
      if (animationPainter.sourceId) {
        e.preventDefault();
        cancelAnimationPainter();
        return;
      }
      if (formatPainter.snapshot) {
        e.preventDefault();
        cancelFormatPainter();
        return;
      }
      if (aiPickMode && selection.values.size === 0) {
        e.preventDefault();
        setAiPickMode(false);
        return;
      }
      // Esc 行为：
      //   1) 有选中 → 先取消选中（保留编辑器，不退出）
      //   2) 已无选中 → 触发 onRequestClose（退出回放映/playground）
      if (selection.values.size > 0) {
        e.preventDefault();
        selection.clear();
      } else if (opts.onRequestClose) {
        e.preventDefault();
        opts.onRequestClose();
      }
    } else if (!mod && (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown")) {
      if (cropSession) exitCropSession(true);
      const step = e.shiftKey ? 10 : 1;
      const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
      const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
      if (!dx && !dy) return;
      if (selection.values.size === 0 || selection.isBackground()) return;
      e.preventDefault();
      const slide = viewSlide();
      if (!slide) return;
      for (const id of selection.values) {
        stack.execute(new MoveShapeCmd(index, syntheticTextBoxGroupId(slide, id), dx, dy));
      }
    }
  };
  root.addEventListener("keydown", (e) => {
    try {
      onKey(e);
    } catch (err) {
      if (!isEditingBlockedError(err)) throw err;
    }
  });
  const onDocKey = (e: KeyboardEvent): void => {
    if (presentationView !== "reading") return;
    if (root.contains(e.target as Node)) return;
    try {
      onKey(e);
    } catch (err) {
      if (!isEditingBlockedError(err)) throw err;
    }
  };
  host.ownerDocument.addEventListener("keydown", onDocKey);
  root.addEventListener("keyup", (e) => {
    if (e.key === " " || e.code === "Space") {
      spaceHeld = false;
      if (!panState) setPanCursor(false);
    }
  });
  // 失焦时清除空格态，避免「按住空格切走窗口再回来还是 grab」。
  root.addEventListener("blur", () => {
    if (spaceHeld) {
      spaceHeld = false;
      if (!panState) setPanCursor(false);
    }
  });

  const copySelection = (): void => {
    const slide = viewSlide();
    if (!slide) return;
    clipboard = [];
    for (const id of selection.values) {
      if (id === BACKGROUND_SEL_ID) continue;
      const s = findShape(slide, id);
      if (s) clipboard.push(cloneShape(s));
    }
  };

  const cutSelection = (): void => {
    const slide = viewSlide();
    if (!slide) return;
    const ids = [...selection.values].filter((id) => id !== BACKGROUND_SEL_ID);
    if (ids.length === 0) return;
    const anyLocked = ids.some((id) => findShape(slide, id)?.locked);
    if (anyLocked) {
      showToast(t("editor.toast.locked.cantDelete"));
      return;
    }
    copySelection();
    removeSelected();
  };

  const pasteClipboard = (mode: PasteSpecialMode = "default"): void => {
    if (clipboard.length === 0) return;
    const cmds: EditCommand[] = [];
    const newIds: string[] = [];
    const dx = mode === "inPlace" ? 0 : 16;
    const dy = mode === "inPlace" ? 0 : 16;
    for (const tpl of clipboard) {
      const copy = cloneShape(tpl, true);
      if (dx || dy) offsetShape(copy, dx, dy);
      if (isMasterEditContext(editorContext)) {
        cmds.push(new AddShapeCmd(index, 0, copy, viewTarget()));
      } else {
        const slide = pres.slides[index];
        const layerIdx = slide?.layers.length ? slide.layers.length - 1 : 0;
        cmds.push(new AddShapeCmd(index, layerIdx, copy));
      }
      if (mode === "plain") cmds.push(new ClearTextFormattingCmd(index, copy.id));
      newIds.push(copy.id);
    }
    if (cmds.length === 1) stack.execute(cmds[0]!);
    else if (cmds.length > 1) stack.execute(new BatchCmd("Paste", cmds));
    selection.set(newIds);
  };

  const openPasteSpecial = (mode: PasteSpecialMode): void => {
    pasteClipboard(mode);
    drawSlide(index);
    toolbar.refresh();
  };

  const applyChangeCaseToSelection = (mode: TextCaseMode): void => {
    for (const id of selection.values) {
      if (id === BACKGROUND_SEL_ID) continue;
      stack.execute(new ChangeTextCaseCmd(index, id, mode));
    }
  };

  const insertSlideAfterCurrent = (): void => {
    const at = Math.min(pres.slides.length, index + 1);
    const slide = createSlideFromMaster(pres.masters, {
      index: at,
      preferredTypes: ["obj", "titleOnly", "twoObj", "title", "blank"],
    });
    stack.execute(new InsertSlideCmd(at, slide));
    goto(at);
  };

  const openLayoutPicker = (): void => {
    const slide = pres.slides[index];
    if (!slide) return;
    const layouts = filterLayoutsToWhitelist(listLayoutsForSlide(pres, slide));
    openLayoutPickerDialog(host.ownerDocument, layouts, slide.layoutRef, (entry) => {
      stack.execute(new ApplySlideLayoutCmd(index, { masterId: entry.masterId, layoutId: entry.layoutId }));
      selection.clear();
      drawSlide(index);
      toolbar.refresh();
    });
  };

  const resetSlideLayout = (): void => {
    if (!pres.slides[index]?.layoutRef) return;
    stack.execute(new ResetSlideToLayoutCmd(index));
    selection.clear();
    drawSlide(index);
    toolbar.refresh();
  };

  const addSectionAtCurrent = (): void => {
    const n = (pres.sections?.length ?? 0) + 1;
    openSectionDialog(host.ownerDocument, { defaultName: t("sectionDialog.defaultName", { n: String(n) }) }, (name) => {
      stack.execute(new SetDeckSectionsCmd(addSectionAt(pres.sections, index, name)));
      toolbar.refresh();
    });
  };

  const applyQuickStyleToSelection = (presetId: string): void => {
    const preset = QUICK_STYLE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const ids = [...selection.values].filter((id) => id !== BACKGROUND_SEL_ID);
    if (ids.length === 0) return;
    const cmds: EditCommand[] = [];
    for (const id of ids) {
      cmds.push(new SetFillCmd(index, id, preset.fill));
      if (preset.stroke) cmds.push(new SetStrokeCmd(index, id, preset.stroke));
    }
    if (cmds.length === 1) stack.execute(cmds[0]!);
    else stack.execute(new BatchCmd(t("cmd.quickStyle"), cmds));
    drawSlide(index);
    toolbar.refresh();
  };

  const convertInkToShape = (): void => {
    const inkIds = [...selection.values].filter((id) => isInkShapeId(id));
    if (inkIds.length === 0) {
      showToast(t("editor.ink.convertNone"));
      return;
    }
    stack.execute(new ConvertInkToShapeCmd(index, inkIds));
    selection.clear();
    drawSlide(index);
    toolbar.refresh();
  };

  const collectInkPaths = (ids?: ReadonlySet<string>): PathShape[] => {
    const slide = pres.slides[index];
    if (!slide) return [];
    const out: PathShape[] = [];
    for (const layer of slide.layers) {
      for (const s of layer.shapes) {
        if (s.kind !== "path" || !isInkShapeId(s.id)) continue;
        if (ids && !ids.has(s.id)) continue;
        out.push(s);
      }
    }
    return out;
  };

  const convertInkToText = (): void => {
    if (!isInkOcrSupported()) {
      showToast(t("editor.ink.ocrUnsupported"));
      return;
    }
    if (inkMode) {
      inkMode = null;
      inkOverlay?.setMode(null);
      toolbar.refresh();
    }
    const selectedInk = new Set([...selection.values].filter((id) => isInkShapeId(id)));
    const paths = selectedInk.size > 0 ? collectInkPaths(selectedInk) : collectInkPaths();
    if (!paths.length) {
      showToast(t("editor.ink.convertNone"));
      return;
    }
    const inkIds = paths.map((p) => p.id);
    const scope = selectedInk.size > 0 ? "selected" : "all";
    void (async () => {
      try {
        const crop = unionInkBbox(paths);
        const canvas = rasterizeInkPaths(paths, crop);
        const previewDataUrl = canvas.toDataURL("image/png");
        const langTag = proofingLangTag(pres);
        // Local-first: on-device PaddleOCR (PP-OCRv6_medium) beats the cloud vision
        // models on handwritten CJK, so it is the default. AI stays opt-in and the
        // user triggers it explicitly from the dialog (see recognizeWithAi below).
        //
        // The ~140 MB model downloads lazily: only when the user triggers Ink-to-Text
        // and it is not yet loaded do we prompt for consent + show download progress.
        if (!paddleOcrReady()) {
          const ready = await openInkOcrModelDialog(host.ownerDocument, {
            approxBytes: PADDLE_MODEL_APPROX_BYTES,
            autoStart: hasPaddleModelConsent(),
            load: (onProgress) => preloadPaddleOcr(onProgress),
          });
          if (!ready) {
            showToast(t("editor.ink.ocrModelDeclined"));
            return;
          }
        }
        showToast(
          t(scope === "selected" ? "editor.ink.ocrLoadingSelected" : "editor.ink.ocrLoadingAll", {
            n: String(paths.length),
          }),
        );
        let ocr: InkOcrResult | null = await recognizeInkPaddle(canvas, langTag, {
          strokeCount: paths.length,
          previewDataUrl,
          scope,
        });
        if (!ocr) {
          ocr = await recognizeInkCanvas(canvas, tesseractLangFromProofing(langTag), {
            strokeCount: paths.length,
            previewDataUrl,
            scope,
            crop,
          });
        }
        const recognize = opts.recognizeHandwriting;
        const recognizeWithAi = recognize
          ? async (): Promise<InkOcrResult | null> => {
              const vision = await recognize({
                dataUrl: previewDataUrl,
                strokeCount: paths.length,
                lang: langTag,
              });
              const text = vision?.text.replace(/\s+/g, " ").trim() ?? "";
              if (!text) return null;
              return {
                text,
                confidence: 88,
                lang: langTag,
                strokeCount: paths.length,
                previewDataUrl,
                engine: "vision",
                scope,
              };
            }
          : undefined;
        const picked = await openInkOcrDialog(host.ownerDocument, ocr, { recognizeWithAi });
        if (!picked?.text) return;
        const bbox = inflateRect(unionInkBbox(paths), 8);
        stack.execute(new ConvertInkToTextCmd(index, inkIds, picked.text, bbox));
        selection.clear();
        drawSlide(index);
        toolbar.refresh();
      } catch {
        showToast(t("editor.ink.ocrFailed"));
      }
    })();
  };

  const TEXT_RUN_SHADOW: ShapeEffect[] = [
    { kind: "outer", blur: 3, dx: 2, dy: 2, color: "#000000", alpha: 0.45 },
  ];

  const toggleTextShadowOnSelection = (): void => {
    const run = firstSelectedTextRun();
    const hasShadow = run?.effects?.some((e) => e.kind === "outer") ?? false;
    for (const id of selection.values) {
      if (id === BACKGROUND_SEL_ID) continue;
      stack.execute(new SetTextStyleCmd(index, id, { effects: hasShadow ? null : TEXT_RUN_SHADOW }, editingRangesFor(id)));
    }
    drawSlide(index);
    toolbar.refresh();
  };

  const isTextShadowOnSelection = (): boolean => {
    const run = firstSelectedTextRun();
    return run?.effects?.some((e) => e.kind === "outer") ?? false;
  };

  const setBookmarkOnSelection = (): void => {
    const run = firstSelectedTextRun();
    openBookmarkDialog(host.ownerDocument, { initial: run?.bmk }, (name) => {
      for (const id of selection.values) {
        if (id === BACKGROUND_SEL_ID) continue;
        stack.execute(new SetTextStyleCmd(index, id, { bmk: name || null }, editingRangesFor(id)));
      }
      drawSlide(index);
      toolbar.refresh();
    });
  };

  const insertFieldTextBox = (field: string, name: string, align: "start" | "end"): void => {
    const padX = pres.size.width * 0.05;
    const padY = pres.size.height * 0.05;
    const w = Math.min(pres.size.width * 0.4, 320);
    const h = 32;
    const y = pres.size.height - padY - h;
    const x = align === "end" ? pres.size.width - padX - w : padX;
    const shape = makeShape("text", { x, y, w, h });
    if (shape.kind !== "text") return;
    shape.name = name;
    const text = resolveFieldText(field, { slideIndex: index });
    shape.paragraphs = [
      {
        runs: [{ text, field, fontSize: 12, color: "#6b7280" }],
        align: align === "end" ? "end" : "start",
      },
    ];
    addShapeCmd(shape);
    selection.set([shape.id]);
    drawSlide(index);
    toolbar.refresh();
  };

  const insertDateTimeField = (): void => insertFieldTextBox("datetime", "Date", "end");
  const insertSlideNumberField = (): void => insertFieldTextBox("slidenum", "Slide Number", "end");

  const applyThemeVariantToDeck = (variantId: string): void => {
    if (!pres.theme?.colors) {
      showToast(t("themeVariant.noTheme"));
      return;
    }
    if (!THEME_VARIANT_OPTIONS.some((v) => v.id === variantId)) return;
    stack.execute(new ApplyThemeVariantCmd(variantId as ThemeVariantId));
    drawSlide(index);
    toolbar.refresh();
  };

  const duplicateSelection = (): void => {
    const slide = viewSlide();
    if (!slide || selection.values.size === 0) return;
    const newIds: string[] = [];
    for (const id of selection.values) {
      const s = findShape(slide, id);
      if (!s) continue;
      const copy = cloneShape(s, true);
      offsetShape(copy, 16, 16);
      addShapeCmd(copy);
      newIds.push(copy.id);
    }
    selection.set(newIds);
  };

  const reorderSelection = (direction: "front" | "back" | "forward" | "backward"): void => {
    if (selection.isBackground()) return;
    const tgt = viewTarget();
    for (const id of selection.values) {
      if (id === BACKGROUND_SEL_ID) continue;
      stack.execute(new ReorderShapeCmd(index, id, direction, tgt));
    }
  };

  const addShapeCmd = (shape: Shape): void => {
    if (isMasterEditContext(editorContext)) {
      stack.execute(new AddShapeCmd(index, 0, shape, viewTarget()));
    } else {
      const slide = pres.slides[index];
      const layerIdx = slide?.layers.length ? slide.layers.length - 1 : 0;
      stack.execute(new AddShapeCmd(index, layerIdx, shape));
    }
  };

  const insertShape = (kind: InsertShapeKind): void => {
    const slide = viewSlide();
    if (!slide) return;
    const size = viewCanvasSize();
    const cx = size.width / 2;
    const cy = size.height / 2;
    const w = kind === "text" ? 240 : kind === "line" || kind === "arrow" ? 200 : 160;
    const h = kind === "text" ? 60 : kind === "line" || kind === "arrow" ? 0 : 100;
    const finalH = h === 0 ? 2 : h;
    const shape = makeShape(kind, { x: cx - w / 2, y: cy - finalH / 2, w, h: finalH });
    addShapeCmd(shape);
    selection.set([shape.id]);
  };

  const armShapeDraw = (kind: InsertShapeKind): void => {
    if (kind === "text") {
      insertShape(kind);
      return;
    }
    cancelCommentPlacement();
    pendingShapeKind = kind;
    updateShapeDrawCursor();
    showToast(t("editor.toast.shapeDrawArm"));
  };

  const toggleSpelling = (): boolean => {
    spellingEnabled = !spellingEnabled;
    notesArea.spellcheck = spellingEnabled;
    altView?.setSpellcheck?.(spellingEnabled);
    return spellingEnabled;
  };

  const setColorViewMode = (mode: ColorViewMode): void => {
    colorViewMode = mode;
    applyColorViewMode();
  };

  const insertImage = (src: string, natural?: { w: number; h: number }): void => {
    if (!viewSlide()) return;
    const cx = pres.size.width / 2;
    const cy = pres.size.height / 2;
    const aspect = natural ? natural.w / natural.h : 16 / 9;
    let w = Math.min(pres.size.width * 0.6, 480);
    let h = w / aspect;
    if (h > pres.size.height * 0.6) {
      h = pres.size.height * 0.6;
      w = h * aspect;
    }
    const shape: Shape = {
      id: genShapeId("img"),
      name: "Picture",
      zIndex: 0,
      visible: true,
      locked: false,
      opacity: 1,
      bbox: { x: cx - w / 2, y: cy - h / 2, w, h },
      transform: { tx: 0, ty: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0 },
      kind: "image",
      src,
      natural,
    };
    addShapeCmd(shape);
    selection.set([shape.id]);
  };

  const insertModel3D = (presetId: string, glbSrc: string, objectName?: string): void => {
    if (!viewSlide()) return;
    const cx = pres.size.width / 2;
    const cy = pres.size.height / 2;
    const w = pres.size.width * 0.45;
    const h = pres.size.height * 0.55;
    const bbox = { x: cx - w / 2, y: cy - h / 2, w, h };
    const slide = pres.slides[index];
    const layerIdx = isMasterEditContext(editorContext)
      ? 0
      : slide && slide.layers.length > 0
        ? slide.layers.length - 1
        : 0;
    const cmd = new InsertModel3DCmd(index, layerIdx, presetId, glbSrc, bbox, objectName);
    stack.execute(cmd);
    selection.set([cmd.shape.id]);
  };

  const insertOleObject = (
    fileName: string,
    embedSrc: string,
    showAsIcon: boolean,
  ): void => {
    if (!viewSlide()) return;
    const cx = pres.size.width / 2;
    const cy = pres.size.height / 2;
    const w = Math.min(pres.size.width * 0.42, 360);
    const h = Math.min(pres.size.height * 0.38, 220);
    const bbox = { x: cx - w / 2, y: cy - h / 2, w, h };
    const slide = pres.slides[index];
    const layerIdx = isMasterEditContext(editorContext)
      ? 0
      : slide && slide.layers.length > 0
        ? slide.layers.length - 1
        : 0;
    const cmd = new InsertOleCmd(index, layerIdx, { fileName, embedSrc, bbox, showAsIcon });
    stack.execute(cmd);
    selection.set([cmd.shape.id]);
  };

  const insertWebEmbed = (): void => {
    void openWebEmbedDialog(host.ownerDocument).then((picked) => {
      if (!picked) return;
      if (!viewSlide()) return;
      const aspect = 16 / 9;
      let w = Math.min(pres.size.width * 0.6, 480);
      let h = w / aspect;
      if (h > pres.size.height * 0.6) {
        h = pres.size.height * 0.6;
        w = h * aspect;
      }
      const cx = pres.size.width / 2;
      const cy = pres.size.height / 2;
      const bbox = { x: cx - w / 2, y: cy - h / 2, w, h };
      const slide = pres.slides[index];
      const layerIdx = isMasterEditContext(editorContext)
        ? 0
        : slide && slide.layers.length > 0
          ? slide.layers.length - 1
          : 0;
      const cmd = new InsertWebEmbedCmd(index, layerIdx, { embed: picked.embed, bbox });
      stack.execute(cmd);
      selection.set([cmd.shape.id]);
      drawSlide(index);
      toolbar.refresh();
      refreshStatus();
    });
  };

  // 视频 / 音频插入。video 默认占用舞台中间一块 16:9 区域；audio 由于本身无可视尺寸，
  // 用一个小的 200x200 占位（renderer 会画 audio 图标）。两者 src 都用 DataURL。
  //
  // opts.w / opts.h 是视频文件的原始像素（pickMediaFile 用 <video>.videoWidth/Height 读出）。
  // 高分辨率视频（1080p / 4K）直接当 bbox 用会超出幻灯片，把 8 个 resize 手柄推到舞台
  // 外面，用户看不到也抓不到——所以 opts 只当作"取宽高比"用，实际尺寸卡到幻灯片的 60%
  // 内（与 insertImage 一致）。
  const insertVideo = (
    src: string,
    opts?: { duration?: number; w?: number; h?: number; poster?: string; autoplay?: boolean },
  ): void => {
    if (!viewSlide()) return;
    const aspect =
      opts?.w && opts?.h && opts.w > 0 && opts.h > 0 ? opts.w / opts.h : 16 / 9;
    let w = Math.min(pres.size.width * 0.6, 480);
    let h = w / aspect;
    if (h > pres.size.height * 0.6) {
      h = pres.size.height * 0.6;
      w = h * aspect;
    }
    const cx = pres.size.width / 2;
    const cy = pres.size.height / 2;
    const shape: Shape = {
      id: genShapeId("vid"),
      name: "Video",
      zIndex: 0,
      visible: true,
      locked: false,
      opacity: 1,
      bbox: { x: cx - w / 2, y: cy - h / 2, w, h },
      transform: { tx: 0, ty: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0 },
      kind: "video",
      src,
      controls: true,
      duration: opts?.duration,
      ...(opts?.poster ? { poster: opts.poster } : {}),
      ...(opts?.autoplay ? { autoplay: true } : {}),
    } as Shape;
    addShapeCmd(shape);
    selection.set([shape.id]);
  };
  const insertAudio = (src: string, opts?: { duration?: number; narration?: boolean }): void => {
    if (!viewSlide()) return;
    const w = 100;
    const h = 100;
    const cx = pres.size.width / 2;
    const cy = pres.size.height / 2;
    const shape: Shape = {
      id: genShapeId("aud"),
      name: "Audio",
      zIndex: 0,
      visible: true,
      locked: false,
      opacity: 1,
      bbox: { x: cx - w / 2, y: cy - h / 2, w, h },
      transform: { tx: 0, ty: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0 },
      kind: "audio",
      src,
      duration: opts?.duration,
      ...(opts?.narration ? { autoplay: true, isNarration: true } : {}),
    } as Shape;
    addShapeCmd(shape);
    selection.set([shape.id]);
  };

  const decodeImageSize = (src: string): Promise<{ w: number; h: number } | undefined> =>
    new Promise((resolve) => {
      const img = host.ownerDocument.createElement("img");
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve(undefined);
      img.src = src;
    });

  const decodeVideoMeta = (src: string): Promise<{ duration?: number; w?: number; h?: number }> =>
    new Promise((resolve) => {
      const video = host.ownerDocument.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () =>
        resolve({ duration: video.duration, w: video.videoWidth, h: video.videoHeight });
      video.onerror = () => resolve({});
      video.src = src;
    });

  const decodeAudioDuration = (src: string): Promise<number | undefined> =>
    new Promise((resolve) => {
      const audio = host.ownerDocument.createElement("audio");
      audio.preload = "metadata";
      audio.onloadedmetadata = () => resolve(audio.duration);
      audio.onerror = () => resolve(undefined);
      audio.src = src;
    });

  const insertMediaFiles = async (files: readonly File[]): Promise<void> => {
    const list = files.filter((file) => mediaKindOf(file));
    if (list.length === 0) return;
    const doc = host.ownerDocument;
    const total = list.reduce((sum, file) => sum + file.size, 0);
    let done = 0;
    showFileProgress(doc, t("editor.fileProgress.reading", { name: list[0]!.name }));
    try {
      for (const file of list) {
        const kind = mediaKindOf(file);
        if (!kind) continue;
        showFileProgress(doc, t("editor.fileProgress.reading", { name: file.name }));
        const src = await readAsDataURL(file, (ratio) => {
          setFileProgress(combinedReadRatio(done, ratio, file.size, total));
        });
        done += file.size;
        showFileProgress(doc, t("editor.fileProgress.inserting", { name: file.name }));
        setFileProgress(Number.NaN);
        if (kind === "image") {
          const natural = await decodeImageSize(src);
          insertImage(src, natural);
        } else if (kind === "video") {
          const meta = await decodeVideoMeta(src);
          insertVideo(src, meta);
        } else {
          const duration = await decodeAudioDuration(src);
          insertAudio(src, { duration });
        }
      }
    } catch {
      showToast(t("editor.fileProgress.failed"));
    } finally {
      hideFileProgress();
    }
  };

  // 通用文件 picker：根据 accept 区分 image / video / audio，统一走 DataURL。
  const pickMediaFile = (kind: "video" | "audio"): void => {
    const inp = host.ownerDocument.createElement("input");
    inp.type = "file";
    inp.accept = kind === "video" ? "video/*" : "audio/*";
    inp.addEventListener("change", () => {
      const f = inp.files?.[0];
      if (f) void insertMediaFiles([f]);
    });
    inp.click();
  };

  // setZoom: 切换缩放比例 / 模式。
  //
  // anchor 是 stageWrap 视口坐标系下需要在缩放前后保持「不动」的点（0..width / 0..height,
  // 以 getBoundingClientRect 为基准、含 padding 区域；视口外的坐标会被钳到端点）。
  // 不传时默认锚定到视口中心 —— 这样状态栏 +/-、Fit/50%/100%/150%/200% 等按钮、
  // 右键「适应窗口」一类入口切缩放时，舞台以中心为基点放大缩小，不会突然把
  // 内容甩到左上角；wheel handler 显式传入鼠标位置，保留「放大去看哪儿、鼠标停哪儿」
  // 的体验。
  //
  // 实现：先在旧 scale 下把 anchor 反推到 slide 坐标 (slideX, slideY)，
  // 再 fitStage() 应用新 scale，最后用 rAF 等浏览器把新尺寸 layout 完后回算 scroll，
  // 让该 slide 点重新落在 anchor 视口位置上。
  // 坐标体系统一用「stage / wrap 的 viewport offset」（getBoundingClientRect 之差），
  // 不要混 content 坐标 + viewport 坐标 —— 否则 scrollLeft != 0 时算出来的锚点会漂。
  const setZoom = (mode: "fit" | number, anchor?: { x: number; y: number }): void => {
    const prev = stageScale;
    const wrapRect = stageWrap.getBoundingClientRect();
    const ax = anchor?.x ?? wrapRect.width / 2;
    const ay = anchor?.y ?? wrapRect.height / 2;
    const stageRect = stage.getBoundingClientRect();
    // anchor 相对 stage 左上角的 viewport 像素 → 除以 prev 得 slide 单位坐标。
    const slideX = prev > 0 ? (ax - (stageRect.left - wrapRect.left)) / prev : 0;
    const slideY = prev > 0 ? (ay - (stageRect.top - wrapRect.top)) / prev : 0;

    zoomMode = mode;
    fitStage();
    renderOverlay();
    refreshStatus();

    const next = stageScale;
    if (Math.abs(next - prev) < 1e-4) return;
    // 用 rAF 等 layout 应用完 stage.style.width/height 后再读 stageRect / 写 scroll，
    // 避免读到旧尺寸算出错误偏移。
    requestAnimationFrame(() => {
      const newRect = stage.getBoundingClientRect();
      const wRect = stageWrap.getBoundingClientRect();
      // 当前（reanchor 前）stage 在视口里的位置。
      const newViewportX = newRect.left - wRect.left;
      const newViewportY = newRect.top - wRect.top;
      // 想达成的状态：newViewportX' + slideX * next = ax
      // scrollLeft 增加 Δ → newViewportX' = newViewportX - Δ → Δ = newViewportX + slideX*next - ax。
      stageWrap.scrollLeft += newViewportX + slideX * next - ax;
      stageWrap.scrollTop += newViewportY + slideY * next - ay;
    });
  };

  const toggleGrid = (): boolean => {
    gridOn = !gridOn;
    renderGrid();
    refreshRibbonToggles?.();
    return gridOn;
  };
  const renderGrid = (): void => {
    if (gridEl) {
      gridEl.remove();
      gridEl = null;
    }
    if (!gridOn) return;
    const NS = "http://www.w3.org/2000/svg";
    const g = host.ownerDocument.createElementNS(NS, "g");
    g.setAttribute("data-grid", "1");
    const step = VISUAL_GRID_STEP;
    const doc = host.ownerDocument;
    const paintGrid = (x1: number, y1: number, x2: number, y2: number): void => {
      appendAidLine(
        doc,
        g,
        (ln) => {
          ln.setAttribute("x1", String(x1));
          ln.setAttribute("y1", String(y1));
          ln.setAttribute("x2", String(x2));
          ln.setAttribute("y2", String(y2));
        },
        gridAidColor,
        GRID_AID_WIDTH,
        gridAidOpacity,
      );
    };
    for (let x = 0; x <= pres.size.width; x += step) paintGrid(x, 0, x, pres.size.height);
    for (let y = 0; y <= pres.size.height; y += step) paintGrid(0, y, pres.size.width, y);
    overlay.insertBefore(g, overlay.firstChild);
    gridEl = g;
  };

  const goto = (i: number): void => {
    selection.clear();
    drawSlide(i);
  };
  gotoSlideRef.fn = goto;
  lecturePanel = mountLecturePanel(lectureHost, {
    getPres: () => pres,
    getSlideIndex: () => index,
    goto,
    execute: (cmd) => stack.execute(cmd),
    cameraSrc: opts.lectureCameraSrc,
    recordSlide: opts.recordLectureSlide,
  });

  const startTextEdit = (id?: string, at?: { clientX: number; clientY: number }): void => {
    const slide = pres.slides[index];
    if (!slide) return;
    const targetId = id ?? [...selection.values][0];
    if (!targetId) return;
    const s = findShape(slide, targetId);
    if (!s) return;
    // 锁定的 shape（或其所属表格 group）禁止进入文本编辑；统一收口在这里，
    // 不论 dblclick / 外部 API / Enter 都会被拦截，并 toast 提醒用户先解锁。
    const parentGroup = findParentGroup(slide, targetId);
    if (s.locked || parentGroup?.locked) {
      showToast(t("editor.toast.locked.cantEdit"));
      return;
    }
    const text = pickTextShape(s);
    if (!text || text.kind !== "text") return;
    openTextEditor(text, targetId, at);
  };

  const openTextEditor = (
    text: Shape & { kind: "text" },
    targetId: string,
    at?: { clientX: number; clientY: number },
  ): void => {
    // 同一时刻只允许一个行内编辑器；再次双击其它文本框时先提交上一个。
    activeTextEdit?.close(true);
    const doc = host.ownerDocument;
    // stage 相对 stageWrap **内容坐标系**的原点。stageWrap 是 position:absolute +
    // overflow:auto 的滚动容器，也就是 overlay 的 containing block —— 绝对定位的子元素
    // 会随内容一起滚动，而 getBoundingClientRect() 拿到的是已经减掉 scrollLeft/Top 的
    // 视口坐标。不把 scroll 量加回去，放大后滚动过的画布上双击，overlay 会整体偏移
    // 一个滚动距离（缩放越大偏得越远）。
    const origin = {
      x: stage.getBoundingClientRect().left - stageWrap.getBoundingClientRect().left + stageWrap.scrollLeft,
      y: stage.getBoundingClientRect().top - stageWrap.getBoundingClientRect().top + stageWrap.scrollTop,
    };
    const editingSlide = viewSlide();
    const editor = buildTextEditOverlay({
      doc,
      shape: text,
      scale: stageScale,
      origin,
      spellcheck: spellingEnabled,
      lang: proofingLangTag(pres),
      // 解析后的 TextBox 是 group(_base,_text)，rotation 挂在外层；不把祖先
      // 变换叠上去，overlay 会落在未旋转的 bbox 上，和画面上的文字错开。
      ancestors: editingSlide ? findShapeAncestors(editingSlide, text.id) : [],
    });
    // overlay 挂在 stageWrap（stage 的兄弟）上：stage 自身 user-select:none，且
    // drawSlide 会把选中框 overlay 重新置顶，挂在 stage 内会被手柄盖住并拦截点击。
    stageWrap.appendChild(editor);
    // normAutofit 的运行时缩放 + 基线对齐都要在有布局之后才能测量。
    const fontScale = fitOverlayAutofit(editor, text, stageScale, doc);
    alignOverlayBaselines(editor, text, stageScale, doc, fontScale);
    let charRanges: TextCharRange[] | null = null;
    let rangeRefreshRaf = 0;
    const syncRangeProps = (): void => {
      scheduleSyncFormatBar();
      refreshRibbonToggles?.();
      const win = doc.defaultView;
      if (!win?.requestAnimationFrame) {
        queueInspectorRefresh();
        return;
      }
      if (rangeRefreshRaf) return;
      rangeRefreshRaf = win.requestAnimationFrame(() => {
        rangeRefreshRaf = 0;
        if (closed) return;
        queueInspectorRefresh();
      });
    };

    // 编辑期把原 shape 从场景里隐藏：overlay 已经完整复刻了 fill / 文字样式，
    // 若不隐藏就会和 overlay 的文字重影（以前是靠给 overlay 铺白底遮住原文字，
    // 代价是深色主题下变成"白底浅字"看不见）。
    // 隐藏文字叶子而不是整个 group：解析后的 TextBox 是 group(_base,_text)，
    // 藏 group 会把几何底一起拿掉；只藏 _text，底还在，overlay 叠在上面。
    let sceneNode =
      runtime?.scene.root.findById(text.id) ?? runtime?.scene.root.findById(targetId) ?? null;
    const hideSource = (): void => {
      sceneNode =
        runtime?.scene.root.findById(text.id) ?? runtime?.scene.root.findById(targetId) ?? sceneNode;
      sceneNode?.setProperty("visible", false);
    };
    hideSource();
    const restoreScene = (): void => {
      sceneNode =
        runtime?.scene.root.findById(text.id) ?? runtime?.scene.root.findById(targetId) ?? sceneNode;
      sceneNode?.setProperty("visible", (text.visible ?? true) !== false);
    };

    editor.focus();
    // 光标落在双击的位置，而不是全选。全选会给整段文字盖一层蓝色高亮 —— 那本身
    // 就是"双击后文字看起来变了"的一部分，而且紧接着敲一个字会把整段文本清空。
    // 没有点击点（外部 API 调 startTextEdit）时退化为把光标放到文末。
    placeCaretIn(editor, doc, at);

    // 原段文本快照：用于判断是否真的有改动。
    const origParas = text.paragraphs.map((p) => p.runs.map((r) => r.text).join(""));
    // commit 必须落到"打开编辑时的那一页"，不能用可变的 index。
    const slideIdx = index;
    let composing = false;
    let closed = false;
    let pinRanges = false;

    const syncFromModel = (): void => {
      if (closed) return;
      const live = readEditorParagraphs(editor);
      const model = text.paragraphs.map((p) => p.runs.map((r) => r.text).join(""));
      if (live.length !== model.length || live.some((line, i) => line !== model[i])) return;
      const saved = charRanges?.map((range) => ({ ...range })) ?? null;
      const focusBack = doc.activeElement instanceof HTMLElement ? doc.activeElement : null;
      renderParagraphsInto(editor, text, stageScale, doc, fontScale);
      alignOverlayBaselines(editor, text, stageScale, doc, fontScale);
      if (saved && saved.length > 0) {
        selectTextCharRanges(editor, saved);
        charRanges = saved;
        pinRanges = true;
        // 恢复选区会把焦点拉回编辑框，字号框里还没打完的数字就断了。
        if (focusBack && focusBack !== editor && doc.activeElement === editor) focusBack.focus();
        refreshPinnedHighlight();
      }
    };
    const refreshPinnedHighlight = (): void => {
      if (closed) return;
      // 编辑框自己有焦点时用系统选中色。焦点在字号或字体框里时系统色不画，补一层。
      if (charRanges && charRanges.length > 0 && doc.activeElement !== editor) {
        paintPinnedCharSelection(editor, charRanges);
        return;
      }
      clearPinnedCharSelection(doc);
    };
    const onSelectionChange = (): void => {
      if (closed) return;
      const sel = doc.getSelection();
      if (!sel?.anchorNode || !editor.contains(sel.anchorNode)) return;
      if (sel.isCollapsed) {
        if (pinRanges) {
          refreshPinnedHighlight();
          return;
        }
        if (doc.activeElement === editor) {
          charRanges = null;
          clearPinnedCharSelection(doc);
          syncRangeProps();
        }
        return;
      }
      // 重绘后恢复选区会异步冒出 selectionchange。这时焦点还在字号框里，
      // 不能把刚补上的选中底色清掉。人在编辑框里拖选时焦点在编辑框上，走下面。
      if (pinRanges && doc.activeElement !== editor) {
        refreshPinnedHighlight();
        return;
      }
      pinRanges = false;
      charRanges = textCharRangesFromSelection(editor, sel);
      clearPinnedCharSelection(doc);
      syncRangeProps();
    };
    const onPointerDown = (ev: Event): void => {
      const target = ev.target;
      if (!(target instanceof Element) || !target.closest(FORMAT_CHROME)) return;
      const sel = doc.getSelection();
      if (!sel || sel.isCollapsed || !sel.anchorNode || !editor.contains(sel.anchorNode)) return;
      charRanges = textCharRangesFromSelection(editor, sel);
      pinRanges = true;
      doc.defaultView?.setTimeout(refreshPinnedHighlight, 0);
    };
    doc.addEventListener("selectionchange", onSelectionChange);
    doc.addEventListener("pointerdown", onPointerDown, true);

    const close = (doCommit: boolean): void => {
      if (closed) return;
      closed = true;
      activeTextEdit = null;
      clearPinnedCharSelection(doc);
      doc.removeEventListener("selectionchange", onSelectionChange);
      doc.removeEventListener("pointerdown", onPointerDown, true);
      if (rangeRefreshRaf) doc.defaultView?.cancelAnimationFrame(rangeRefreshRaf);
      const next = readEditorParagraphs(editor);
      editor.removeEventListener("blur", onBlur);
      editor.remove();
      restoreScene();
      if (!doCommit) return;
      // 文本无变化时绝不执行 EditTextCmd —— 双击进入再退出不会破坏多 run 样式。
      if (next.length === origParas.length && next.every((line, i) => line === origParas[i])) {
        return;
      }
      stack.execute(new EditTextCmd(slideIdx, targetId, next));
    };
    const onBlur = (): void => {
      // IME 组合串未上屏时 blur（切窗口 / 点别处）会读到半成品，等 compositionend 再提交。
      if (composing) {
        editor.addEventListener("compositionend", () => close(true), { once: true });
        return;
      }
      // 点属性栏、命令条、格式条时保留编辑框和字符选区，样式才能只落到框住的字上。
      const win = doc.defaultView;
      if (!win) {
        close(true);
        return;
      }
      win.setTimeout(() => {
        if (closed) return;
        const active = doc.activeElement;
        if (active instanceof Element && active.closest(FORMAT_CHROME)) return;
        close(true);
      }, 0);
    };
    activeTextEdit = {
      close,
      targetId,
      editor,
      charRanges: () => (charRanges ? charRanges.map((range) => ({ ...range })) : null),
      syncFromModel,
      hideSource,
    };
    editor.addEventListener("pointerdown", () => {
      pinRanges = false;
      clearPinnedCharSelection(doc);
    });

    editor.addEventListener("blur", onBlur);
    editor.addEventListener("compositionstart", () => {
      composing = true;
    });
    editor.addEventListener("compositionend", () => {
      composing = false;
    });
    editor.addEventListener("keydown", (ev) => {
      // 组合输入期间的 Esc / Enter 属于 IME 候选框，不能被编辑器截走。
      if (composing || ev.isComposing) return;
      if (ev.key === "Escape") {
        ev.preventDefault();
        close(false);
      } else if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) {
        ev.preventDefault();
        close(true);
      } else if (ev.key === "Tab") {
        // 默认行为会把焦点交给下一个可聚焦元素（ribbon 上的某个按钮），用户看到的是
        // "按了 Tab 编辑框莫名消失"。显式收口成"提交并退出"。
        ev.preventDefault();
        close(true);
      }
    });
  };

  type PendingColor =
    | {
        kind: "fill";
        slideIdx: number;
        requestIds: string[];
        ids: string[];
        paint: Paint | undefined;
        snaps: FillSnap[];
        targets: Shape[];
      }
    | {
        kind: "text";
        slideIdx: number;
        requestIds: string[];
        ids: string[];
        color: string;
        snaps: RunColorSnap[];
        shapeIds: string[];
      }
    | {
        kind: "text-range";
        slideIdx: number;
        id: string;
        color: string;
        ranges: TextCharRange[];
      };
  let pendingColor: PendingColor | null = null;
  let colorRaf = 0;
  let liveColorBlocked = false;
  const sameIds = (a: string[], b: string[]): boolean => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  };
  const cancelColorFrame = (): void => {
    if (!colorRaf) return;
    host.ownerDocument.defaultView?.cancelAnimationFrame(colorRaf);
    colorRaf = 0;
  };
  const paintPendingColor = (): void => {
    const pending = pendingColor;
    if (!pending) return;
    const doc = host.ownerDocument;
    if (pending.kind === "fill") {
      const paint = pending.paint;
      const solid = !paint || paint.kind === "none" || paint.kind === "solid";
      let needsFlush = !solid;
      if (solid) {
        for (const target of pending.targets) {
          if (target.useBgFill) continue;
          if (!patchSolidFill(stage, target.id, paint)) needsFlush = true;
        }
      }
      if (needsFlush) runtime?.flush();
      const hex = paint?.kind === "solid" ? solidHex(paint.color) : null;
      if (hex) syncLiveColorInputs(doc, "fill", hex);
      return;
    }
    if (pending.kind !== "text") return;
    let needsFlush = false;
    for (const id of pending.shapeIds) {
      if (!patchTextColor(stage, id, pending.color)) needsFlush = true;
    }
    if (needsFlush) runtime?.flush();
    const hex = solidHex(pending.color);
    if (hex) syncLiveColorInputs(doc, "text", hex);
  };
  const scheduleColorFrame = (): void => {
    if (colorRaf) return;
    const win = host.ownerDocument.defaultView;
    if (!win?.requestAnimationFrame) {
      paintPendingColor();
      return;
    }
    colorRaf = win.requestAnimationFrame(() => {
      colorRaf = 0;
      paintPendingColor();
    });
  };
  const rejectLiveColor = (): void => {
    if (liveColorBlocked) return;
    liveColorBlocked = true;
    showToast(t("protect.blocked"));
  };
  commitLivePreview = (): void => {
    if (committingLive) return;
    liveColorBlocked = false;
    const pending = pendingColor;
    if (!pending) return;
    pendingColor = null;
    cancelColorFrame();
    committingLive = true;
    try {
      if (pending.kind === "fill") {
        restoreFills(pending.snaps);
        const cmds = pending.ids.map((id) => new SetFillCmd(pending.slideIdx, id, pending.paint));
        if (cmds.length === 1) stack.execute(cmds[0]!);
        else if (cmds.length > 1) stack.execute(new BatchCmd("Set fill", cmds));
      } else if (pending.kind === "text-range") {
        stack.execute(new SetTextStyleCmd(pending.slideIdx, pending.id, { color: pending.color }, pending.ranges));
      } else {
        restoreRunColors(pending.snaps);
        for (const id of pending.ids) {
          stack.execute(new SetTextStyleCmd(pending.slideIdx, id, { color: pending.color }));
        }
      }
    } finally {
      committingLive = false;
    }
  };
  const previewFills = (ids: string[], paint: Paint | undefined): boolean => {
    if (!canApplyEditCommand(pres, { label: "Set fill" })) {
      rejectLiveColor();
      return true;
    }
    const slideIdx = index;
    if (
      pendingColor &&
      (pendingColor.kind !== "fill" || pendingColor.slideIdx !== slideIdx || !sameIds(pendingColor.requestIds, ids))
    ) {
      commitLivePreview();
    }
    if (!pendingColor) {
      const targets: Shape[] = [];
      const used: string[] = [];
      for (const id of ids) {
        if (id === BACKGROUND_SEL_ID) continue;
        const found = fillTargetsFor(pres, slideIdx, id);
        if (found.length === 0) continue;
        used.push(id);
        for (const shape of found) targets.push(shape);
      }
      if (targets.length === 0) return true;
      pendingColor = { kind: "fill", slideIdx, requestIds: ids, ids: used, paint, snaps: captureFills(targets), targets };
    }
    if (pendingColor.kind !== "fill") return true;
    pendingColor.paint = paint;
    writeFills(pendingColor.snaps, paint);
    scheduleColorFrame();
    return true;
  };
  const editingRangesFor = (id: string): TextCharRange[] | undefined => {
    const edit = activeTextEdit;
    if (!edit || edit.targetId !== id) return undefined;
    const ranges = edit.charRanges();
    return ranges && ranges.length > 0 ? ranges : undefined;
  };
  const previewTextColors = (ids: string[], color: string): boolean => {
    if (!canApplyEditCommand(pres, { label: "Text style" })) {
      rejectLiveColor();
      return true;
    }
    const ranged = ids.length === 1 ? editingRangesFor(ids[0]!) : undefined;
    if (ranged && activeTextEdit) {
      if (pendingColor && pendingColor.kind !== "text-range") commitLivePreview();
      paintEditorRangeColor(activeTextEdit.editor, ranged, color);
      pendingColor = { kind: "text-range", slideIdx: index, id: ids[0]!, color, ranges: ranged };
      return true;
    }
    const slideIdx = index;
    if (
      pendingColor &&
      (pendingColor.kind !== "text" || pendingColor.slideIdx !== slideIdx || !sameIds(pendingColor.requestIds, ids))
    ) {
      commitLivePreview();
    }
    if (!pendingColor) {
      const snaps: RunColorSnap[] = [];
      const shapeIds: string[] = [];
      const used: string[] = [];
      for (const id of ids) {
        if (id === BACKGROUND_SEL_ID) continue;
        const texts = textShapesForColor(pres, slideIdx, id);
        if (texts.length === 0) continue;
        let runs = 0;
        for (const text of texts) {
          shapeIds.push(text.id);
          for (const para of text.paragraphs ?? []) {
            const captured = captureRunColors(para.runs ?? []);
            runs += captured.length;
            for (const snap of captured) snaps.push(snap);
          }
        }
        if (runs > 0) used.push(id);
      }
      if (snaps.length === 0) return true;
      pendingColor = { kind: "text", slideIdx, requestIds: ids, ids: used, color, snaps, shapeIds };
    }
    if (pendingColor.kind !== "text") return true;
    pendingColor.color = color;
    writeRunColors(pendingColor.snaps, color);
    scheduleColorFrame();
    return true;
  };

  const inspector: InspectorHandle = mountInspector(propsWrap, {
    selection,
    stack,
    pres,
    currentSlide: () => index,
    // 母版视图下 shape 在伪 slide 上；inspector 用它查 shape 并读背景。
    getActiveSlide: () => viewSlide(),
    // 背景编辑落到的 EditTarget（slide / master / layout）。
    getBackgroundTarget: () => viewTarget(),
    settleCropSession: () => exitCropSession(true),
    listLayouts: () => {
      const slide = pres.slides[index];
      return slide ? listLayoutsForSlide(pres, slide) : [];
    },
    applyLayout: (entry) => {
      stack.execute(new ApplySlideLayoutCmd(index, { masterId: entry.masterId, layoutId: entry.layoutId }));
      selection.clear();
      drawSlide(index);
    },
    listThemeVariants: () => {
      const colors = pres.theme?.colors;
      if (!colors) return [];
      return THEME_VARIANT_OPTIONS.map((v) => ({
        id: v.id,
        label: t(v.labelKey),
        swatch: variantPreviewSwatch(colors, v.id),
      }));
    },
    applyThemeVariant: applyThemeVariantToDeck,
    openThemeGallery: opts.openThemeGallery,
    bringFront: () => reorderSelection("front"),
    sendBack: () => reorderSelection("back"),
    bringForward: () => reorderSelection("forward"),
    sendBackward: () => reorderSelection("backward"),
    alignSelection: (mode) => {
      const ids = [...selection.values].filter((id) => id !== BACKGROUND_SEL_ID);
      if (ids.length < 1) return;
      stack.execute(new AlignShapesCmd(index, ids, mode));
    },
    distributeSelection: (axis) => {
      const ids = [...selection.values];
      if (ids.length < 3) return;
      stack.execute(new DistributeShapesCmd(index, ids, axis));
    },
    previewFill: (shapeId, paint) => previewFills([shapeId], paint),
    previewTextColor: (shapeId, color) => previewTextColors([shapeId], color),
    editingTextRanges: (shapeId) => editingRangesFor(shapeId),
    commitLivePreview: () => commitLivePreview(),
    // renderer 把 video / audio 包在 <g data-id="<shape.id>"> 容器里（svg-backend）
    // 一律给 mount 出来的根节点写 data-id）。Inspector 的播放控件需要直接驱动这个
    // HTMLMediaElement —— 这里集中提供查找方式，避免 inspector 自己耦合 stage DOM。
    getMediaEl: (id: string): HTMLMediaElement | null => {
      const esc = CSS.escape(id);
      return stage.querySelector<HTMLMediaElement>(
        `g[data-id="${esc}"] video, g[data-id="${esc}"] audio`,
      );
    },
  });
  // 选区格式条、功能区和画布提交的命令不经过属性栏自己的控件，selection 也不变。
  // 值在 input 时就已经写入模型，这里立刻重建属性栏，不等失焦。
  // 正在属性栏自己的输入控件里连续改时不重建，否则滑杆、取色器和光标会被拆掉；
  // 那次输入已经改了模型，格式条由舞台重绘同步。
  let inspectorRefreshQueued = false;
  const queueInspectorRefresh = (): void => {
    if (inspectorRefreshQueued) return;
    inspectorRefreshQueued = true;
    queueMicrotask(() => {
      inspectorRefreshQueued = false;
      inspector.refresh();
    });
  };
  const unsubInspectorHistory = stack.subscribeHistory(() => {
    activeTextEdit?.syncFromModel();
    const active = host.ownerDocument.activeElement;
    if (active instanceof HTMLElement && propsWrap.contains(active) && active.matches("input, textarea, select")) {
      return;
    }
    queueInspectorRefresh();
  });

  const selectionPane = mountSelectionPane({
    doc: host.ownerDocument,
    getSlide: () => viewSlide(),
    currentSlide: () => index,
    selection,
    stack,
    onSelectShape: (id) => {
      selection.set([id]);
      drawSlide(index);
    },
  });
  layersWrap.appendChild(selectionPane.el);
  onSlideChangeHooks.push(() => selectionPane.refresh());
  stack.subscribe(() => selectionPane.refresh());

  // 双向绑定：panel 与 timeline 共享一个 effect 选中态，避免「在 timeline 选了，panel 里看不到详情」。
  // 必须先 forward declare，让两个 mount 都能在 onSelectEffect 闭包里互相引用。
  // transitionPanel 同样 forward declare：drawSlide() 早于 mount 时机访问该闭包，
  // 用 undefined 守护避免 TDZ。
  let animPanel: AnimationPanelHandle | undefined;
  // 动画面板在这个函数更后面才装上刷取逻辑。状态和入口先放好，避免面板刷新踩到暂时未初始化的绑定。
  interface AnimationPainterState {
    sourceId: string | null;
    persistent: boolean;
  }
  let animationPainter: AnimationPainterState = { sourceId: null, persistent: false };
  let activateAnimationPainter = (_persistent: boolean): void => {};
  let animTimeline: AnimTimelineHandle | undefined;
  let transitionPanel: TransitionPanelHandle | undefined;

  animPanel = mountAnimationPanel(animWrap, {
    pres,
    stack,
    currentSlide: () => index,
    getSelection: () => [...selection.values][0],
    selectShape: (id) => {
      if (id) selection.set([id]);
      else selection.clear();
    },
    onSelectEffect: (id) => {
      animTimeline?.selectEffect(id);
      // 在 animations tab 上选中一个 effect 一般也想看 inspector 与时间轴对应高亮；
      // 但 effect 选中是源自 animations tab 自身，不必再强制切回 props。保持当前 tab 即可。
    },
    toggleAnimationPainter: (persistent) => activateAnimationPainter(persistent),
    animationPainterOn: () => animationPainter.sourceId !== null,
  });

  // 切换（slide transition）面板：原先在 Ribbon "Transitions" tab 里，
  // 这里下沉到右侧面板作为独立 tab，对齐 PowerPoint "切换" 侧栏的位置感。
  // preview 用箭头函数延迟到调用时再解析 previewTransitionOnStage，避免它声明在后造成
  // block-scoped TDZ。
  transitionPanel = mountTransitionPanel(transWrap, {
    pres,
    stack,
    currentSlide: () => index,
    preview: () => previewTransitionOnStage(),
  });

  devPanel = mountDevPanel(devWrap, {
    pres,
    stack,
    currentSlide: () => index,
    gotoSlide: (i) => goto(i),
    getSelectedShapes: () => {
      const slide = viewSlide();
      if (!slide) return [];
      const out: Shape[] = [];
      for (const id of selection.values) {
        const found = findShape(slide, id);
        if (found) out.push(found);
      }
      return out;
    },
    extraSections: opts.devDumpSections,
  });
  onSlideChangeHooks.push(() => devPanel?.refresh());
  // 开发者面板 render() 会跑 Morph / Insert 全稿审计，绝不能挂在每次选区变化上
  // （即使用户在看属性栏，也会在 pointerup 前卡住主线程 ~1s）。切到 Developer tab
  // 时 onRightTabClick 已会 refresh。
  const unobserveDevMode = observeHostDevMode(host.ownerDocument, () => {
    refreshRightTabs();
    if (isHostDevMode(host.ownerDocument)) devPanel?.refresh();
  });
  refreshRightTabs();

  // 标记动画预览态。开启时编辑器停止 redraw（避免被 TimingRuntime 写入的属性被静态重绘覆盖）。
  animTimeline = mountAnimTimeline(timelineHost, {
    pres,
    stack,
    currentSlide: () => index,
    selectShape: (id) => {
      if (id) selection.set([id]);
      else selection.clear();
    },
    getScene: () => runtime?.scene ?? null,
    setPlaybackMode: (on) => {
      playbackOn = on;
      // 进入播放预览：根据当前 timing 把入场目标在 scene 上临时 hide。
      // 编辑模式下 shape.opacity / initialOverrides 已被 forceVisibleForEdit 清掉，
      // 不做这一步的话 Wipe / Fly In / Appear 等入场动画因 shape 已可见而看不出效果。
      // 退出播放：drawSlide 重建 scene 节点状态，回到"所有可见"的编辑态。
      if (on) {
        const sc = runtime?.scene;
        const cur = pres.slides[index];
        if (sc && cur) applyEntranceHideToScene(sc, cur);
      } else {
        drawSlide(index);
      }
    },
    onSelectEffect: (id) => {
      animPanel?.selectEffect(id);
      // 从时间轴选中一个 effect → 自动切到 Animations tab 让右侧立刻能编辑参数。
      if (id) {
        activeRightTab = "animations";
        refreshRightTabs();
      }
    },
  });

  // 初次进入时同步一次右侧 tab 视觉。
  refreshRightTabs();

  const removeSelected = (): void => {
    // 与键盘 Delete / 右键菜单 Delete 一致：锁定 shape 不参与删除；选中里有任一
    // 锁定时整次删除 noop，并 toast 提醒用户先解锁。
    const slide = viewSlide();
    if (!slide) return;
    const ids = [...selection.values].filter((id) => id !== BACKGROUND_SEL_ID);
    if (ids.length === 0) return;
    if (ids.some((id) => findShape(slide, id)?.locked)) {
      showToast(t("editor.toast.locked.cantDelete"));
      return;
    }
    const tgt = viewTarget();
    for (const id of ids) stack.execute(new DeleteShapeCmd(index, id, tgt));
    selection.clear();
  };

  const applyTextStyleToSelection = (patch: TextStylePatch): void => {
    for (const id of selection.values) {
      stack.execute(new SetTextStyleCmd(index, id, patch, editingRangesFor(id)));
    }
  };

  const applyAlignToSelection = (align: NonNullable<import("@ppt/core").TextParagraph["align"]>): void => {
    for (const id of selection.values) {
      stack.execute(new SetTextAlignCmd(index, id, align));
    }
  };

  // 项目符号 / 编号写入当前选中文本框的所有段落。
  // 字符样式在编辑框里有选区时只改选中的字；段落属性仍整段改写。
  const applyBulletToSelection = (next: BulletDef | undefined): void => {
    for (const id of selection.values) {
      stack.execute(new SetParagraphBulletCmd(index, id, next));
    }
  };

  const applyRtlToSelection = (rtl: boolean): void => {
    for (const id of selection.values) {
      if (id === BACKGROUND_SEL_ID) continue;
      stack.execute(new SetParagraphRtlCmd(index, id, rtl));
    }
  };

  const applyCjkToSelection = (enabled: boolean): void => {
    for (const id of selection.values) {
      if (id === BACKGROUND_SEL_ID) continue;
      stack.execute(new SetParagraphCjkCmd(index, id, enabled));
    }
  };

  const applyVAlignToSelection = (vAlign: "top" | "middle" | "bottom"): void => {
    for (const id of selection.values) {
      if (id === BACKGROUND_SEL_ID) continue;
      stack.execute(new SetTextBodyCmd(index, id, { vAlign }));
    }
  };

  const applyColumnsToSelection = (cols: number): void => {
    for (const id of selection.values) {
      if (id === BACKGROUND_SEL_ID) continue;
      stack.execute(new SetTextBodyCmd(index, id, { numCol: cols <= 1 ? null : cols }));
    }
  };

  const getSelectionColumns = (): number | undefined => {
    const slide = viewSlide();
    if (!slide) return undefined;
    for (const id of selection.values) {
      if (id === BACKGROUND_SEL_ID) continue;
      const s = findShape(slide, id);
      const text = s ? pickTextShape(s) : undefined;
      if (text?.kind === "text") return text.numCol ?? 1;
    }
    return undefined;
  };

  const clearInkOnSlide = (): void => {
    stack.execute(new ClearInkOnSlideCmd(index));
    drawSlide(index);
  };

  const applyTextOrientationToSelection = (
    vert: import("./commands").TextBodyPatch["vert"],
  ): void => {
    for (const id of selection.values) {
      if (id === BACKGROUND_SEL_ID) continue;
      stack.execute(new SetTextBodyCmd(index, id, { vert: vert ?? "horz" }));
    }
  };

  const getSelectionTextVert = (): import("@ppt/core").TextShape["vert"] | undefined => {
    const slide = viewSlide();
    if (!slide) return undefined;
    for (const id of selection.values) {
      if (id === BACKGROUND_SEL_ID) continue;
      const s = findShape(slide, id);
      const text = s ? pickTextShape(s) : undefined;
      if (text?.kind === "text") return text.vert ?? "horz";
    }
    return undefined;
  };

  const applyRowOrderToSelection = (rtl: boolean): void => {
    const slide = viewSlide();
    if (!slide) return;
    for (const id of selection.values) {
      if (id === BACKGROUND_SEL_ID) continue;
      const s = findShape(slide, id);
      const text = s ? pickTextShape(s) : undefined;
      if (!text || text.kind !== "text") continue;
      stack.execute(new SetTextBodyCmd(index, id, textRowOrderPatch(text, rtl)));
    }
  };

  const getSelectionRowOrderRtl = (): boolean | undefined => {
    const slide = viewSlide();
    if (!slide) return undefined;
    for (const id of selection.values) {
      if (id === BACKGROUND_SEL_ID) continue;
      const s = findShape(slide, id);
      const text = s ? pickTextShape(s) : undefined;
      if (text?.kind === "text") return textRowOrderRtl(text);
    }
    return undefined;
  };

  const firstSelectedTextRun = (): import("@ppt/core").TextRun | undefined => {
    const slide = viewSlide();
    if (!slide) return undefined;
    for (const id of selection.values) {
      if (id === BACKGROUND_SEL_ID) continue;
      const s = findShape(slide, id);
      if (!s) continue;
      const text = pickTextShape(s);
      if (text && text.kind === "text") {
        const ranges = editingRangesFor(id);
        if (ranges) {
          const hit = runAtCharRanges(text.paragraphs, ranges);
          if (hit) return hit;
        }
        return text.paragraphs[0]?.runs[0];
      }
    }
    return undefined;
  };

  const firstSelectedParagraph = (): import("@ppt/core").TextParagraph | undefined => {
    const slide = viewSlide();
    if (!slide) return undefined;
    for (const id of selection.values) {
      if (id === BACKGROUND_SEL_ID) continue;
      const s = findShape(slide, id);
      if (!s) continue;
      const text = pickTextShape(s);
      if (text && text.kind === "text") {
        const ranges = editingRangesFor(id);
        const paraIdx = ranges?.[0]?.paragraph ?? 0;
        return text.paragraphs[paraIdx] ?? text.paragraphs[0];
      }
    }
    return undefined;
  };

  const applyParagraphSpacingToSelection = (patch: ParagraphSpacingPatch): void => {
    for (const id of selection.values) {
      if (id === BACKGROUND_SEL_ID) continue;
      stack.execute(new SetParagraphSpacingCmd(index, id, patch));
    }
  };

  const clearTextFormattingOnSelection = (): void => {
    for (const id of selection.values) {
      if (id === BACKGROUND_SEL_ID) continue;
      stack.execute(new ClearTextFormattingCmd(index, id));
    }
  };

  const INDENT_STEP_PX = 27 * (96 / 72);

  const adjustIndentOnSelection = (delta: number): void => {
    const para = firstSelectedParagraph();
    const cur = para?.marginLeft ?? 0;
    applyParagraphSpacingToSelection({ marginLeft: Math.max(0, cur + delta) });
  };

  const pickImageFile = (): void => {
    const inp = host.ownerDocument.createElement("input");
    inp.type = "file";
    inp.accept = "image/*";
    inp.addEventListener("change", () => {
      const f = inp.files?.[0];
      if (f) void insertMediaFiles([f]);
    });
    inp.click();
  };

  const setSlideAspect = (ratio: "16:9" | "4:3"): void => {
    const w = ratio === "16:9" ? 1920 : 1024;
    const h = ratio === "16:9" ? 1080 : 768;
    stack.execute(new SetSlideSizeCmd({ width: w, height: h }));
  };

  const setBgColor = (color: string): void => {
    stack.execute(new SetBackgroundTargetCmd(viewTarget(), { kind: "solid", color }));
  };

  // ---- Format / Arrange actions ----
  const groupSelection = (): void => {
    const ids = [...selection.values];
    if (ids.length < 2) return;
    const cmd = new GroupShapesCmd(index, ids);
    stack.execute(cmd);
    const groupId = cmd.createdGroupId;
    if (groupId) selection.set([groupId]);
    else selection.clear();
  };
  const ungroupSelection = (): void => {
    const slide = viewSlide();
    if (!slide) return;
    const id = [...selection.values][0];
    if (!id || id === BACKGROUND_SEL_ID) return;
    const s = findShape(slide, id);
    if (!s || s.kind !== "group") return;
    const childIds = s.children.map((c) => c.id);
    stack.execute(new UngroupShapesCmd(index, id));
    selection.set(childIds);
  };
  const alignSelection = (mode: AlignMode): void => {
    const ids = [...selection.values].filter((id) => id !== BACKGROUND_SEL_ID);
    if (ids.length < 1) return;
    stack.execute(new AlignShapesCmd(index, ids, mode));
  };
  const distributeSelection = (axis: "h" | "v"): void => {
    const ids = [...selection.values];
    if (ids.length < 3) return;
    stack.execute(new DistributeShapesCmd(index, ids, axis));
  };
  const flipSelection = (axis: "h" | "v"): void => {
    const cmds: EditCommand[] = [];
    for (const id of selection.values) cmds.push(new FlipShapeCmd(index, id, axis));
    if (cmds.length === 1) stack.execute(cmds[0]!);
    else if (cmds.length > 1) stack.execute(new BatchCmd("Flip", cmds));
  };
  const rotateSelection = (delta: number): void => {
    const slide = viewSlide();
    if (!slide) return;
    const cmds: EditCommand[] = [];
    for (const id of selection.values) {
      if (id === BACKGROUND_SEL_ID) continue;
      const s = findShape(slide, id);
      if (!s) continue;
      const next = (((s.transform?.rotation ?? 0) + delta) % 360 + 360) % 360;
      cmds.push(new SetShapeRotationCmd(index, id, next));
    }
    if (cmds.length === 1) stack.execute(cmds[0]!);
    else if (cmds.length > 1) stack.execute(new BatchCmd("Rotate", cmds));
  };
  const lockSelection = (): void => {
    const cmds: EditCommand[] = [];
    for (const id of selection.values) cmds.push(new SetShapeLockedCmd(index, id, true));
    if (cmds.length === 1) stack.execute(cmds[0]!);
    else if (cmds.length > 1) stack.execute(new BatchCmd("Lock", cmds));
  };
  const unlockSelection = (): void => {
    const cmds: EditCommand[] = [];
    for (const id of selection.values) cmds.push(new SetShapeLockedCmd(index, id, false));
    if (cmds.length === 1) stack.execute(cmds[0]!);
    else if (cmds.length > 1) stack.execute(new BatchCmd("Unlock", cmds));
  };
  const isSelectionLocked = (): boolean => {
    const slide = viewSlide();
    if (!slide) return false;
    for (const id of selection.values) {
      if (id === BACKGROUND_SEL_ID) continue;
      const s = findShape(slide, id);
      if (s?.locked) return true;
    }
    return false;
  };
  const isSelectionGroup = (): boolean => {
    if (selection.values.size !== 1 || selection.isBackground()) return false;
    const slide = viewSlide();
    if (!slide) return false;
    const id = [...selection.values][0]!;
    const s = findShape(slide, id);
    return s?.kind === "group";
  };

  // 右键上下文菜单。如果点击位置命中 shape 且当前没选中它，先选中再弹菜单 —
  // 这与 PowerPoint / Figma 一致：右键 = 「在我点的那个东西上操作」。
  const openContextMenuAt = (cx: number, cy: number, onShape: boolean): void => {
    const hasSel = selection.values.size > 0;
    const multi = selection.values.size >= 2;
    const isGroup = isSelectionGroup();
    const locked = isSelectionLocked();
    const canPaste = clipboard.length > 0;
    let singleOle: import("@ppt/core").OleObjectShape | null = null;
    let cropShape: Shape | null = null;
    if (selection.values.size === 1) {
      const slide = pres.slides[index];
      const id = [...selection.values][0]!;
      const sh = slide ? findShape(slide, id) : undefined;
      if (sh?.kind === "ole" && sh.embedSrc) singleOle = sh;
      if (sh && cropHost(sh)) cropShape = sh;
    }
    const items: ContextMenuItem[] = onShape
      ? [
          {
            label: t("editor.ctx.cut"),
            shortcut: "⌘X",
            disabled: !hasSel || locked,
            onClick: (): void => {
              copySelection();
              for (const id of [...selection.values]) stack.execute(new DeleteShapeCmd(index, id));
              selection.clear();
            },
          },
          { label: t("editor.ctx.copy"), shortcut: "⌘C", disabled: !hasSel, onClick: copySelection },
          { label: t("editor.ctx.paste"), shortcut: "⌘V", disabled: !canPaste, onClick: pasteClipboard },
          { label: t("editor.ctx.duplicate"), shortcut: "⌘D", disabled: !hasSel || locked, onClick: duplicateSelection },
          ...(cropShape
            ? [{
                label: t("editor.ctx.crop"),
                onClick: (): void => {
                  if (cropSession?.id === cropShape!.id) exitCropSession(true);
                  else enterCropSession(cropShape!.id);
                },
              }]
            : []),
          { kind: "sep" },
          { label: t("editor.ctx.group"), shortcut: "⌘G", disabled: !multi, onClick: groupSelection },
          { label: t("editor.ctx.ungroup"), shortcut: "⌘⇧G", disabled: !isGroup, onClick: ungroupSelection },
          { kind: "sep" },
          { label: t("editor.ctx.bringFront"), shortcut: "⌘⇧]", disabled: !hasSel, onClick: () => reorderSelection("front") },
          { label: t("editor.ctx.bringForward"), shortcut: "⌘]", disabled: !hasSel, onClick: () => reorderSelection("forward") },
          { label: t("editor.ctx.sendBackward"), shortcut: "⌘[", disabled: !hasSel, onClick: () => reorderSelection("backward") },
          { label: t("editor.ctx.sendBack"), shortcut: "⌘⇧[", disabled: !hasSel, onClick: () => reorderSelection("back") },
          { kind: "sep" },
          { label: locked ? t("editor.ctx.unlock") : t("editor.ctx.lock"), disabled: !hasSel, onClick: locked ? unlockSelection : lockSelection },
          ...(singleOle
            ? [
                {
                  label: t("editor.ctx.saveOle"),
                  onClick: (): void => {
                    downloadOleEmbed(host.ownerDocument, singleOle!);
                  },
                },
              ]
            : []),
          {
            label: t("editor.ctx.delete"),
            shortcut: "Del",
            disabled: !hasSel || locked,
            onClick: (): void => {
              for (const id of [...selection.values]) stack.execute(new DeleteShapeCmd(index, id));
              selection.clear();
            },
          },
        ]
      : [
          { label: t("editor.ctx.paste"), shortcut: "⌘V", disabled: !canPaste, onClick: pasteClipboard },
          {
            label: t("editor.ctx.selectAll"),
            shortcut: "⌘A",
            onClick: (): void => {
              const slide = pres.slides[index];
              if (!slide) return;
              const ids: string[] = [];
              for (const ly of slide.layers) {
                if (!ly.visible) continue;
                for (const s of ly.shapes) if (!s.locked) ids.push(s.id);
              }
              selection.set(ids);
            },
          },
          { kind: "sep" },
          { label: t("editor.ctx.toggleGrid"), onClick: (): void => { toggleGrid(); } },
          { label: t("editor.ctx.fitWindow"), onClick: () => setZoom("fit") },
        ];
    // 宿主注入的额外菜单项（如"钉到 AI 对话"），拼到默认菜单末尾，前置一个 sep
    // 与默认项视觉分组。Hook 可基于 onShape / selection 上下文决定是否给项目。
    if (opts.buildExtraContextMenuItems) {
      const extra = opts.buildExtraContextMenuItems({
        onShape,
        slideIdx: index,
        selectedShapeIds: [...selection.values],
      });
      if (extra.length > 0) {
        items.push({ kind: "sep" }, ...extra);
      }
    }
    const settleMenu = (menu: ContextMenuItem[]): ContextMenuItem[] =>
      menu.map((item) => {
        if (!("onClick" in item) || !item.onClick || item.label === t("editor.ctx.crop")) return item;
        const run = item.onClick;
        return { ...item, onClick: () => { exitCropSession(true); run(); } };
      });
    showContextMenu(host.ownerDocument, settleMenu(items), cx, cy);
  };
  stage.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const pt = screenToStage(e.clientX, e.clientY);
    const hit = hitTest(pt.x, pt.y);
    let onShape = false;
    if (hit) {
      const slide = pres.slides[index];
      const topId = slide ? findTopLevelId(slide, hit) ?? hit : hit;
      if (!selection.has(topId)) selection.set([topId]);
      onShape = true;
    } else if (selection.values.size > 0) {
      selection.clear();
    }
    openContextMenuAt(e.clientX, e.clientY, onShape);
  });

  // ---- Shape Style 快捷 (Format tab Shape Style 组) ----
  // 多选时把同一种 fill/stroke 应用到所有可被设置的 shape；自动跳过不支持 fill 的 shape（line/image/etc）。
  const setSelectionFill = (color: string | "none"): void => {
    const slide = pres.slides[index];
    if (!slide) return;
    const cmds: EditCommand[] = [];
    for (const id of selection.values) {
      const s = findShape(slide, id);
      if (!s) continue;
      const target = pickFirstStyleShape(s);
      if (!target) continue;
      const next = color === "none" ? undefined : { kind: "solid" as const, color };
      cmds.push(new SetFillCmd(index, id, next));
    }
    if (cmds.length === 1) stack.execute(cmds[0]!);
    else if (cmds.length > 1) stack.execute(new BatchCmd("Set fill", cmds));
  };
  const setSelectionStroke = (color: string | "none"): void => {
    const slide = pres.slides[index];
    if (!slide) return;
    const cmds: EditCommand[] = [];
    for (const id of selection.values) {
      const s = findShape(slide, id);
      if (!s) continue;
      const target = pickFirstStyleShape(s);
      if (!target) continue;
      const prev = target.stroke;
      const next =
        color === "none"
          ? undefined
          : {
              ...(prev ?? { width: 1 }),
              paint: { kind: "solid" as const, color },
            };
      cmds.push(new SetStrokeCmd(index, id, next));
    }
    if (cmds.length === 1) stack.execute(cmds[0]!);
    else if (cmds.length > 1) stack.execute(new BatchCmd("Set outline", cmds));
  };
  const setSelectionStrokeWidth = (px: number): void => {
    const slide = pres.slides[index];
    if (!slide) return;
    const cmds: EditCommand[] = [];
    for (const id of selection.values) {
      const s = findShape(slide, id);
      if (!s) continue;
      const target = pickFirstStyleShape(s);
      if (!target) continue;
      const prev = target.stroke;
      const next: Stroke = prev
        ? { ...prev, width: px }
        : { paint: { kind: "solid", color: "#1e3a8a" }, width: px };
      cmds.push(new SetStrokeCmd(index, id, next));
    }
    if (cmds.length === 1) stack.execute(cmds[0]!);
    else if (cmds.length > 1) stack.execute(new BatchCmd("Set outline width", cmds));
  };
  const getSelectionFill = (): string | undefined => {
    const slide = pres.slides[index];
    if (!slide) return undefined;
    for (const id of selection.values) {
      const s = findShape(slide, id);
      if (!s) continue;
      const target = pickFirstStyleShape(s);
      if (!target?.fill) continue;
      if (target.fill.kind === "solid") return target.fill.color;
    }
    return undefined;
  };
  const textWeightBold = (w: number | string | undefined): boolean => {
    if (typeof w === "number") return w >= 600;
    return w === "bold" || w === "bolder";
  };
  let formatLiveMark: number | null = null;
  function replaceSelectionImages(): void {
    const doc = host.ownerDocument;
    const inp = doc.createElement("input");
    inp.type = "file";
    inp.accept = "image/*";
    inp.addEventListener("change", () => {
      const file = inp.files?.[0];
      if (!file) return;
      void (async () => {
        const src = await readAsDataURL(file);
        const ViewImage = doc.defaultView?.Image;
        const natural = ViewImage
          ? await new Promise<{ w: number; h: number } | undefined>((resolve) => {
              const img = new ViewImage();
              img.onload = () => resolve(
                img.naturalWidth > 0 && img.naturalHeight > 0
                  ? { w: img.naturalWidth, h: img.naturalHeight }
                  : undefined,
              );
              img.onerror = () => resolve(undefined);
              img.src = src;
            })
          : undefined;
        const slide = pres.slides[index];
        if (!slide) return;
        const cmds: EditCommand[] = [];
        for (const id of selection.values) {
          const shape = findShape(slide, id);
          if (shape?.kind !== "image") continue;
          cmds.push(new ReplaceImageSrcCmd(index, id, src, natural));
        }
        if (cmds.length === 1) stack.execute(cmds[0]!);
        else if (cmds.length > 1) stack.execute(new BatchCmd("Replace picture", cmds));
      })();
    });
    inp.click();
  }
  function selectedIconColor(): string | undefined {
    const slide = pres.slides[index];
    if (!slide) return undefined;
    for (const id of selection.values) {
      const shape = findShape(slide, id);
      if (shape?.kind !== "image") continue;
      const color = decodeIconDescr(shape.descr)?.color;
      if (color && /^#[0-9a-fA-F]{6}$/.test(color)) return color;
    }
    return undefined;
  }
  function replaceSelectionIcons(): void {
    void openIconPickerDialog(host.ownerDocument, {
      color: selectedIconColor(),
      title: t("dialog.icon.changeTitle"),
    }).then(async (res) => {
      if (!res) return;
      const slide = pres.slides[index];
      if (!slide) return;
      const size = 96;
      const svgSrc = lucideIconToDataUrl(host.ownerDocument, res.iconId, { size, color: res.color });
      const src = await lucideIconToPngDataUrl(host.ownerDocument, res.iconId, { size, color: res.color });
      const descr = encodeIconDescr(res.iconId, res.color);
      const cmds: EditCommand[] = [];
      for (const id of selection.values) {
        const shape = findShape(slide, id);
        if (shape?.kind !== "image" || !decodeIconDescr(shape.descr)) continue;
        cmds.push(new ReplaceImageSrcCmd(index, id, src, { w: size, h: size }, { svgSrc, descr }));
      }
      if (cmds.length === 1) stack.execute(cmds[0]!);
      else if (cmds.length > 1) stack.execute(new BatchCmd("Change icon", cmds));
    });
  }
  function adjustSelectionTable(op: "addRow" | "removeRow" | "addCol" | "removeCol"): void {
    const slide = pres.slides[index];
    if (!slide) return;
    const cmds: EditCommand[] = [];
    for (const id of selection.values) {
      const shape = findShape(slide, id);
      if (shape?.kind !== "group" || !shape.tableMeta) continue;
      const { rows, cols } = shape.tableMeta;
      if (op === "addRow") cmds.push(new InsertTableRowCmd(index, id, rows - 1));
      else if (op === "removeRow") cmds.push(new RemoveTableRowCmd(index, id, rows - 1));
      else if (op === "addCol") cmds.push(new InsertTableColumnCmd(index, id, cols - 1));
      else cmds.push(new RemoveTableColumnCmd(index, id, cols - 1));
    }
    if (cmds.length === 1) stack.execute(cmds[0]!);
    else if (cmds.length > 1) stack.execute(new BatchCmd("Edit table", cmds));
  }
  const arrangeTarget = (): { id: string; shape: Shape } | undefined => {
    const slide = viewSlide();
    if (!slide || selection.values.size !== 1) return undefined;
    const id = [...selection.values][0]!;
    if (id === BACKGROUND_SEL_ID) return undefined;
    const shape = findShape(slide, id);
    if (!shape || shape.locked) return undefined;
    if (shape.kind !== "image" && shape.kind !== "video") return undefined;
    return { id, shape };
  };
  const formatBar = mountSelectionFormatBar(host.ownerDocument, {
    label: t,
    liveStart: () => {
      if (formatLiveMark == null) formatLiveMark = stack.size();
    },
    liveEnd: () => {
      commitLivePreview();
      if (formatLiveMark == null) return;
      const mark = formatLiveMark;
      formatLiveMark = null;
      stack.coalesceSince(mark, stack.info().undoLabel ?? "Edit");
    },
    applyFontSize: (px) => applyTextStyleToSelection({ fontSize: px }),
    toggleBold: () => {
      const on = textWeightBold(firstSelectedTextRun()?.fontWeight);
      applyTextStyleToSelection({ fontWeight: on ? 400 : 700 });
    },
    applyTextColor: (hex) => previewTextColors([...selection.values], hex),
    applyAlign: (align) => applyAlignToSelection(align),
    toggleBullet: () => {
      const para = firstSelectedParagraph();
      const on = !!para?.bullet && para.bullet.kind !== "none";
      applyBulletToSelection(on ? undefined : { kind: "char", char: "•" });
    },
    applyFill: (hex) => previewFills([...selection.values], { kind: "solid", color: hex }),
    applyStroke: (hex) => setSelectionStroke(hex),
    applyStrokeWidth: (px) => setSelectionStrokeWidth(px),
    applyArrows: (mode) => setSelectionLineArrows(mode),
    replaceImage: () => {
      if (cropSession) exitCropSession(true);
      replaceSelectionImages();
    },
    replaceIcon: () => {
      if (cropSession) exitCropSession(true);
      replaceSelectionIcons();
    },
    crop: () => {
      const slide = viewSlide();
      if (!slide || selection.values.size !== 1) return;
      const id = [...selection.values][0]!;
      const shape = findShape(slide, id);
      if (!shape || !cropHost(shape)) return;
      if (cropSession?.id === id) exitCropSession(true);
      else enterCropSession(id);
    },
    zoom: (factor) => {
      if (cropSession) exitCropSession(true);
      const target = arrangeTarget();
      if (!target) return;
      const next = scaleRectAboutCenter(target.shape.bbox, factor);
      if (!next) return;
      stack.execute(new ResizeShapeCmd(index, target.id, next));
    },
    rotateQuarter: () => {
      if (cropSession) exitCropSession(true);
      if (!arrangeTarget()) return;
      rotateSelection(90);
    },
    flip: (axis) => {
      if (cropSession) exitCropSession(true);
      if (!arrangeTarget()) return;
      flipSelection(axis);
    },
    table: (op) => adjustSelectionTable(op),
    align: (mode) => alignSelection(mode),
    distribute: (axis) => distributeSelection(axis),
  });
  const onFormatBarScroll = (): void => syncFormatBar();
  stageWrap.addEventListener("scroll", onFormatBarScroll, { passive: true });
  scheduleSyncFormatBar = (): void => {
    const win = host.ownerDocument.defaultView;
    if (!win?.requestAnimationFrame) {
      syncFormatBar();
      return;
    }
    if (formatBarRaf) return;
    formatBarRaf = win.requestAnimationFrame(() => {
      formatBarRaf = 0;
      syncFormatBar();
    });
  };
  let aiPickMode = false;
  let aiRunTarget: { slideIndex: number; ids: string[] } | null = null;
  const aiBox = opts.onAskAiInline
    ? mountAiInlineBox(host.ownerDocument, {
        label: t,
        submit: (text, ui) => {
          const ids = [...selection.values].filter((id) => id !== BACKGROUND_SEL_ID);
          if (ids.length === 0 && !selection.isBackground()) return;
          aiRunTarget = { slideIndex: index, ids };
          opts.onAskAiInline!({ slideIndex: index, shapeIds: ids, text }, ui);
        },
        settled: () => {
          aiRunTarget = null;
          scheduleSyncFormatBar();
        },
        exit: () => setAiPickMode(false),
      })
    : null;
  const setAiPickMode = (on: boolean): void => {
    const next = on && !!aiBox;
    if (next === aiPickMode) return;
    aiPickMode = next;
    root.classList.toggle("ppt-ai-pick-mode", next);
    syncFormatBar();
    if (next) aiBox?.focus();
    else root.focus({ preventScroll: true });
    opts.onAiPickModeChange?.(next);
  };
  const screenRectOf = (slide: Slide, ids: readonly string[], stageRect: DOMRect): ScreenRect | null => {
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const id of ids) {
      const shape = findShape(slide, id);
      if (!shape) continue;
      const x = stageRect.left + shape.bbox.x * stageScale;
      const y = stageRect.top + shape.bbox.y * stageScale;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x + shape.bbox.w * stageScale);
      bottom = Math.max(bottom, y + shape.bbox.h * stageScale);
    }
    return left === Infinity ? null : { left, top, right, bottom };
  };
  syncFormatBar = (): void => {
    const slide = viewSlide();
    const ids = [...selection.values].filter((id) => id !== BACKGROUND_SEL_ID);
    const subjects = slide
      ? ids.flatMap((id) => {
          const shape = findShape(slide, id);
          return shape ? [formatSubject(shape)] : [];
        })
      : [];
    const win = host.ownerDocument.defaultView;
    const stageRect = stage.getBoundingClientRect();
    const viewRect = stageWrap.getBoundingClientRect();
    const anchor = slide && ids.length > 0 ? screenRectOf(slide, ids, stageRect) : null;
    const selected = slide && ids.length === 1 ? findShape(slide, ids[0]!) : undefined;
    const run = firstSelectedTextRun();
    const para = firstSelectedParagraph();
    formatBar.sync({
      mode: selectionFormatMode({
        view: presentationView,
        background: selection.isBackground(),
        editingText: !!activeTextEdit,
        dragging: drag !== null,
        subjects,
      }),
      anchor,
      view: {
        left: viewRect.left,
        top: viewRect.top,
        right: viewRect.right,
        bottom: viewRect.bottom,
      },
      viewport: { w: win?.innerWidth ?? 0, h: win?.innerHeight ?? 0 },
      fontSize: run?.fontSize,
      bold: textWeightBold(run?.fontWeight),
      textColor: paintedTextColor(run) ?? "#111827",
      align: para?.align,
      bullet: !!para?.bullet && para.bullet.kind !== "none",
      fill: getSelectionFill() ?? "#94a3b8",
      stroke: getSelectionStroke()?.color ?? "#1e3a8a",
      strokeWidth: getSelectionStroke()?.width ?? 1,
      croppable:
        !!selected &&
        !!cropHost(selected) &&
        drag === null &&
        presentationView === "normal" &&
        !selection.isBackground(),
      cropping: !!selected && cropSession?.id === selected.id,
      arrangeable:
        !!selected &&
        !selected.locked &&
        (selected.kind === "image" || selected.kind === "video") &&
        drag === null &&
        presentationView === "normal" &&
        !selection.isBackground(),
      arrows: getSelectionLineArrows() ?? "none",
    });
    if (!aiBox) return;
    const runIds = aiRunTarget?.slideIndex === index ? aiRunTarget.ids : null;
    const aiIds = runIds ?? ids;
    const aiVisible =
      aiPickMode &&
      !!slide &&
      editorContext.kind === "slides" &&
      presentationView === "normal" &&
      (runIds !== null || (drag === null && !activeTextEdit && (ids.length > 0 || selection.isBackground())));
    const barRect = formatBar.el.style.display === "none" ? null : formatBar.el.getBoundingClientRect();
    aiBox.sync({
      visible: aiVisible,
      targetKey: `${index}:${aiIds.join(",")}`,
      anchor: !aiVisible || !slide ? null : aiIds.length > 0 ? screenRectOf(slide, aiIds, stageRect) : stageRect,
      view: { left: viewRect.left, top: viewRect.top, right: viewRect.right, bottom: viewRect.bottom },
      viewport: { w: win?.innerWidth ?? 0, h: win?.innerHeight ?? 0 },
      avoid: barRect,
    });
  };
  function getSelectionStroke(): { color?: string; width?: number; dashPreset?: StrokeDashPreset } | undefined {
    const slide = pres.slides[index];
    if (!slide) return undefined;
    for (const id of selection.values) {
      const s = findShape(slide, id);
      if (!s) continue;
      const target = pickFirstStyleShape(s);
      if (!target?.stroke) continue;
      const c = target.stroke.paint?.kind === "solid" ? target.stroke.paint.color : undefined;
      return {
        color: c,
        width: target.stroke.width,
        dashPreset: target.stroke.dashPreset ?? "solid",
      };
    }
    return undefined;
  }

  type LineArrowMode = "none" | "head" | "tail" | "both";

  function lineArrowModeFromStroke(stroke?: Stroke): LineArrowMode {
    const head = stroke?.headEnd?.kind && stroke.headEnd.kind !== "none";
    const tail = stroke?.tailEnd?.kind && stroke.tailEnd.kind !== "none";
    if (head && tail) return "both";
    if (head) return "head";
    if (tail) return "tail";
    return "none";
  }

  const setSelectionStrokeDash = (preset: StrokeDashPreset): void => {
    const slide = pres.slides[index];
    if (!slide) return;
    const cmds: EditCommand[] = [];
    for (const id of selection.values) {
      const s = findShape(slide, id);
      if (!s) continue;
      const target = pickFirstStyleShape(s);
      if (!target) continue;
      const prev = target.stroke;
      const color = prev?.paint?.kind === "solid" ? prev.paint.color : "#1e3a8a";
      const width = prev?.width ?? 1;
      const next: Stroke = prev
        ? { ...prev, dashPreset: preset, dash: dashPresetToArr(preset) }
        : {
            paint: { kind: "solid", color },
            width,
            dashPreset: preset,
            dash: dashPresetToArr(preset),
          };
      cmds.push(new SetStrokeCmd(index, id, next));
    }
    if (cmds.length === 1) stack.execute(cmds[0]!);
    else if (cmds.length > 1) stack.execute(new BatchCmd("Set outline dash", cmds));
  };

  function setSelectionLineArrows(mode: LineArrowMode): void {
    const slide = pres.slides[index];
    if (!slide) return;
    const tri = { kind: "triangle" as const, w: "med" as const, len: "med" as const };
    const cmds: EditCommand[] = [];
    for (const id of selection.values) {
      const s = findShape(slide, id);
      if (!s || s.kind !== "line") continue;
      const prev = s.stroke ?? { paint: { kind: "solid" as const, color: "#111827" }, width: 2 };
      const next: Stroke = { ...prev };
      delete next.headEnd;
      delete next.tailEnd;
      if (mode === "head" || mode === "both") next.headEnd = tri;
      if (mode === "tail" || mode === "both") next.tailEnd = tri;
      cmds.push(new SetStrokeCmd(index, id, next));
    }
    if (cmds.length === 1) stack.execute(cmds[0]!);
    else if (cmds.length > 1) stack.execute(new BatchCmd("Set line arrows", cmds));
  }

  function getSelectionLineArrows(): LineArrowMode | undefined {
    const slide = pres.slides[index];
    if (!slide) return undefined;
    for (const id of selection.values) {
      const s = findShape(slide, id);
      if (!s || s.kind !== "line") continue;
      return lineArrowModeFromStroke(s.stroke);
    }
    return undefined;
  }

  const selectionHasLine = (): boolean => {
    const slide = pres.slides[index];
    if (!slide) return false;
    for (const id of selection.values) {
      const s = findShape(slide, id);
      if (s?.kind === "line") return true;
    }
    return false;
  };

  const setSelectionFillPaint = (paint: Paint | undefined): void => {
    const slide = pres.slides[index];
    if (!slide) return;
    const cmds: EditCommand[] = [];
    for (const id of selection.values) {
      const s = findShape(slide, id);
      if (!s) continue;
      const target = pickFirstStyleShape(s);
      if (!target) continue;
      cmds.push(new SetFillCmd(index, id, paint));
    }
    if (cmds.length === 1) stack.execute(cmds[0]!);
    else if (cmds.length > 1) stack.execute(new BatchCmd("Set fill", cmds));
  };

  const applyFillGradientPreset = (presetId: string): void => {
    const preset = FILL_GRADIENT_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setSelectionFillPaint(preset.fill);
  };

  const applyShapeEffectPreset = (presetId: string): void => {
    const preset = SHAPE_EFFECT_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const slide = pres.slides[index];
    if (!slide) return;
    const cmds: EditCommand[] = [];
    for (const id of selection.values) {
      if (id === BACKGROUND_SEL_ID) continue;
      if (!findShape(slide, id)) continue;
      cmds.push(new SetShapeEffectsCmd(index, id, preset.patch));
    }
    if (cmds.length === 1) stack.execute(cmds[0]!);
    else if (cmds.length > 1) stack.execute(new BatchCmd("Shape effects", cmds));
    drawSlide(index);
  };

  // ECMA-376 §19.5.50 p:transition — slide 级过渡。
  // applyTransition / removeTransition / getCurrent 已下沉到 transition-panel.ts；
  // 这里仅保留预览闭包（preview 需要 stage / stageWrap 引用，由编辑器实例闭包提供）。
  // 预览：和 PowerPoint 一样演"上一页 → 当前页"。ghost 必须是上一页（第一页用黑屏，同放映开场），
  // 否则飞机 / 淡出 / 翻页这类只让旧页离场的效果，离场的和露出来的是同一张图，看不出任何变化。
  let previewBusy = false;
  const mountPreviewGhost = (prevSlide: Slide | undefined): { el: HTMLElement; destroy(): void } => {
    const el = host.ownerDocument.createElement("div");
    el.style.cssText = [
      "position:absolute",
      `left:${stage.offsetLeft}px`,
      `top:${stage.offsetTop}px`,
      `width:${stage.style.width || `${stage.clientWidth}px`}`,
      `height:${stage.style.height || `${stage.clientHeight}px`}`,
      "overflow:hidden",
      "pointer-events:none",
      "z-index:10",
    ].join(";");
    let be: SvgBackend | null = null;
    if (prevSlide) {
      const chromeBg = stageChromeBackground(prevSlide);
      el.style.background = chromeBg;
      be = new SvgBackend(buildScene(prevSlide), el, { transparent: chromeBg === "transparent" });
      be.flush();
    } else {
      el.style.background = "#000";
    }
    (stage.parentElement ?? stageWrap).appendChild(el);
    return {
      el,
      destroy: () => {
        be?.destroy();
        el.remove();
      },
    };
  };
  const previewTransitionOnStage = (): void => {
    if (previewBusy) return;
    const t = pres.slides[index]?.transition;
    if (!t || t.kind === "cut" || t.duration <= 0) return;
    previewBusy = true;
    void (async () => {
      try {
        const runFx = (await import("@ppt/transition-fx")).runTransition;
        if (t.kind === "morph" && index > 0) {
          const prevSlide = pres.slides[index - 1]!;
          const curSlide = pres.slides[index]!;
          const prevScene = createScene(prevSlide, pres.size, { masters: pres.masters });
          const curScene = createScene(curSlide, pres.size, { masters: pres.masters });
          const layers = mountMorphTransitionLayers(stageWrap, stage, prevScene, curScene, {
            chromeBg: stageChromeBackground(prevSlide),
          });
          try {
            await runFx(layers.ghost, layers.target, t);
          } finally {
            layers.cleanup();
          }
        } else {
          activeTextEdit?.close(true);
          const ghost = mountPreviewGhost(index > 0 ? pres.slides[index - 1] : undefined);
          const prevOverlayVis = overlay.style.visibility;
          overlay.style.visibility = "hidden";
          try {
            await runStageTransition(ghost.el, stage, t);
          } finally {
            overlay.style.visibility = prevOverlayVis;
            ghost.destroy();
          }
        }
      } catch {
        // 预览失败不打断编辑流程。
      } finally {
        previewBusy = false;
      }
    })();
  };

  // ---- 各类高级 Insert（表格 / 超链接 / 艺术字 / 页眉页脚 / 符号） ----
  // 表格：以 group + N×M 个 text cell 形式插入。
  //
  // 设计要点（追求最小通用方案，对齐 PowerPoint 行为）：
  //   - 每个 cell 是一个 TextShape（rect-fill + stroke + 可编辑文本），双击直接
  //     进入文本编辑（dblclick 路径会落到具体 cell）。
  //   - group 上写 tableMeta = { rows, cols }，Inspector 据此渲染"增/删行列"
  //     操作面板，children 的顺序约定为 r*cols + c。
  //   - 首行用更深的填充色暗示"标题行"，与 PowerPoint 默认 builtin 表格样式接近。
  const insertTable = (rows = 3, cols = 4): void => {
    if (!viewSlide()) return;
    const tw = Math.min(pres.size.width * 0.7, 600);
    const th = Math.min(pres.size.height * 0.5, 240);
    const cellW = tw / cols;
    const cellH = th / rows;
    const left = (pres.size.width - tw) / 2;
    const top = (pres.size.height - th) / 2;
    const children: Shape[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cellBbox: Rect = {
          x: left + c * cellW,
          y: top + r * cellH,
          w: cellW,
          h: cellH,
        };
        const isHeader = r === 0;
        const cell: Shape = {
          id: genShapeId("cell"),
          name: `R${r + 1}C${c + 1}`,
          zIndex: 0,
          visible: true,
          locked: false,
          opacity: 1,
          bbox: cellBbox,
          transform: { tx: 0, ty: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0 },
          kind: "text",
          fill: { kind: "solid", color: isHeader ? "#1e3a8a" : "#ffffff" },
          stroke: { paint: { kind: "solid", color: "#1e3a8a" }, width: 1 },
          paragraphs: [
            {
              align: "middle",
              runs: [
                {
                  text: "",
                  fontFamily: "sans-serif",
                  fontSize: 14,
                  color: isHeader ? "#ffffff" : "#111827",
                  fontWeight: isHeader ? 600 : 400,
                },
              ],
            },
          ],
          vAlign: "middle",
          wrap: true,
          cellMeta: { gridSpan: 1, rowSpan: 1 },
        } as Shape;
        children.push(cell);
      }
    }
    const group: Shape = {
      id: genShapeId("tbl"),
      name: "Table",
      zIndex: 0,
      visible: true,
      locked: false,
      opacity: 1,
      bbox: { x: left, y: top, w: tw, h: th },
      transform: { tx: 0, ty: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0 },
      kind: "group",
      children,
      tableMeta: { rows, cols, firstRow: true, bandRow: true },
    };
    addShapeCmd(group);
    selection.set([group.id]);
  };

  const insertChart = (): void => {
    if (!viewSlide()) return;
    const w = Math.min(pres.size.width * 0.7, 640);
    const h = Math.min(pres.size.height * 0.55, 360);
    const left = (pres.size.width - w) / 2;
    const top = (pres.size.height - h) / 2;
    const chart = createChart({
      bbox: { x: left, y: top, w, h },
      name: "Chart",
      chart: {
        type: "column",
        title: "Chart",
        categories: ["Q1", "Q2", "Q3", "Q4"],
        series: [
          { name: "Series 1", values: [12, 19, 8, 15] },
          { name: "Series 2", values: [9, 14, 11, 18] },
        ],
        legend: true,
      },
    });
    addShapeCmd(chart);
    selection.set([chart.id]);
  };

  const insertSmartArt = (): void => {
    if (!viewSlide()) return;
    void openSmartArtDialog(host.ownerDocument).then((picked) => {
      if (!picked) return;
      const w = Math.min(pres.size.width * 0.75, 640);
      const h = Math.min(pres.size.height * 0.45, 280);
      const left = (pres.size.width - w) / 2;
      const top = (pres.size.height - h) / 2;
      const items = defaultSmartArtItems(picked.layout);
      const group = createSmartArtGroup({
        id: genShapeId("sa"),
        layout: picked.layout,
        items,
        bbox: { x: left, y: top, w, h },
      });
      addShapeCmd(group);
      selection.set([group.id]);
    });
  };

  const convertToSmartArt = (): void => {
    const slide = viewSlide();
    if (!slide) return;
    const ids = [...selection.values].filter((id) => id !== BACKGROUND_SEL_ID);
    if (ids.length !== 1) {
      showToast(t("editor.smartArt.pickOneText"));
      return;
    }
    const sh = findShape(slide, ids[0]!);
    const text = sh ? pickTextShape(sh) : undefined;
    if (!text || text.kind !== "text") {
      showToast(t("editor.smartArt.pickOneText"));
      return;
    }
    const targetId = text.id;
    void openSmartArtDialog(host.ownerDocument).then((picked) => {
      if (!picked) return;
      let hitPos = -1;
      let hitLayer: (typeof slide.layers)[number] | undefined;
      for (const layer of slide.layers) {
        const p = layer.shapes.findIndex((s) => s.id === targetId);
        if (p >= 0) {
          hitPos = p;
          hitLayer = layer;
          break;
        }
      }
      stack.execute(new ConvertToSmartArtCmd(index, targetId, picked.layout));
      const g = hitLayer?.shapes[hitPos];
      if (g?.kind === "group" && g.smartArtMeta) selection.set([g.id]);
      drawSlide(index);
    });
  };

  // 超链接：给当前选中的 shape 写入 hyperlink 字段（OOXML hlink）。
  // 没有选中则提示用户先选；通过内嵌 modal 选择 url / slide / next / prev / first /
  // last / back / endShow 八种 OOXML 动作之一。modal 同时支持回填编辑（读取当前
  // 选中里第一个 shape 的 hyperlink，作为表单默认值）和「移除现有链接」按钮。
  const insertHyperlink = (): void => {
    if (selection.values.size === 0) {
      window.alert(t("editor.hyperlink.pickFirst"));
      return;
    }
    const slide = pres.slides[index];
    if (!slide) return;
    // 取选中的第一个 shape 的 hyperlink 当作 dialog 默认值；若多选不同链接则忽略冲突。
    let existing: HyperlinkRef | null = null;
    for (const id of selection.values) {
      const s = findShape(slide, id);
      if (s?.hyperlink) {
        existing = s.hyperlink;
        break;
      }
    }
    void openHyperlinkDialog(document, {
      totalSlides: pres.slides.length,
      currentSlideIdx: index,
      existing,
    }).then((res) => {
      if (res === null) return;
      const slideNow = pres.slides[index];
      if (!slideNow) return;
      const next = res === "remove" ? undefined : res;
      const cmds: EditCommand[] = [];
      for (const id of selection.values) {
        if (!findShape(slideNow, id)) continue;
        cmds.push(new SetShapeHyperlinkCmd(index, id, next));
      }
      if (cmds.length === 1) stack.execute(cmds[0]!);
      else if (cmds.length > 1) {
        stack.execute(new BatchCmd(next ? "Set hyperlink" : "Remove hyperlink", cmds));
      }
    });
  };

  // 艺术字：双重模式
  //   1. 选中 1 个 WordArt 形状（name === "WordArt"）→ 编辑模式：dialog 字段从
  //      现有 run 反推，提交后用 EditTextCmd + SetTextStyleCmd 改写。
  //   2. 否则 → 插入模式：用默认 preset 起手，提交后 AddShapeCmd 新增。
  // dialog 内字段：text / fontFamily / fontSize / bold / italic / fill 颜色 /
  // outline 颜色+宽度 / shadow 颜色 —— 任意 preset 选中后可继续微调。
  const insertWordArt = (): void => {
    const slide = pres.slides[index];
    if (!slide) return;
    const editTarget = pickWordArtEditTarget(slide);
    const initial: WordArtState = editTarget
      ? deriveWordArtState(editTarget)
      : defaultWordArtState(t("editor.wordart.placeholder"));
    void openWordArtDialog(document, initial, !!editTarget).then((res) => {
      if (!res) return;
      const slideNow = pres.slides[index];
      if (!slideNow) return;
      if (editTarget) {
        const cmds: EditCommand[] = [
          new EditTextCmd(index, editTarget.id, [res.text]),
          new SetTextStyleCmd(index, editTarget.id, wordArtStateToPatch(res)),
        ];
        stack.execute(new BatchCmd(t("cmd.editWordArt"), cmds));
        return;
      }
      const w = 480;
      const h = 100;
      const cx = pres.size.width / 2;
      const cy = pres.size.height / 2;
      const shape: Shape = {
        id: genShapeId("wa"),
        name: "WordArt",
        zIndex: 0,
        visible: true,
        locked: false,
        opacity: 1,
        bbox: { x: cx - w / 2, y: cy - h / 2, w, h },
        transform: { tx: 0, ty: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0 },
        kind: "text",
        paragraphs: [{ align: "middle", runs: [wordArtStateToRun(res)] }],
        vAlign: "middle",
        wrap: false,
        fromWordArt: true,
      } as Shape;
      addShapeCmd(shape);
      selection.set([shape.id]);
    });
  };

  // 仅当用户单选一个 name==="WordArt" 的 text shape 时返回它，作为「再次编辑」的目标。
  function pickWordArtEditTarget(slide: Slide): TextShape | null {
    if (selection.values.size !== 1) return null;
    const id = [...selection.values][0]!;
    const s = findShape(slide, id);
    if (!s) return null;
    if (s.kind === "text" && s.name === "WordArt") return s;
    // group 内的 WordArt 子节点
    if (s.kind === "group") {
      for (const c of s.children) {
        if (c.kind === "text" && c.name === "WordArt") return c;
      }
    }
    return null;
  }

  // 把现有 WordArt shape 的首个 run 拍扁成 dialog 的可编辑状态。颜色字段「无填充」
  // 用 "transparent" 哨兵；outline 缺失写 null；shadow 缺失把 kind 置 null（color
  // 仍保留以便用户切回开启时不必重选色）。
  function deriveWordArtState(s: TextShape): WordArtState {
    const para = s.paragraphs[0];
    const run = para?.runs[0];
    const color = paintedTextColor(run) ?? "#000000";
    const fontFamily = run?.fontFamily ?? "Calibri, sans-serif";
    const fontSize = run?.fontSize ?? 54;
    const bold = typeof run?.fontWeight === "number" ? run.fontWeight >= 600 : !!run?.fontWeight && String(run.fontWeight) !== "normal";
    const italic = !!run?.italic;
    let outlineColor: string | null = null;
    let outlineWidth = 1;
    if (run?.textOutline) {
      const paint = run.textOutline.paint;
      if (paint.kind === "solid") outlineColor = paint.color;
      outlineWidth = run.textOutline.width;
    }
    // 反推 shadow kind：先看 outer shadow（blur 大→soft，blur≈0→hard），再看 glow。
    let shadowKind: WordArtState["shadowKind"] = null;
    let shadowColor = "#000000";
    if (run?.effects) {
      const outer = run.effects.find((e): e is ShadowEffect => e.kind === "outer");
      const inner = run.effects.find((e): e is ShadowEffect => e.kind === "inner");
      const glow = run.effects.find((e) => e.kind === "glow");
      const reflection = run.effects.find((e) => e.kind === "reflection");
      if (outer) {
        shadowKind = outer.blur > 0 ? "soft" : "hard";
        shadowColor = outer.color;
      } else if (inner) {
        shadowKind = "inner";
        shadowColor = inner.color;
      } else if (glow && glow.kind === "glow") {
        shadowKind = "glow";
        shadowColor = glow.color;
      } else if (reflection) {
        shadowKind = "reflection";
      }
    }
    let fillGradient: WordArtState["fillGradient"] = null;
    if (run?.fill?.kind === "linear" && run.fill.stops.length >= 2) {
      const from = run.fill.stops[0]?.color ?? color;
      const to = run.fill.stops[run.fill.stops.length - 1]?.color ?? color;
      fillGradient = { from, to, angle: run.fill.angle };
    }
    return {
      text: para?.runs.map((r) => r.text).join("") ?? "",
      fontFamily,
      fontSize,
      bold,
      italic,
      fillColor: color === "transparent" ? "transparent" : color,
      fillGradient,
      outlineColor,
      outlineWidth,
      shadowKind,
      shadowColor,
    };
  }

  // 把 dialog 状态转成 TextRun（用于插入新形状）。
  function wordArtStateToRun(st: WordArtState): TextRun {
    const run: TextRun = {
      text: st.text,
      fontFamily: st.fontFamily,
      fontSize: st.fontSize,
      fontWeight: st.bold ? 700 : 400,
      italic: st.italic,
      color: st.fillGradient?.from ?? st.fillColor,
    };
    const fill = wordArtFillPaint(st);
    if (fill) run.fill = fill;
    if (st.outlineColor) {
      run.textOutline = wordArtOutline(st.outlineColor, st.outlineWidth);
    }
    const eff = wordArtEffectFor(st.shadowKind, st.shadowColor);
    if (eff) run.effects = [eff];
    return run;
  }

  // 把 dialog 状态转成 SetTextStyleCmd 的 patch（用于改写已有 run）。注意：当用户
  // 关闭 outline / shadow 时必须把字段显式置为 undefined，让命令把 run 上的值清掉。
  function wordArtStateToPatch(st: WordArtState): TextStylePatch {
    const eff = wordArtEffectFor(st.shadowKind, st.shadowColor);
    return {
      fontFamily: st.fontFamily,
      fontSize: st.fontSize,
      fontWeight: st.bold ? 700 : 400,
      italic: st.italic,
      color: st.fillGradient?.from ?? st.fillColor,
      fill: wordArtFillPaint(st),
      textOutline: st.outlineColor ? wordArtOutline(st.outlineColor, st.outlineWidth) : undefined,
      effects: eff ? [eff] : undefined,
    };
  }

  function wordArtFillPaint(st: WordArtState): Paint | null {
    const g = st.fillGradient;
    if (!g) return null;
    return {
      kind: "linear",
      angle: g.angle,
      stops: [
        { offset: 0, color: g.from },
        { offset: 1, color: g.to },
      ],
    };
  }

  function wordArtOutline(color: string, width: number): Stroke {
    return {
      paint: { kind: "solid", color },
      width,
    };
  }

  // 阴影 kind → ShapeEffect。参数与 PowerPoint 默认 WordArt gallery 的 outerShdw /
  // glow 配置近似。
  function wordArtEffectFor(
    kind: WordArtState["shadowKind"],
    color: string,
  ): ShapeEffect | null {
    if (!kind) return null;
    if (kind === "soft") {
      return { kind: "outer", blur: 6, dx: 2, dy: 2, color, alpha: 0.45 };
    }
    if (kind === "hard") {
      return { kind: "outer", blur: 0, dx: 3, dy: 3, color, alpha: 1 };
    }
    if (kind === "inner") {
      return { kind: "inner", blur: 4, dx: 0, dy: 1.5, color, alpha: 0.65 };
    }
    if (kind === "reflection") {
      return {
        kind: "reflection",
        blur: 0.5,
        startAlpha: 0.45,
        endAlpha: 0,
        startPos: 0,
        endPos: 0.55,
        dir: 90,
        dist: 2,
      };
    }
    return { kind: "glow", radius: 8, color, alpha: 0.7 };
  }

  // 符号：弹出内嵌 picker，按分类（基本 / 箭头 / 数学 / 货币 / 标点 / 杂项 / 希腊
  // 字母）展示常用 Unicode glyph；用户点击即提交并作为 text shape 插入。同时支持
  // 自定义输入（粘贴或输入任意符号）。
  const insertSymbol = (): void => {
    void openSymbolPicker(document).then((choice) => {
      if (!choice) return;
      if (!viewSlide()) return;
      const w = 80;
      const h = 80;
      const cx = pres.size.width / 2;
      const cy = pres.size.height / 2;
      const shape: Shape = {
        id: genShapeId("sym"),
        name: "Symbol",
        zIndex: 0,
        visible: true,
        locked: false,
        opacity: 1,
        bbox: { x: cx - w / 2, y: cy - h / 2, w, h },
        transform: { tx: 0, ty: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0 },
        kind: "text",
        paragraphs: [
          {
            align: "middle",
            runs: [{ text: choice, fontFamily: "sans-serif", fontSize: 48, color: "#111827" }],
          },
        ],
        vAlign: "middle",
        wrap: false,
      } as Shape;
      addShapeCmd(shape);
      selection.set([shape.id]);
    });
  };

  const insertIcon = (): void => {
    void openIconPickerDialog(document).then(async (res) => {
      if (!res || !viewSlide()) return;
      const size = 96;
      const svgSrc = lucideIconToDataUrl(document, res.iconId, { size, color: res.color });
      const src = await lucideIconToPngDataUrl(document, res.iconId, { size, color: res.color });
      const cx = pres.size.width / 2;
      const cy = pres.size.height / 2;
      const shape: Shape = {
        id: genShapeId("ico"),
        name: "Icon",
        zIndex: 0,
        visible: true,
        locked: false,
        opacity: 1,
        bbox: { x: cx - size / 2, y: cy - size / 2, w: size, h: size },
        transform: { tx: 0, ty: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0 },
        kind: "image",
        src,
        svgSrc,
        natural: { w: size, h: size },
        descr: encodeIconDescr(res.iconId, res.color),
      };
      addShapeCmd(shape);
      selection.set([shape.id]);
    });
  };

  const insertEquation = (): void => {
    void openEquationDialog(document).then(async (res) => {
      if (!res || !viewSlide()) return;
      try {
        const { src, natural } = await renderEquationToDataUrl(document, res.latex, {
          displayMode: res.displayMode,
          color: res.color,
        });
        const cx = pres.size.width / 2;
        const cy = pres.size.height / 2;
        const shape: Shape = {
          id: genShapeId("eq"),
          name: "Equation",
          zIndex: 0,
          visible: true,
          locked: false,
          opacity: 1,
          bbox: { x: cx - natural.w / 2, y: cy - natural.h / 2, w: natural.w, h: natural.h },
          transform: { tx: 0, ty: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0 },
          kind: "image",
          src,
          natural,
          lockAspect: true,
          math: { latex: res.latex, plain: res.latex },
          descr: encodeEquationDescr(res.latex, res.displayMode),
        };
        addShapeCmd(shape);
        selection.set([shape.id]);
      } catch (e) {
        window.alert((e as Error).message);
      }
    });
  };

  // 页眉页脚：写成 slide 上的 hdr/ftr 占位符 + `slide.hf`，导出为 OOXML `<p:hf>`。
  //
  // 行为（与 PowerPoint 一致）：
  //   1. 弹出 dialog 时回填已存在的 header / footer 文本（识别 name === "Header" /
  //      name === "Footer" 的顶层 text shape），让用户直观看到当前内容；
  //   2. 提交时按"已存在则更新文本（EditTextCmd），不存在则新建（AddShapeCmd），
  //      新文本为空则删除（DeleteShapeCmd）"语义统一覆写；
  //   3. 「删除全部」按钮：一次性清掉 applyAll 范围内的所有 header / footer。
  //
  // 这彻底解决了旧实现"每次点击都新加一份，无法统一修改 / 删除"的问题。
  const findHeaderFooter = (slide: Slide): { header?: Shape; footer?: Shape } => {
    let header: Shape | undefined;
    let footer: Shape | undefined;
    // 仅扫描顶层（layers.shapes 顶层），与 insert 时的写入位置对齐。
    for (const layer of slide.layers) {
      for (const s of layer.shapes) {
        if (s.kind !== "text") continue;
        if ((s.name === "Header" || s.placeholder?.type === "hdr") && !header) header = s;
        else if ((s.name === "Footer" || s.placeholder?.type === "ftr") && !footer) footer = s;
      }
    }
    return { header, footer };
  };

  const readTextContent = (s: Shape | undefined): string => {
    if (!s || s.kind !== "text") return "";
    return s.paragraphs.map((p) => p.runs.map((r) => r.text).join("")).join("\n");
  };

  // 从一个 header / footer text shape 中提取当前样式（取第一个 run + 第一个 paragraph）。
  // 用于回填 dialog 让用户在已有基础上微调。
  const readHeaderFooterStyle = (s: Shape | undefined): import("./dialog").HeaderFooterStyle => {
    if (!s || s.kind !== "text") return {};
    const p0 = s.paragraphs[0];
    const r0 = p0?.runs[0];
    if (!r0) return {};
    const fw = r0.fontWeight;
    const bold = typeof fw === "number" ? fw >= 600 : fw === "bold" || fw === "bolder";
    return {
      fontFamily: r0.fontFamily,
      fontSize: r0.fontSize,
      color: r0.color,
      bold,
      italic: !!r0.italic,
      underline: !!r0.underline,
      align: (p0?.align as "start" | "middle" | "end" | undefined) ?? "middle",
    };
  };

  const insertHeaderFooter = (): void => {
    const cur = pres.slides[index];
    const existing = cur ? findHeaderFooter(cur) : { header: undefined, footer: undefined };
    void openHeaderFooterDialog(host.ownerDocument, {
      headerText: readTextContent(existing.header),
      footerText: readTextContent(existing.footer),
      headerStyle: readHeaderFooterStyle(existing.header),
      footerStyle: readHeaderFooterStyle(existing.footer),
      applyAll: true,
    }).then((res) => {
      if (!res) return;
      const { headerText, footerText, headerStyle, footerStyle, applyAll, remove } = res;
      const cmds: EditCommand[] = [];
      // 把 dialog 返回的样式转换成 run 字段 patch（fontWeight 用 400/700 二态）。
      const toRunPatch = (s: import("./dialog").HeaderFooterStyle): TextStylePatch => {
        const out: TextStylePatch = {};
        if (s.fontFamily !== undefined) out.fontFamily = s.fontFamily;
        if (s.fontSize !== undefined) out.fontSize = s.fontSize;
        if (s.color !== undefined) out.color = s.color;
        if (s.bold !== undefined) out.fontWeight = s.bold ? 700 : 400;
        if (s.italic !== undefined) out.italic = s.italic;
        if (s.underline !== undefined) out.underline = s.underline;
        return out;
      };
      // 默认值（与原 hardcode 对齐，避免 undefined 写入 IR 字段缺失 → 渲染降级）。
      const headerFinal: import("./dialog").HeaderFooterStyle = {
        fontFamily: headerStyle.fontFamily ?? "sans-serif",
        fontSize: headerStyle.fontSize ?? 14,
        color: headerStyle.color ?? "#374151",
        bold: !!headerStyle.bold,
        italic: !!headerStyle.italic,
        underline: !!headerStyle.underline,
        align: headerStyle.align ?? "middle",
      };
      const footerFinal: import("./dialog").HeaderFooterStyle = {
        fontFamily: footerStyle.fontFamily ?? "sans-serif",
        fontSize: footerStyle.fontSize ?? 12,
        color: footerStyle.color ?? "#9ca3af",
        bold: !!footerStyle.bold,
        italic: !!footerStyle.italic,
        underline: !!footerStyle.underline,
        align: footerStyle.align ?? "middle",
      };
      for (let si = 0; si < pres.slides.length; si++) {
        const slide = pres.slides[si];
        if (!slide || (!applyAll && si !== index)) continue;
        const layerIdx = slide.layers.length - 1;
        const { header, footer } = findHeaderFooter(slide);

        // Header 同步：remove=true OR 新文本为空 → 删除现有；否则文本改用 EditTextCmd，
        // 样式改用 SetTextStyleCmd（run 字段）+ SetTextAlignCmd（段落字段）。
        const wantHeader = remove ? "" : headerText;
        if (header) {
          if (!wantHeader) {
            cmds.push(new DeleteShapeCmd(si, header.id));
          } else {
            if (readTextContent(header) !== wantHeader) {
              cmds.push(new EditTextCmd(si, header.id, [wantHeader]));
            }
            // 样式更新：始终下发（patch 为空字段会被忽略；wantStyle 与 readStyle 一致时
            // SetTextStyleCmd 内部走 no-op），保证用户在 dialog 调过样式后能立刻生效。
            cmds.push(new SetTextStyleCmd(si, header.id, toRunPatch(headerFinal)));
            if (headerFinal.align) {
              cmds.push(new SetTextAlignCmd(si, header.id, headerFinal.align));
            }
          }
        } else if (wantHeader) {
          const hs: Shape = {
            id: genShapeId("hdr"),
            name: "Header",
            zIndex: 0,
            visible: true,
            locked: false,
            opacity: 1,
            bbox: { x: 40, y: 20, w: pres.size.width - 80, h: 30 },
            transform: { tx: 0, ty: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0 },
            kind: "text",
            placeholder: { type: "hdr" },
            paragraphs: [
              {
                align: headerFinal.align,
                runs: [
                  {
                    text: wantHeader,
                    fontFamily: headerFinal.fontFamily,
                    fontSize: headerFinal.fontSize,
                    color: headerFinal.color,
                    fontWeight: headerFinal.bold ? 700 : 400,
                    italic: headerFinal.italic || undefined,
                    underline: headerFinal.underline || undefined,
                  },
                ],
              },
            ],
            vAlign: "middle",
            wrap: false,
          } as Shape;
          cmds.push(new AddShapeCmd(si, layerIdx, hs));
        }

        const wantFooter = remove ? "" : footerText;
        if (footer) {
          if (!wantFooter) {
            cmds.push(new DeleteShapeCmd(si, footer.id));
          } else {
            if (readTextContent(footer) !== wantFooter) {
              cmds.push(new EditTextCmd(si, footer.id, [wantFooter]));
            }
            cmds.push(new SetTextStyleCmd(si, footer.id, toRunPatch(footerFinal)));
            if (footerFinal.align) {
              cmds.push(new SetTextAlignCmd(si, footer.id, footerFinal.align));
            }
          }
        } else if (wantFooter) {
          const fs: Shape = {
            id: genShapeId("ftr"),
            name: "Footer",
            zIndex: 0,
            visible: true,
            locked: false,
            opacity: 1,
            bbox: { x: 40, y: pres.size.height - 50, w: pres.size.width - 80, h: 30 },
            transform: { tx: 0, ty: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0 },
            kind: "text",
            placeholder: { type: "ftr" },
            paragraphs: [
              {
                align: footerFinal.align,
                runs: [
                  {
                    text: wantFooter,
                    fontFamily: footerFinal.fontFamily,
                    fontSize: footerFinal.fontSize,
                    color: footerFinal.color,
                    fontWeight: footerFinal.bold ? 700 : 400,
                    italic: footerFinal.italic || undefined,
                    underline: footerFinal.underline || undefined,
                  },
                ],
              },
            ],
            vAlign: "middle",
            wrap: false,
          } as Shape;
          cmds.push(new AddShapeCmd(si, layerIdx, fs));
        }
        const nextHf = {
          ...(slide.hf ?? {}),
          hdr: Boolean(wantHeader),
          ftr: Boolean(wantFooter),
        };
        cmds.push(new SetSlideHfCmd(si, nextHf));
      }
      if (cmds.length === 1) stack.execute(cmds[0]!);
      else if (cmds.length > 1) stack.execute(new BatchCmd("Header / Footer", cmds));
    });
  };

  // ---- 放映插件勾选状态 ----
  // 初始勾选：opts.selectedPlaybackPlugins 优先；否则按 availablePlaybackPlugins 各项的
  // defaultEnabled 决定。这两个都没传时为空集（按钮也会因 entries 为空而隐藏）。
  // 「窗口模式 / 循环放映」是 editor 本地的 UI 镜像，源真值在宿主（playground）
  // 持有，通过 opts.xxx 注入初值，用户点击 toggle 时通过 onXxxChange 回写。
  // 这样 editor 不持有任何持久化逻辑，destroy 后状态依然存在于宿主。
  let windowedMode = opts.windowedMode ?? false;
  let slideshowLoop = opts.slideshowLoop ?? false;
  let presenterMode = opts.presenterMode ?? false;
  let slideshowUseTimings = opts.slideshowUseTimings ?? true;
  let slideshowPlayNarrations = opts.slideshowPlayNarrations ?? true;

  const commitShowPropertiesFromLocals = (mediaControls?: boolean): void => {
    const uiNow = showPropertiesToUi(pres.showPr);
    const next = applyUiToShowProperties(pres.showPr, {
      loop: slideshowLoop,
      windowed: windowedMode,
      useTimings: slideshowUseTimings,
      playNarrations: slideshowPlayNarrations,
      showMediaControls: mediaControls ?? uiNow.showMediaControls,
    });
    if (showPropertiesSnapshot(next) === showPropertiesSnapshot(pres.showPr)) return;
    try {
      stack.execute(new SetShowPropertiesCmd(next));
    } catch (e) {
      if (!isEditingBlockedError(e)) throw e;
    }
    const ui = showPropertiesToUi(pres.showPr);
    slideshowLoop = ui.loop;
    windowedMode = ui.windowed;
    slideshowUseTimings = ui.useTimings;
    slideshowPlayNarrations = ui.playNarrations;
  };

  syncSlideshowLocalsFromPres = (): void => {
    const ui = showPropertiesToUi(pres.showPr);
    slideshowLoop = ui.loop;
    windowedMode = ui.windowed;
    slideshowUseTimings = ui.useTimings;
    slideshowPlayNarrations = ui.playNarrations;
  };
  let availablePlaybackPlugins = opts.availablePlaybackPlugins ?? [];
  const selectedPlaybackPlugins = new Set<string>();
  if (opts.selectedPlaybackPlugins) {
    for (const id of opts.selectedPlaybackPlugins) selectedPlaybackPlugins.add(id);
  } else {
    for (const e of availablePlaybackPlugins) {
      if (e.defaultEnabled) selectedPlaybackPlugins.add(e.id);
    }
  }
  const playbackPluginIdsInOrder = (): string[] =>
    availablePlaybackPlugins
      .map((e) => e.id)
      .filter((id) => selectedPlaybackPlugins.has(id));

  const pluginChooserLabels = () => ({
    official: t("ribbon.plugins.official"),
    imported: t("ribbon.plugins.imported"),
    import: t("ribbon.plugins.import"),
    delete: t("ribbon.plugins.delete"),
    privateNote: t("ribbon.plugins.private"),
    empty: t("ribbon.plugins.emptyOfficial"),
  });

  const openPlaybackPlugins = (anchor: HTMLElement): void => {
    openPlaybackPluginPopover(host.ownerDocument, anchor, {
      entries: availablePlaybackPlugins,
      selected: selectedPlaybackPlugins,
      title: t("ribbon.playbackPlugins.title"),
      emptyText: t("ribbon.playbackPlugins.empty"),
      labels: pluginChooserLabels(),
      onImport: () => opts.importPlugin?.("playback") ?? Promise.resolve(null),
      onDelete: (id) => opts.deleteImportedPlugin?.(id) ?? Promise.resolve(false),
      onChange: (next) => {
        selectedPlaybackPlugins.clear();
        for (const id of next) selectedPlaybackPlugins.add(id);
        opts.onPlaybackPluginsChange?.(playbackPluginIdsInOrder());
      },
    });
  };

  const editorPluginMarketEntries = (): Array<{
    id: string;
    name: string;
    description?: string;
    origin?: "official" | "imported";
  }> =>
    editorPluginCatalog.map((e) => ({
      id: e.id,
      name: e.name ?? (e.nameKey ? t(e.nameKey as Parameters<typeof t>[0]) : e.id),
      description:
        e.description ?? (e.descriptionKey ? t(e.descriptionKey as Parameters<typeof t>[0]) : undefined),
      origin: e.origin ?? (e.id.startsWith("official:") ? "official" : "imported"),
    }));

  const editorPluginIdsInOrder = (): string[] =>
    editorPluginCatalog.map((e) => e.id).filter((id) => enabledEditorPlugins.has(id));

  const syncEditorPluginsFromMarket = (next: Set<string>): void => {
    for (const entry of editorPluginCatalog) {
      const was = enabledEditorPlugins.has(entry.id);
      const now = next.has(entry.id);
      if (now && !was) {
        enabledEditorPlugins.add(entry.id);
        void editorPlugins?.register(entry.create());
      } else if (!now && was) {
        enabledEditorPlugins.delete(entry.id);
        editorPlugins?.unregister(entry.id);
      }
    }
    opts.onEditorPluginsChange?.(editorPluginIdsInOrder());
    toolbar.refresh();
  };

  const openEditorPlugins = (anchor: HTMLElement): void => {
    openEditorPluginMarketPopover(host.ownerDocument, anchor, {
      entries: editorPluginMarketEntries(),
      enabled: enabledEditorPlugins,
      title: t("ribbon.editorPlugins.title"),
      emptyText: t("ribbon.editorPlugins.empty"),
      labels: pluginChooserLabels(),
      onImport: () => opts.importPlugin?.("editor") ?? Promise.resolve(null),
      onDelete: (id) => opts.deleteImportedPlugin?.(id) ?? Promise.resolve(false),
      onChange: (next) => syncEditorPluginsFromMarket(next),
    });
  };

  let findReplaceHandle: FindReplaceHandle | null = null;

  const cancelAnimationPainter = (): void => {
    animationPainter = { sourceId: null, persistent: false };
    if (!formatPainter.snapshot) stageWrap.style.cursor = "";
    toolbar.refresh();
    animPanel?.refresh();
  };

  const shapeHasAnimations = (slide: Slide, shapeId: string): boolean => {
    if (!slide.ooxmlTiming) return false;
    const src = shapeId.replace(/^sp_/, "");
    return buildEffectList(slide.ooxmlTiming).some(
      (e) => (e.targetShapeId ?? "").replace(/^sp_/, "") === src,
    );
  };

  activateAnimationPainter = (persistent: boolean): void => {
    if (animationPainter.sourceId) {
      cancelAnimationPainter();
      return;
    }
    if (formatPainter.snapshot) cancelFormatPainter();
    const slide = viewSlide();
    if (!slide) return;
    const ids = [...selection.values].filter((id) => id !== BACKGROUND_SEL_ID);
    if (ids.length !== 1) {
      showToast(t("editor.animationPainter.pickSource"));
      return;
    }
    const sourceId = ids[0]!;
    if (!shapeHasAnimations(slide, sourceId)) {
      showToast(t("editor.animationPainter.noAnimations"));
      return;
    }
    animationPainter = { sourceId, persistent };
    stageWrap.style.cursor = "copy";
    showToast(
      persistent ? t("editor.animationPainter.activePersistent") : t("editor.animationPainter.active"),
    );
    toolbar.refresh();
    animPanel?.refresh();
  };

  interface FormatPainterState {
    snapshot: import("./commands").FormatSnapshot | null;
    sourceId: string | null;
    persistent: boolean;
  }
  let formatPainter: FormatPainterState = { snapshot: null, sourceId: null, persistent: false };

  const cancelFormatPainter = (): void => {
    formatPainter = { snapshot: null, sourceId: null, persistent: false };
    if (!animationPainter.sourceId) stageWrap.style.cursor = "";
    toolbar.refresh();
  };

  const activateFormatPainter = (persistent: boolean): void => {
    if (formatPainter.snapshot) {
      cancelFormatPainter();
      return;
    }
    if (animationPainter.sourceId) cancelAnimationPainter();
    const slide = viewSlide();
    if (!slide) return;
    const ids = [...selection.values].filter((id) => id !== BACKGROUND_SEL_ID);
    if (ids.length !== 1) {
      showToast(t("editor.formatPainter.pickSource"));
      return;
    }
    const sourceId = ids[0]!;
    const s = findShape(slide, sourceId);
    if (!s) return;
    formatPainter = {
      snapshot: captureFormatSnapshot(s),
      sourceId,
      persistent,
    };
    stageWrap.style.cursor = "copy";
    showToast(persistent ? t("editor.formatPainter.activePersistent") : t("editor.formatPainter.active"));
    toolbar.refresh();
  };

  const getCurrentTransitionForRibbon = (): { kind: string; duration: number } | undefined => {
    const tr = pres.slides[index]?.transition;
    if (!tr) return { kind: "cut", duration: 0.6 };
    return { kind: tr.kind, duration: tr.duration };
  };

  const applyQuickTransition = (kind: string, durationSec?: number): void => {
    const dur = durationSec ?? pres.slides[index]?.transition?.duration ?? 0.6;
    if (kind === "cut") {
      stack.execute(new SetSlideTransitionCmd(index, undefined, false));
    } else {
      stack.execute(new SetSlideTransitionCmd(index, { kind, duration: dur }, false));
    }
    transitionPanel?.refresh();
    toolbar.refresh();
  };

  const applyTransitionToAll = (): void => {
    const tr = pres.slides[index]?.transition;
    if (!tr) {
      showToast(t("editor.transition.noneToApply"));
      return;
    }
    stack.execute(
      new SetSlideTransitionCmd(
        index,
        { kind: tr.kind, duration: tr.duration, params: tr.params ? { ...tr.params } : undefined },
        true,
      ),
    );
    toolbar.refresh();
  };

  const getProofingSelection = (): ProofingSelection | null => {
    if (editorContext.kind !== "slides") {
      showToast(t("proofing.needSlide"));
      return null;
    }
    if (selection.values.size !== 1) {
      showToast(t("proofing.needTextShape"));
      return null;
    }
    const shapeId = [...selection.values][0]!;
    if (shapeId === BACKGROUND_SEL_ID) return null;
    const slide = pres.slides[index];
    if (!slide) return null;
    const sel = proofingSelectionFromShape(index, shapeId, findShape(slide, shapeId));
    if (!sel) showToast(t("proofing.needTextShape"));
    return sel;
  };

  const openThesaurus = (): void => {
    const sel = getProofingSelection();
    openThesaurusDialog(host.ownerDocument, sel?.word ?? "", (synonym) => {
      if (!sel) return;
      const slide = pres.slides[sel.slideIdx];
      const s = slide ? findShape(slide, sel.shapeId) : undefined;
      if (!s || s.kind !== "text") return;
      const next = replaceFirstWordInParagraphs(s.paragraphs, sel.word, synonym);
      if (!next) return;
      stack.execute(new SetParagraphsCmd(sel.slideIdx, sel.shapeId, next));
      drawSlide(index);
    });
  };

  const openTranslate = (): void => {
    const sel = getProofingSelection();
    if (!sel) return;
    const lang = getEffectiveProofingLanguage(pres);
    openTranslateDialog(host.ownerDocument, {
      sourceText: sel.fullText,
      fromLang: lang,
      toLang: lang === "en" ? "zh" : "en",
      onApply: (translated) => {
        stack.execute(
          new SetParagraphsCmd(sel.slideIdx, sel.shapeId, [{ runs: [{ text: translated, fontSize: 14 }] }]),
        );
        drawSlide(index);
      },
    });
  };

  const openProofingLanguage = (): void => {
    openProofingLanguageDialog(host.ownerDocument, getEffectiveProofingLanguage(pres), (langId) => {
      stack.execute(new SetProofingLanguageCmd(langId));
      syncProofingLang();
    });
  };

  const openCompare = (): void => {
    openCompareDialog(host.ownerDocument, {
      pres,
      gotoSlide: (i) => goto(i),
      acceptSlide: (slideIdx, other) => {
        const patches = comparedSlideParagraphs(pres, slideIdx, other);
        if (!patches.length) return;
        const cmds = patches.map((p) => new SetParagraphsCmd(slideIdx, p.shapeId, p.paragraphs));
        if (cmds.length === 1) stack.execute(cmds[0]!);
        else stack.execute(new BatchCmd("Accept compare", cmds));
        drawSlide(index);
      },
      acceptAllSlides: (other, slideIndices) => {
        const cmds: EditCommand[] = [];
        for (const slideIdx of slideIndices) {
          const patches = comparedSlideParagraphs(pres, slideIdx, other);
          for (const p of patches) {
            cmds.push(new SetParagraphsCmd(slideIdx, p.shapeId, p.paragraphs));
          }
        }
        if (!cmds.length) return;
        stack.execute(new BatchCmd("Accept all compare", cmds));
        drawSlide(index);
      },
    });
  };

  const openSmartLookup = (): void => {
    const sel = getProofingSelection();
    openSmartLookupDialog(host.ownerDocument, sel?.word ?? "", proofingLangTag(pres));
  };

  const openProtect = (): void => {
    openProtectDialog(host.ownerDocument, pres, (next, officeModifyVerifier) => {
      stack.execute(new SetPresentationProtectionCmd(next, undefined, officeModifyVerifier));
      toolbar.refresh();
      refreshStatus();
    });
  };

  const openEmbedFonts = (): void => {
    openEmbedFontsDialog(host.ownerDocument, pres, stack);
  };

  const openVbaInfo = (): void => {
    openVbaInfoDialog(host.ownerDocument, pres);
  };

  const openPhotoAlbum = (): void => {
    openPhotoAlbumDialog(host.ownerDocument, ({ images, album }) => {
      const at = pres.slides.length;
      stack.execute(new ApplyPhotoAlbumCmd(at, images, album));
      goto(at);
      drawSlide(at);
      toolbar.refresh();
      refreshStatus();
    });
  };

  const openModel3DPicker = (): void => {
    void openModel3DPickerDialog(host.ownerDocument, {
      assetsBaseUrl: opts.model3dAssetsBaseUrl ?? "/",
    }).then((picked) => {
      if (!picked) return;
      insertModel3D(picked.presetId, picked.glbSrc, picked.label);
      drawSlide(index);
      toolbar.refresh();
      refreshStatus();
    });
  };

  const openOleInsert = (): void => {
    void openOleInsertDialog(host.ownerDocument).then((picked) => {
      if (!picked) return;
      insertOleObject(picked.fileName, picked.embedSrc, picked.showAsIcon);
      drawSlide(index);
      toolbar.refresh();
      refreshStatus();
    });
  };

  const isProtected = (): boolean => isPresentationEditingBlocked(pres);

  const helpLinks: HelpLinks = opts.helpLinks ?? {};
  const openHelp = (): void => {
    openHelpDialog(host.ownerDocument, helpLinks);
  };
  const openFeedback = (): void => {
    openExternalHelpLink(helpLinks.feedbackUrl, host.ownerDocument, "help.missingFeedback");
  };
  const openTraining = (): void => {
    openExternalHelpLink(helpLinks.trainingUrl, host.ownerDocument, "help.missingTraining");
  };

  const openFindReplace = (mode: "find" | "replace"): void => {
    findReplaceHandle?.close();
    findReplaceHandle = openFindReplacePanel(
      host.ownerDocument,
      {
        getPresentation: () => pres,
        getCurrentSlideIdx: () => index,
        gotoSlide: (i) => goto(i),
        selectShape: (id) => {
          selection.set([id]);
          drawSlide(index);
        },
        executeCommand: (cmd) => {
          stack.execute(cmd);
          drawSlide(index);
        },
        executeBatch: (label, cmds) => {
          stack.execute(new BatchCmd(label, cmds));
          drawSlide(index);
        },
      },
      mode,
    );
  };

  const insertRecordedMedia = (result: import("./record-dialog").RecordResult): void => {
    if (result.kind === "video") {
      insertVideo(result.dataUrl, {
        duration: result.duration,
        w: result.w,
        h: result.h,
        poster: result.poster,
        autoplay: true,
      });
    } else {
      insertAudio(result.dataUrl, { duration: result.duration });
    }
    drawSlide(index);
  };

  const applyEditorContext = (ctx: EditorContext): void => {
    if (ctx.kind !== "slides" && presentationView !== "normal") {
      applyPresentationView("normal");
    }
    editorContext = ctx;
    selection.clear();
    drawSlide(index);
    syncNotesPane();
  };

  let savingVideo = false;
  const toolbar = buildRibbon(host.ownerDocument, {
    insertShape,
    armShapeDraw,
    selectPointer: () => {
      if (inkMode) {
        inkMode = null;
        inkOverlay?.setMode(null);
      }
      pendingShapeKind = null;
      updateShapeDrawCursor();
      toolbar.refresh();
    },
    stepZoom,
    getZoomPercent: () => ({ fit: zoomMode === "fit", percent: stageScale * 100 }),
    toggleAppearance: opts.toggleAppearance,
    isDarkAppearance: opts.isDarkAppearance,
    subscribeAppearance: opts.subscribeAppearance,
    insertImage: pickImageFile,
    insertSlide: insertSlideAfterCurrent,
    openPhotoAlbum,
    insertOnlinePicture: opts.getStockImageKeys
      ? () => {
          const keys = opts.getStockImageKeys!();
          if (!keys.unsplashKey?.trim() && !keys.pexelsKey?.trim()) {
            opts.onRequestStockImageKeys?.();
            return;
          }
          void openStockImagePickerDialog(host.ownerDocument, {
            keys,
            onMissingKeys: opts.onRequestStockImageKeys,
          }).then((picked) => {
            if (!picked) return;
            insertImage(picked.dataUrl, picked.natural);
          });
        }
      : undefined,
    insertScreenshot: isScreenshotSupported()
      ? () => {
          void captureScreenshot(host.ownerDocument)
            .then((shot) => {
              if (!shot) {
                showToast(t("dialog.screenshot.failed"));
                return;
              }
              insertImage(shot.dataUrl, { w: shot.w, h: shot.h });
            })
            .catch(() => {
              showToast(t("dialog.screenshot.failed"));
            });
        }
      : undefined,
    insertVideo: () => pickMediaFile("video"),
    insertAudio: () => pickMediaFile("audio"),
    openMediaLibrary: opts.mediaLibrary
      ? () => {
          void openMediaLibraryDialog(host.ownerDocument, opts.mediaLibrary!).then((picked) => {
            if (!picked) return;
            if (picked.kind === "image") {
              insertImage(
                picked.dataUrl,
                picked.width && picked.height ? { w: picked.width, h: picked.height } : undefined,
              );
            } else if (picked.kind === "video") {
              insertVideo(picked.dataUrl, {
                duration: picked.duration,
                w: picked.width,
                h: picked.height,
              });
            } else {
              insertAudio(picked.dataUrl, { duration: picked.duration });
            }
            drawSlide(index);
          });
        }
      : undefined,
    openRecordDialog: isRecordSupported()
      ? () => {
          void openRecordDialog(host.ownerDocument).then((result) => {
            if (result) insertRecordedMedia(result);
          });
        }
      : undefined,
    saveAsVideo: () => {
      if (savingVideo) {
        showToast(t("ribbon.record.saveVideoWorking"));
        return;
      }
      savingVideo = true;
      void (async () => {
        try {
          const { exportSlideshowVideo, slideshowVideoSlides } = await import("./slideshow-video");
          const { openSlideshowVideoDialog } = await import("./slideshow-video-dialog");
          const { downloadBlob, suggestedRecordingFilename } = await import("./video-export");
          const hasTimings = slideshowVideoSlides(pres).some((s) => {
            const adv = s.transition?.params?.advAfter;
            return typeof adv === "number" && adv > 0;
          });
          const settings = await openSlideshowVideoDialog(host.ownerDocument, { hasTimings, deckSize: pres.size });
          if (!settings) return;
          showToast(t("ribbon.record.saveVideoWorking"), 60_000);
          const out = await exportSlideshowVideo(pres, {
            ...settings,
            onProgress: (p) =>
              showToast(
                p.phase === "render"
                  ? t("ribbon.record.saveVideoProgress", { done: p.done, total: p.total })
                  : t("ribbon.record.saveVideoConverting"),
                600_000,
              ),
          });
          downloadBlob(
            host.ownerDocument,
            out.blob,
            suggestedRecordingFilename("slideshow", out.ext),
          );
          showToast(
            settings.format === "mp4" && out.ext !== "mp4"
              ? t("record.mp4Fallback")
              : t("ribbon.record.saveVideoDone"),
          );
        } catch {
          showToast(t("ribbon.record.saveVideoFailed"));
        } finally {
          savingVideo = false;
        }
      })();
    },
    insertTable,
    insertChart,
    insertSmartArt,
    convertToSmartArt,
    insertHyperlink,
    insertWebEmbed,
    insertDateTimeField,
    insertSlideNumberField,
    setBookmark: setBookmarkOnSelection,
    insertWordArt,
    insertSymbol,
    insertIcon,
    insertEquation,
    openModel3DPicker,
    openOleInsert,
    insertHeaderFooter,
    saveAs: opts.saveAs,
    canExport: opts.canExport,
    getShareUrl: opts.getShareUrl,
    save: opts.save,
    openEmbedFonts,
    openVbaInfo: presentationHasVbaProject(pres) ? openVbaInfo : undefined,
    hasVbaProject: () => presentationHasVbaProject(pres),
    openFile: opts.openFile,
    openRecent: opts.openRecent,
    newPresentation: opts.newPresentation,
    print: opts.print ?? (() => host.ownerDocument.defaultView?.print()),
    share: opts.share,
    openAccount: opts.openAccount,
    openOptions: opts.openOptions,
    openCollab: opts.openCollab,
    isShareAvailable: opts.isShareAvailable,
    getSlideIndex: () => index,
    getSlideCount: () => pres.slides.length,
    openPlaybackPlugins:
      availablePlaybackPlugins.length > 0 ? openPlaybackPlugins : undefined,
    playbackPluginCount: () => selectedPlaybackPlugins.size,
    openEditorPlugins: editorPluginCatalog.length > 0 ? openEditorPlugins : undefined,
    editorPluginCount: () => enabledEditorPlugins.size,
    startSlideshowFromBeginning: opts.startSlideshowFromBeginning,
    startSlideshowFromCurrent: opts.startSlideshowFromCurrent,
    startLiveSlideshow: opts.startLiveSlideshow,
    // 窗口模式：本地 state + 回调宿主。
    // 仅当宿主提供 onWindowedModeChange 时才暴露 toggle —— 否则宿主不会处理这个标志，
    // 暴露按钮反而误导用户。
    toggleWindowedMode:
      opts.onWindowedModeChange
        ? (): boolean => {
            windowedMode = !windowedMode;
            commitShowPropertiesFromLocals();
            opts.onWindowedModeChange?.(windowedMode);
            return windowedMode;
          }
        : undefined,
    isWindowedModeOn: opts.onWindowedModeChange ? (): boolean => windowedMode : undefined,
    // 循环放映：本地 state + 回调宿主。
    // 仅当宿主提供 onSlideshowLoopChange 时才在 ribbon 渲染按钮（即宿主真正会
    // 处理这个标志位时才暴露 UI）。
    toggleSlideshowLoop:
      opts.onSlideshowLoopChange
        ? (): boolean => {
            slideshowLoop = !slideshowLoop;
            commitShowPropertiesFromLocals();
            opts.onSlideshowLoopChange?.(slideshowLoop);
            return slideshowLoop;
          }
        : undefined,
    isSlideshowLoopOn: opts.onSlideshowLoopChange ? (): boolean => slideshowLoop : undefined,
    // 演讲者视图：本地 state + 回调宿主。仅当宿主提供 onPresenterModeChange 时才暴露 toggle。
    togglePresenterView:
      opts.onPresenterModeChange
        ? (): boolean => {
            presenterMode = !presenterMode;
            opts.onPresenterModeChange?.(presenterMode);
            return presenterMode;
          }
        : undefined,
    isPresenterViewOn: opts.onPresenterModeChange ? (): boolean => presenterMode : undefined,
    toggleSlideshowUseTimings:
      opts.onSlideshowUseTimingsChange
        ? (): boolean => {
            slideshowUseTimings = !slideshowUseTimings;
            commitShowPropertiesFromLocals();
            opts.onSlideshowUseTimingsChange?.(slideshowUseTimings);
            return slideshowUseTimings;
          }
        : undefined,
    isSlideshowUseTimingsOn: opts.onSlideshowUseTimingsChange ? (): boolean => slideshowUseTimings : undefined,
    toggleSlideshowPlayNarrations:
      opts.onSlideshowPlayNarrationsChange
        ? (): boolean => {
            slideshowPlayNarrations = !slideshowPlayNarrations;
            commitShowPropertiesFromLocals();
            opts.onSlideshowPlayNarrationsChange?.(slideshowPlayNarrations);
            return slideshowPlayNarrations;
          }
        : undefined,
    isSlideshowPlayNarrationsOn: opts.onSlideshowPlayNarrationsChange
      ? (): boolean => slideshowPlayNarrations
      : undefined,
    // 隐藏当前幻灯片：直接走 SetSlideShowCmd，可撤销。
    toggleCurrentSlideHidden: (): boolean => {
      const slide = pres.slides[index];
      if (!slide) return false;
      const hideNow = slide.show === false;
      stack.execute(new SetSlideShowCmd(index, hideNow));
      return slide.show === false;
    },
    isCurrentSlideHidden: (): boolean => pres.slides[index]?.show === false,
    // 母版视图：始终提供按钮。无 master 的 deck（deckgen / blank）进入时补一份空白母版。
    toggleMasterView: (): boolean => {
      if (editorContext.kind === "master") {
        applyEditorContext({ kind: "slides" });
      } else {
        const masters = ensureSlideMasters(pres);
        applyEditorContext({ kind: "master", masterId: masters[0]!.id });
      }
      return editorContext.kind === "master";
    },
    isMasterViewOn: (): boolean => editorContext.kind === "master",
    getMasterOutline: (): Array<{ masterId: string; name: string; layouts: Array<{ id: string; name: string }> }> =>
      (pres.masters ?? []).map((m) => ({
        masterId: m.id,
        name: m.name,
        layouts: (m.layouts ?? []).map((l) => ({ id: l.id, name: l.name })),
      })),
    getMasterTarget: (): { masterId: string; layoutId?: string } | undefined =>
      editorContext.kind === "master"
        ? { masterId: editorContext.masterId, layoutId: editorContext.layoutId }
        : undefined,
    setMasterTarget: (masterId: string, layoutId?: string): void => {
      applyEditorContext({ kind: "master", masterId, layoutId });
    },
    toggleNotesMasterView: (): boolean => {
      if (editorContext.kind === "notesMaster") {
        applyEditorContext({ kind: "slides" });
      } else {
        const masters = ensureNotesMasters(pres);
        applyEditorContext({ kind: "notesMaster", masterId: masters[0]!.id });
      }
      return editorContext.kind === "notesMaster";
    },
    isNotesMasterViewOn: (): boolean => editorContext.kind === "notesMaster",
    toggleHandoutMasterView: (): boolean => {
      if (editorContext.kind === "handoutMaster") {
        applyEditorContext({ kind: "slides" });
      } else {
        const masters = ensureHandoutMasters(pres);
        applyEditorContext({ kind: "handoutMaster", masterId: masters[0]!.id });
      }
      return editorContext.kind === "handoutMaster";
    },
    isHandoutMasterViewOn: (): boolean => editorContext.kind === "handoutMaster",
    setSlideAspect,
    setBackground: setBgColor,
    openFormatBackground: () => {
      openFormatBackgroundDialog(host.ownerDocument, {
        getPaint: () => resolveTarget(pres, viewTarget())?.background,
        apply: (next) => stack.execute(new SetBackgroundTargetCmd(viewTarget(), next)),
        newImageAlpha: 0.55,
      });
    },
    openThemeGallery: opts.openThemeGallery,
    openDesigner: opts.openDesigner ?? (() => {
      openDesignerDialog(host.ownerDocument, {
        pres,
        onJumpToSlide: (idx) => goto(idx),
        aiAvailable: opts.designer?.aiAvailable,
        onAfterApplyFixes: opts.designer?.onAfterApplyFixes,
        ...(opts.designer?.runAiReview ? { onRunAiReview: opts.designer.runAiReview } : {}),
      });
    }),
    getCurrentThemeId: (): string | undefined => pres.theme?.name ?? pres.theme?.id,
    setZoom,
    toggleGrid,
    isGridOn: () => gridOn,
    toggleRulers: () => {
      rulersOn = !rulersOn;
      updateRulers();
      refreshRibbonToggles?.();
      return rulersOn;
    },
    isRulersOn: () => rulersOn,
    toggleGuides: () => {
      staticGuidesOn = !staticGuidesOn;
      if (staticGuidesOn && staticGuideLines.v.length === 0 && staticGuideLines.h.length === 0) {
        staticGuideLines.v.push(pres.size.width / 2);
        staticGuideLines.h.push(pres.size.height / 2);
      }
      persistViewGuides();
      syncRulerPointerEvents();
      renderOverlay();
      refreshRibbonToggles?.();
      return staticGuidesOn;
    },
    isGuidesOn: () => staticGuidesOn,
    getGuideAidColor: () => guideAidColor,
    setGuideAidColor: (color: string) => {
      commitAidColor(GUIDE_AID_COLOR_KEY, color, (next) => {
        guideAidColor = next;
      });
    },
    getGuideAidOpacity: () => guideAidOpacity,
    setGuideAidOpacity: (opacity: number) => {
      commitAidOpacity(GUIDE_AID_OPACITY_KEY, opacity, (next) => {
        guideAidOpacity = next;
      });
    },
    resetGuideAidColor: () => {
      clearAidColor(aidColorStore(), GUIDE_AID_COLOR_KEY);
      clearAidColor(aidColorStore(), GUIDE_AID_OPACITY_KEY);
      guideAidColor = DEFAULT_GUIDE_AID_COLOR;
      guideAidOpacity = DEFAULT_AID_OPACITY;
      renderOverlay();
    },
    getGridAidColor: () => gridAidColor,
    setGridAidColor: (color: string) => {
      commitAidColor(GRID_AID_COLOR_KEY, color, (next) => {
        gridAidColor = next;
      });
    },
    getGridAidOpacity: () => gridAidOpacity,
    setGridAidOpacity: (opacity: number) => {
      commitAidOpacity(GRID_AID_OPACITY_KEY, opacity, (next) => {
        gridAidOpacity = next;
      });
    },
    resetGridAidColor: () => {
      clearAidColor(aidColorStore(), GRID_AID_COLOR_KEY);
      clearAidColor(aidColorStore(), GRID_AID_OPACITY_KEY);
      gridAidColor = DEFAULT_GRID_AID_COLOR;
      gridAidOpacity = DEFAULT_AID_OPACITY;
      renderOverlay();
    },
    toggleNotes: () => {
      const on = dockOpen && dockTab === "notes";
      if (on) showDock(false);
      else {
        setDockTab("notes");
        showDock(true);
      }
      return dockOpen && dockTab === "notes";
    },
    isNotesOn: () => dockOpen && dockTab === "notes",
    toggleLecture: () => {
      const on = dockOpen && dockTab === "lecture";
      if (on) showDock(false);
      else {
        setDockTab("lecture");
        showDock(true);
      }
      return dockOpen && dockTab === "lecture";
    },
    isLectureOn: () => dockOpen && dockTab === "lecture",
    toggleTimeline: () => {
      if (dockOpen && dockTab === "timeline") {
        timelineDismissed = true;
        showDock(false);
        return false;
      }
      return openTimeline("explicit");
    },
    isTimelineOn: () => dockOpen && dockTab === "timeline",
    setColorViewMode,
    getColorViewMode: () => colorViewMode,
    newComment: () => {
      startCommentPlacement();
    },
    toggleComments: () => {
      const next = !commentsMarkupVisible;
      setCommentsMarkupVisible(next);
      if (next) focusRightTab("comments");
      return commentsMarkupVisible;
    },
    isCommentsOn: () => commentsMarkupVisible,
    resolveSlideComments: () => {
      const open = (pres.comments ?? []).filter(
        (c) => c.slideIndex === index && !c.resolved,
      ).length;
      if (!open) return;
      stack.execute(new ResolveSlideCommentsCmd(index, true));
      commentsPanel?.refresh();
      commentPins?.refresh();
    },
    hasOpenSlideComments: () =>
      (pres.comments ?? []).some((c) => c.slideIndex === index && !c.resolved),
    reopenSlideComments: () => {
      const resolved = (pres.comments ?? []).filter(
        (c) => c.slideIndex === index && c.resolved,
      ).length;
      if (!resolved) return;
      stack.execute(new ResolveSlideCommentsCmd(index, false));
      commentsPanel?.refresh();
      commentPins?.refresh();
    },
    hasResolvedSlideComments: () =>
      (pres.comments ?? []).some((c) => c.slideIndex === index && c.resolved),
    checkAccessibility: () => {
      openAccessibilityDialog(
        host.ownerDocument,
        pres,
        (idx, shapeId) => {
          goto(idx);
          if (shapeId) selection.set([shapeId]);
        },
        (issue) => {
          if (issue.kind !== "contrast" || !issue.shapeId || !issue.suggestedColor) return;
          stack.execute(
            new SetTextStyleCmd(issue.slideIndex, issue.shapeId, { color: issue.suggestedColor }),
          );
          if (issue.slideIndex === index) drawSlide(index);
        },
        (issues) => {
          const cmds = issues.map(
            (issue) =>
              new SetTextStyleCmd(issue.slideIndex, issue.shapeId!, { color: issue.suggestedColor! }),
          );
          if (!cmds.length) return;
          if (cmds.length === 1) stack.execute(cmds[0]!);
          else stack.execute(new BatchCmd("Fix accessibility contrast", cmds));
          drawSlide(index);
        },
        (issue, descr) => {
          if (!issue.shapeId) return;
          stack.execute(new SetImageDescrCmd(issue.slideIndex, issue.shapeId, descr));
          if (issue.slideIndex === index) drawSlide(index);
        },
      );
    },
    toggleSpelling,
    isSpellingOn: () => spellingEnabled,
    openThesaurus,
    openSmartLookup,
    openTranslate,
    openProofingLanguage,
    openCompare,
    openProtect,
    isProtected,
    openHelp,
    openFeedback,
    openTraining,
    openEditorTour: opts.openEditorTour,
    setInkMode: (mode) => {
      if (mode) cancelCommentPlacement();
      inkMode = mode;
      inkOverlay?.setMode(mode);
      if (mode === "pen" || mode === "highlighter") applyInkToolStyle(mode);
      if (mode) selection.clear();
      toolbar.refresh();
    },
    getInkMode: () => inkMode,
    setInkPenColor: (color) => {
      inkPenColor = color;
      if (inkMode === "highlighter") inkToolStyle.highlighter.color = color;
      else inkToolStyle.pen.color = color;
      inkOverlay?.setPenColor(color);
    },
    getInkPenColor: () => inkPenColor,
    setInkPenWidth: (width) => {
      inkPenWidth = width;
      if (inkMode === "highlighter") inkToolStyle.highlighter.width = width;
      else inkToolStyle.pen.width = width;
      inkOverlay?.setPenWidth(width);
    },
    getInkPenWidth: () => inkPenWidth,
    clearInkOnSlide,
    convertInkToShape,
    convertInkToText,
    setPresentationView: applyPresentationView,
    getPresentationView: () => presentationView,
    togglePropertiesPanel,
    isPropertiesPanelOpen: () => rightPanelOpen,
    toggleTimelinePanel: toggleDockPanel,
    isTimelinePanelOpen: () => dockOpen,
    toggleSnapGrid: () => {
      snapToGrid = !snapToGrid;
      persistViewGuides();
      return snapToGrid;
    },
    isSnapGridOn: () => snapToGrid,
    toggleSnapShapes: () => {
      snapToShapes = !snapToShapes;
      persistViewGuides();
      return snapToShapes;
    },
    isSnapShapesOn: () => snapToShapes,
    groupSelection,
    ungroupSelection,
    alignSelection,
    distributeSelection,
    flipSelection,
    rotateSelection,
    lockSelection,
    unlockSelection,
    selectionCount: () => [...selection.values].filter((id) => id !== BACKGROUND_SEL_ID).length,
    isSelectionLocked,
    isSelectionGroup,
    setSelectionFill,
    setSelectionStroke,
    setSelectionStrokeWidth,
    setSelectionStrokeDash,
    setSelectionLineArrows,
    getSelectionFill,
    getSelectionStroke,
    getSelectionLineArrows,
    selectionHasLine,
    listFillGradientPresets: () =>
      FILL_GRADIENT_PRESETS.map((p) => ({
        id: p.id,
        label: t(p.labelKey),
        preview: p.preview,
      })),
    applyFillGradientPreset,
    listShapeEffectPresets: () =>
      SHAPE_EFFECT_PRESETS.map((p) => ({
        id: p.id,
        label: t(p.labelKey),
        swatch: p.swatch,
      })),
    applyShapeEffectPreset,
    bringForward: () => reorderSelection("forward"),
    sendBackward: () => reorderSelection("backward"),
    bringFront: () => reorderSelection("front"),
    sendBack: () => reorderSelection("back"),
    undo: () => stack.undo(),
    redo: () => stack.redo(),
    canUndo: () => stack.info().canUndo,
    canRedo: () => stack.info().canRedo,
    listHistory: () => stack.history(t("ribbon.history.origin")),
    jumpToHistory: (mark) => {
      stack.jumpTo(mark);
    },
    duplicate: () => duplicateSelection(),
    remove: removeSelected,
    toggleFormatPainter: activateFormatPainter,
    isFormatPainterOn: () => formatPainter.snapshot !== null,
    previewTransition: previewTransitionOnStage,
    applyTransitionToAll,
    applyQuickTransition,
    getCurrentTransition: getCurrentTransitionForRibbon,
    focusTransitionsPanel: () => focusRightTab("transitions"),
    focusLayersPanel: () => focusRightTab("layers"),
    openAnimationPicker: () => {
      focusRightTab("animations");
      animPanel?.openAddPicker();
      openTimeline("animation");
    },
    focusAnimationsPanel: () => {
      focusRightTab("animations");
      openTimeline("animation");
    },
    toggleAnimationPainter: activateAnimationPainter,
    isAnimationPainterOn: () => animationPainter.sourceId !== null,
    openFindReplace: () => openFindReplace("find"),
    openReplace: () => openFindReplace("replace"),
    openCustomShow: opts.openCustomShow,
    openNewWindow: opts.openNewWindow,
    closeAllAuxWindows: opts.closeAllAuxWindows,
    focusAuxWindow: opts.focusAuxWindow,
    arrangeAllWindows: opts.arrangeAllWindows,
    arrangeSideBySideWindows: opts.arrangeSideBySideWindows,
    arrangeStackedWindows: opts.arrangeStackedWindows,
    cascadeWindows: opts.cascadeWindows,
    startRehearseTimings: opts.startRehearseTimings,
    startRecordSlideShowFromBeginning: opts.startRecordSlideShowFromBeginning,
    startRecordSlideShowFromCurrent: opts.startRecordSlideShowFromCurrent,
    openSetupSlideShow:
      opts.openSetupSlideShow ??
      (opts.getSlideshowSetup && opts.onSlideshowSetupChange
        ? () => {
            openSetupSlideShowDialog(host.ownerDocument, opts.getSlideshowSetup!(), (next) => {
              windowedMode = next.windowed;
              slideshowLoop = next.loop;
              presenterMode = next.presenter;
              slideshowUseTimings = next.useTimings;
              slideshowPlayNarrations = next.playNarrations;
              commitShowPropertiesFromLocals(next.showMediaControls);
              const ui = showPropertiesToUi(pres.showPr);
              opts.onSlideshowSetupChange!({
                loop: ui.loop,
                windowed: ui.windowed,
                presenter: presenterMode,
                useTimings: ui.useTimings,
                playNarrations: ui.playNarrations,
                showMediaControls: ui.showMediaControls,
              });
              if (opts.onWindowedModeChange) {
                opts.onWindowedModeChange(windowedMode);
              }
              if (opts.onSlideshowLoopChange) {
                opts.onSlideshowLoopChange(slideshowLoop);
              }
              if (opts.onPresenterModeChange) {
                opts.onPresenterModeChange(presenterMode);
              }
              if (opts.onSlideshowUseTimingsChange) {
                opts.onSlideshowUseTimingsChange(slideshowUseTimings);
              }
              if (opts.onSlideshowPlayNarrationsChange) {
                opts.onSlideshowPlayNarrationsChange(slideshowPlayNarrations);
              }
              toolbar.refresh();
            });
          }
        : undefined),
    cut: cutSelection,
    copy: copySelection,
    paste: () => {
      pasteClipboard();
      drawSlide(index);
      toolbar.refresh();
    },
    openPasteSpecial,
    canPaste: () => clipboard.length > 0,
    applyChangeCase: applyChangeCaseToSelection,
    openLayoutPicker,
    resetSlideLayout,
    addSection: addSectionAtCurrent,
    listQuickStyles: () =>
      QUICK_STYLE_PRESETS.map((p) => ({
        id: p.id,
        label: t(p.labelKey),
        preview: p.fill.kind === "none" ? "outline" : "fill",
        color:
          p.fill.kind === "solid"
            ? p.fill.color
            : p.stroke?.paint?.kind === "solid"
              ? p.stroke.paint.color
              : "#64748b",
      })),
    applyQuickStyle: applyQuickStyleToSelection,
    toggleTextShadow: toggleTextShadowOnSelection,
    isTextShadowOn: isTextShadowOnSelection,
    listThemeVariants: () => {
      const colors = pres.theme?.colors;
      if (!colors) return [];
      return THEME_VARIANT_OPTIONS.map((v) => ({
        id: v.id,
        label: t(v.labelKey),
        swatch: variantPreviewSwatch(colors, v.id),
      }));
    },
    applyThemeVariant: applyThemeVariantToDeck,
    applyTextStyle: applyTextStyleToSelection,
    applyAlign: applyAlignToSelection,
    applyParagraphSpacing: applyParagraphSpacingToSelection,
    getCurrentParagraph: firstSelectedParagraph,
    clearTextFormatting: clearTextFormattingOnSelection,
    adjustIndent: adjustIndentOnSelection,
    getCurrentTextRun: firstSelectedTextRun,
    setParagraphBullet: applyBulletToSelection,
    setParagraphRtl: applyRtlToSelection,
    setTextOrientation: applyTextOrientationToSelection,
    getTextOrientation: getSelectionTextVert,
    setTextRowOrder: applyRowOrderToSelection,
    getTextRowOrderRtl: getSelectionRowOrderRtl,
    setCjkTypography: applyCjkToSelection,
    setTextVAlign: applyVAlignToSelection,
    setTextColumns: applyColumnsToSelection,
    getTextColumns: getSelectionColumns,
    close: opts.onRequestClose,
  });
  if (opts.ribbonHost) {
    opts.ribbonHost.appendChild(toolbar.el);
    toolbar.el.style.width = "100%";
  } else {
    toolbar.el.style.gridRow = "1";
    toolbar.el.style.gridColumn = "1 / -1";
    root.insertBefore(toolbar.el, stageHost);
  }
  if (opts.viewBarHost) {
    opts.viewBarHost.appendChild(toolbar.viewBar);
  } else {
    toolbar.viewBar.style.gridRow = String(viewGridRow);
    toolbar.viewBar.style.gridColumn = "1 / -1";
    root.insertBefore(toolbar.viewBar, stageHost);
  }
  toolbar.commandBar.style.gridRow = String(commandGridRow);
  toolbar.commandBar.style.gridColumn = "1";
  root.appendChild(toolbar.commandBar);
  toolbar.fitCommandStrip();
  host.ownerDocument.defaultView?.requestAnimationFrame(() => toolbar.fitCommandStrip());
  statusBar.prepend(toolbar.statusStart);
  statusBar.append(toolbar.statusEnd);
  refreshZoomChrome = () => toolbar.refreshZoom();
  let ribbonSelRaf = 0;
  const unsubRibbonSel = selection.subscribe(() => {
    const win = host.ownerDocument.defaultView;
    if (!win?.requestAnimationFrame) {
      toolbar.refresh();
      return;
    }
    if (ribbonSelRaf) return;
    ribbonSelRaf = win.requestAnimationFrame(() => {
      ribbonSelRaf = 0;
      toolbar.refresh();
    });
  });
  const unsubRibbonStack = stack.subscribe(() => toolbar.refresh());
  onSlideChangeHooks.push(() => toolbar.refresh());
  refreshRibbonToggles = () => toolbar.refresh();

  drawSlide(index);
  editorPlugins?.notifySlideChange();
  editorPlugins?.notifySelectionChange();
  root.focus();
  if (isPresentationEditingBlocked(pres)) {
    showToast(t("protect.openedHint"));
  }

  // 协作命令 apply / revert 后刷新舞台与各面板（与本地 execute 后的刷新范围一致）。
  const refreshAfterRemote = (): void => {
    drawSlide(index);
    syncNotesPane();
    selectionPane.refresh();
    commentsPanel?.refresh();
    commentPins?.refresh();
    animPanel?.refresh();
    animTimeline?.refresh();
    transitionPanel?.refresh();
    altView?.refresh();
    toolbar.refresh();
  };

  return {
    destroy(): void {
      try {
        commitLivePreview();
      } catch {
        // 保护态下预览不落库，模型已还原。
      }
      // 退出编辑器前先把未提交的备注落库，避免最后一次编辑丢失。
      commitNotes();
      // 先恢复用户显式设置的 opacity=0（这些不是入场动画引起的隐藏），
      // 再按"当前 timing"重算 entrance hide：保证用户在编辑器里 add / remove 的
      // entrance 动画在退出编辑器后都能正确表现（addressing "添加的动画 播放时无效"）。
      for (const [s, v] of userOpacityZero) s.opacity = v;
      for (const slide of pres.slides) {
        const fresh = computeInitialEntranceState(slide);
        applyInitialEntranceState(slide, fresh);
      }
      // 关闭任何遗留的「放映插件选择」popover —— 它被挂在 doc.body 上而不是 root
      // 内，因此 root.remove() 不会自动连带清掉。
      host.ownerDocument
        .querySelectorAll<HTMLElement>("[data-ppt-playback-plugins]")
        .forEach((n) => n.remove());
      stageWrap.removeEventListener("scroll", onFormatBarScroll);
      formatBar.destroy();
      aiBox?.destroy();
      if (toastTimer !== undefined) {
        host.ownerDocument.defaultView?.clearTimeout(toastTimer);
        toastTimer = undefined;
      }
      toastEl.remove();
      editorPlugins?.destroy();
      editorPlugins = null;
      findReplaceHandle?.close();
      cancelFormatPainter();
      cancelAnimationPainter();
      unsubRibbonSel();
      unsubRibbonStack();
      host.ownerDocument.removeEventListener("keydown", onDocKey);
      unsubInspectorHistory();
      inspector.destroy();
      selectionPane.destroy();
      animPanel?.destroy();
      animTimeline?.destroy();
      lecturePanel?.destroy();
      transitionPanel?.destroy();
      devPanel?.destroy();
      unobserveDevMode();
      inkOverlay?.destroy();
      void disposePaddleOcr();
      void disposeInkOcrWorker();
      commentPins.destroy();
      toolbar.destroy();
      toolbar.el.remove();
      toolbar.viewBar.remove();
      teardown();
      ro.disconnect();
      root.remove();
    },
    selection,
    stack,
    execute(cmd: EditCommand): void {
      stack.execute(cmd);
    },
    undo(): boolean {
      return stack.undo();
    },
    redo(): boolean {
      return stack.redo();
    },
    current(): number {
      return index;
    },
    goto,
    redraw(): void {
      drawSlide(index);
    },
    setHostStatus,
    startTextEdit,
    insertShape,
    insertImage,
    insertMediaFiles,
    insertAudio,
    duplicateSelection,
    reorderSelection,
    setZoom,
    toggleGrid,
    setAiPickMode,
    getAiPickMode: () => aiPickMode,
    getSelectedPlaybackPlugins: () => playbackPluginIdsInOrder(),
    setSelectedPlaybackPlugins: (ids) => {
      selectedPlaybackPlugins.clear();
      for (const id of ids) selectedPlaybackPlugins.add(id);
    },
    setImportedPluginCatalog: (extras, playback) => {
      const prevRev = new Map(editorPluginExtras.map((e) => [e.id, e.sourceRevision ?? 0]));
      editorPluginExtras = extras;
      rebuildEditorPluginCatalog();
      const valid = new Set(editorPluginCatalog.map((e) => e.id));
      let editorChanged = false;
      for (const id of [...enabledEditorPlugins]) {
        if (!valid.has(id)) {
          enabledEditorPlugins.delete(id);
          editorPlugins?.unregister(id);
          editorChanged = true;
        }
      }
      for (const extra of extras) {
        if (!enabledEditorPlugins.has(extra.id)) continue;
        const rev = extra.sourceRevision ?? 0;
        const listed = editorPlugins?.list().includes(extra.id) ?? false;
        if (prevRev.get(extra.id) === rev && listed) continue;
        editorPlugins?.unregister(extra.id);
        void editorPlugins?.register(extra.create());
      }
      if (editorChanged) opts.onEditorPluginsChange?.(editorPluginIdsInOrder());

      availablePlaybackPlugins = playback;
      const playbackValid = new Set(playback.map((e) => e.id));
      let playbackChanged = false;
      for (const id of [...selectedPlaybackPlugins]) {
        if (!playbackValid.has(id)) {
          selectedPlaybackPlugins.delete(id);
          playbackChanged = true;
        }
      }
      if (playbackChanged) opts.onPlaybackPluginsChange?.(playbackPluginIdsInOrder());
      toolbar.refresh();
    },
    setEditorContext(ctx: EditorContext | undefined): void {
      commitNotes();
      editorContext = ctx ?? { kind: "slides" };
      // master 视图切换时清空选区 + 重绘 stage（stage 把 master/layout shapes 作为伪 slide 渲染）。
      selection.clear();
      drawSlide(index);
      syncNotesPane();
    },
    getEditorContext(): EditorContext {
      return editorContext;
    },
    focusComments(slideIdx?: number): void {
      if (slideIdx !== undefined && slideIdx !== index) goto(slideIdx);
      focusRightTab("comments");
      commentsPanel?.refresh();
      commentPins?.refresh();
      const here = (pres.comments ?? []).filter(
        (c) => c.slideIndex === (slideIdx ?? index) && !c.resolved,
      );
      const pick = here[0] ?? (pres.comments ?? []).find((c) => c.slideIndex === (slideIdx ?? index));
      if (pick) focusComment(pick.id);
    },
    syncPresentation(next: Presentation, slideIndex?: number): void {
      flushNotesCommit?.();
      pres = next;
      stack.replacePresentation(next);
      selection.clear();
      cancelFormatPainter();
      cancelAnimationPainter();
      findReplaceHandle?.close();
      forceVisibleForEdit(pres);
      for (const slide of pres.slides) {
        slide.initialParaOverrides = undefined;
        slide.initialCharOverrides = undefined;
      }
      if (slideIndex !== undefined) {
        index = Math.max(0, Math.min(slideIndex, Math.max(0, pres.slides.length - 1)));
      } else {
        index = Math.max(0, Math.min(index, Math.max(0, pres.slides.length - 1)));
      }
      hydrateViewGuides();
      drawSlide(index);
      syncNotesPane();
      selectionPane.refresh();
      commentsPanel?.refresh();
      commentPins?.refresh();
      animPanel?.refresh();
      animTimeline?.refresh();
      transitionPanel?.refresh();
      altView?.refresh();
      toolbar.refresh();
      editorPlugins?.notifyPresentationChange();
    },
    applyRemoteCommand(cmd: EditCommand): void {
      if (!canApplyEditCommand(pres, cmd)) return;
      stack.applyExternal(cmd, "apply");
      refreshAfterRemote();
    },
    revertRemoteCommand(cmd: EditCommand): void {
      if (!canApplyEditCommand(pres, cmd)) return;
      stack.applyExternal(cmd, "revert");
      refreshAfterRemote();
    },
    plugins: {
      register: (plugin) => editorPlugins!.register(plugin),
      unregister: (id) => editorPlugins?.unregister(id),
      list: () => editorPlugins?.list() ?? [],
    },
  };
}


let _shapeCounter = 0;
// 必须始终以 `sp_` 开头：OOXML timing 在 spTgt.spid 中存的就是去掉 `sp_` 后
// 的部分，runtime 反向解析时统一用 `sp_${spid}` 找 SceneNode（见
// packages/player/src/ooxml-runtime.ts 与 packages/core/src/initial-anim-state.ts）。
// 编辑器新建的 shape 必须遵守同一约定，否则用户给新形状加入场效后，
// 动画 target 解析失败 → 播放时看不到任何动画。
function genShapeId(prefix = "edit"): string {
  return `sp_${prefix}_${Date.now().toString(36)}_${(_shapeCounter++).toString(36)}`;
}

// 旧版 7 种内置形状的友好名（兼容现有 toolbar 快捷按钮）。新预设的 name 直接
// 使用 shape-library 中的 fallback 字段（OOXML preset id）。
const SHAPE_NAMES: Record<string, string> = {
  rect: "Rectangle",
  ellipse: "Ellipse",
  text: "Text",
  triangle: "Triangle",
  star: "Star",
  arrow: "Arrow",
  line: "Line",
};

// 默认配色：与旧版按 kind 区分一致；预设形状走 ShapeLibrary 时统一用蓝色。
const DEFAULT_FILL = { kind: "solid" as const, color: "#3b82f6" };
const DEFAULT_STROKE = { paint: { kind: "solid" as const, color: "#1e3a8a" }, width: 1 };

function makeShape(kind: InsertShapeKind, bbox: Rect): Shape {
  const base = {
    id: genShapeId(),
    name: SHAPE_NAMES[kind] ?? (SHAPE_BY_ID[kind]?.fallback ?? kind),
    zIndex: 0,
    visible: true,
    locked: false,
    opacity: 1,
    bbox,
    transform: { tx: 0, ty: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0 },
    styleRefs: officeInsertStyleRefs(kind === "text" ? "text" : kind === "line" || kind === "arrow" ? "line" : "shape"),
  };
  // 1) 旧版固定 7 种 —— 直接走原有快捷分支（行为不变，避免回归）。
  switch (kind) {
    case "rect":
      return { ...base, kind: "rect", fill: DEFAULT_FILL, stroke: DEFAULT_STROKE } as Shape;
    case "ellipse":
      return {
        ...base,
        kind: "ellipse",
        fill: { kind: "solid", color: "#10b981" },
        stroke: { paint: { kind: "solid", color: "#064e3b" }, width: 1 },
      } as Shape;
    case "triangle":
      return createShapeFromPreset("triangle", bbox, {
        id: base.id,
        name: base.name,
      });
    case "star":
      return createShapeFromPreset("star", bbox, {
        id: base.id,
        name: base.name,
      });
    case "line":
      return {
        ...base,
        kind: "line",
        x1: bbox.x,
        y1: bbox.y + bbox.h / 2,
        x2: bbox.x + bbox.w,
        y2: bbox.y + bbox.h / 2,
        stroke: { paint: { kind: "solid", color: "#111827" }, width: 2 },
      } as Shape;
    case "arrow":
      return {
        ...base,
        kind: "line",
        x1: bbox.x,
        y1: bbox.y + bbox.h / 2,
        x2: bbox.x + bbox.w,
        y2: bbox.y + bbox.h / 2,
        stroke: {
          paint: { kind: "solid", color: "#111827" },
          width: 2,
          tailEnd: { kind: "triangle", w: "med", len: "med" },
        },
      } as Shape;
    case "text":
      return {
        ...base,
        kind: "text",
        paragraphs: [
          {
            align: "start",
            runs: [{ text: "Text", fontFamily: "sans-serif", fontSize: 24, color: "#111827" }],
          },
        ],
        wrap: true,
      } as Shape;
  }
  // 2) 通用分支：从 shape-library 解析。
  const entry = SHAPE_BY_ID[kind];
  if (entry) {
    return createShapeFromPreset(kind, bbox, {
      id: base.id,
      name: base.name,
      fill: DEFAULT_FILL,
      stroke: DEFAULT_STROKE,
    });
  }
  // 3) 兜底：未识别 kind → 普通 rect（避免 throw 中断 UI）。
  return { ...base, kind: "rect", fill: DEFAULT_FILL, stroke: DEFAULT_STROKE } as Shape;
}

// 根据 PathShape.presetType 重新计算 d。在 commands.ts / editor.ts 拖动 / resize
// 流程中调用，确保 path 形状跟随 bbox 同步更新几何。
// 入参签名故意保留 presetType?: string —— 这样调用点不必每次预先 narrow，
// 函数体内部已自带 early-return 防御。
function regeneratePathShape(s: { bbox: Rect; presetType?: string; presetAdj?: Record<string, number>; d: string; fillRule?: "nonzero" | "evenodd" }): void {
  if (!s.presetType) return;
  if (applyOfficialPresetGeometry(s)) return;
  const entry = SHAPE_BY_ID[s.presetType];
  if (!entry) return;
  const g = entry.geom(s.bbox);
  if (g.kind === "path") {
    s.d = g.d;
    if (g.fillRule) s.fillRule = g.fillRule;
  }
}

// 在模块加载时把 regenerator 注册到 commands —— commands.ts 不直接 import
// shape-library（避免反向依赖）。注意：这是模块级副作用，但因为 editor.ts
// 仅在主 bundle 入口被 import 一次，整体仍是 idempotent。
registerPathPresetRegenerator(regeneratePathShape);

function liveFollowGlue(slide: Slide, targets: Shape[], reattachSelf = false): void {
  for (const t of targets) {
    if (reattachSelf) {
      const self = reattachConnectorGlue(slide, t);
      if (self) regeneratePathShape(self);
    }
    for (const p of followGlueToSites(slide, t)) regeneratePathShape(p);
  }
}

function cloneShape(s: Shape, freshId = false): Shape {
  const copy = JSON.parse(JSON.stringify(s)) as Shape;
  if (freshId) reassignIds(copy);
  return copy;
}

function reassignIds(s: Shape): void {
  s.id = genShapeId("dup");
  if (s.kind === "group") {
    for (const c of s.children) reassignIds(c);
  }
}

function offsetShape(s: Shape, dx: number, dy: number): void {
  s.bbox = { ...s.bbox, x: s.bbox.x + dx, y: s.bbox.y + dy };
  if (s.kind === "line") {
    s.x1 += dx;
    s.y1 += dy;
    s.x2 += dx;
    s.y2 += dy;
  }
  if (s.kind === "polygon") {
    s.points = s.points.map((p) => [p[0] + dx, p[1] + dy] as [number, number]);
  }
  if (s.kind === "path") {
    if (s.presetType) regeneratePathShape(s);
    else s.d = translatePathD(s.d, dx, dy);
  }
  if (s.kind === "group") {
    for (const c of s.children) offsetShape(c, dx, dy);
  }
}

// 编辑模式下，把 renderer 生成的 video / audio / iframe 改造成"可选可拖"：
//   - <video controls> 会自带播放控件、点击会被它吃掉（pointer 事件不冒泡到 stage），
//     于是舞台的 pointerdown 不会触发 → hitTest 也跑不到 → 选不中也拖不动。
//     编辑模式下根本不需要播放控件，直接禁用 controls 并 pointer-events:none。
//   - <audio> 在 renderer 里 display:none，编辑器里完全没有视觉占位，用户既看不到也
//     找不到要点哪。这里给每个 audio shape 渲染一个 SVG speaker 占位（覆盖在 bbox 内），
//     和 PowerPoint 桌面端的小喇叭图标语义对齐。pointer-events:none，让 stage 接管命中。
//   - web 嵌入的 <iframe> 更严重：跨域内容（YouTube / Vimeo / 任意 HTTPS）的点击
//     发生在子文档里，父页面根本收不到事件；svg-backend 上的 stopPropagation 也拦不住。
//     放映 / HTML 导出仍要能点进 iframe，所以只在编辑器关掉 pointer-events。
function adaptMediaForEditor(stage: HTMLElement, slide: Slide): void {
  const videos = stage.querySelectorAll<HTMLVideoElement>("video");
  videos.forEach((v) => {
    v.controls = false;
    v.style.pointerEvents = "none";
  });
  const audios = stage.querySelectorAll<HTMLAudioElement>("audio");
  audios.forEach((a) => {
    a.style.pointerEvents = "none";
  });
  const iframes = stage.querySelectorAll<HTMLIFrameElement>("iframe");
  iframes.forEach((iframe) => {
    iframe.style.pointerEvents = "none";
  });
  // 给所有 audio shape 添加 placeholder。先收集所有 audio shapes（含嵌套 group 内的）。
  const audioShapes: Shape[] = [];
  const collect = (s: Shape): void => {
    if (s.kind === "audio") audioShapes.push(s);
    if (s.kind === "group") for (const c of s.children) collect(c);
  };
  for (const layer of slide.layers) for (const s of layer.shapes) collect(s);
  for (const s of audioShapes) {
    appendMediaPlaceholderSvg(containerForShape(stage, s), s.bbox, "audio");
  }
  const videoShapes: Shape[] = [];
  const collectVideo = (s: Shape): void => {
    if (s.kind === "video" && !s.poster) videoShapes.push(s);
    if (s.kind === "group") for (const c of s.children) collectVideo(c);
  };
  for (const layer of slide.layers) for (const s of layer.shapes) collectVideo(s);
  for (const s of videoShapes) {
    appendMediaPlaceholderSvg(containerForShape(stage, s), s.bbox, "video");
  }
}

function containerForShape(stage: HTMLElement, s: Shape): SVGGElement | null {
  return stage.querySelector<SVGGElement>(`g[data-id="${CSS.escape(s.id)}"]`);
}

function appendMediaPlaceholderSvg(
  container: SVGGElement | null,
  b: { x: number; y: number; w: number; h: number },
  kind: "audio" | "video",
): void {
  if (!container) return;
  const tag = kind === "audio" ? "ppt-audio-placeholder" : "ppt-video-placeholder";
  container.querySelectorAll(`[data-${tag}]`).forEach((n) => n.remove());
  const NS = "http://www.w3.org/2000/svg";
  const g = document.createElementNS(NS, "g");
  g.dataset[kind === "audio" ? "pptAudioPlaceholder" : "pptVideoPlaceholder"] = "1";
  g.style.pointerEvents = "none";
  const bg = document.createElementNS(NS, "rect");
  bg.setAttribute("x", String(b.x));
  bg.setAttribute("y", String(b.y));
  bg.setAttribute("width", String(b.w));
  bg.setAttribute("height", String(b.h));
  bg.setAttribute("rx", String(Math.min(b.w, b.h) * 0.12));
  bg.setAttribute("fill", "#f3f4f6");
  bg.setAttribute("stroke", "#9ca3af");
  bg.setAttribute("stroke-dasharray", "4 3");
  bg.setAttribute("stroke-width", "1");
  g.appendChild(bg);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const r = Math.min(b.w, b.h) * 0.22;
  if (kind === "audio") {
    const speaker = document.createElementNS(NS, "path");
    const d =
      `M ${cx - r} ${cy - r * 0.45}` +
      ` L ${cx - r * 0.25} ${cy - r * 0.45}` +
      ` L ${cx + r * 0.35} ${cy - r}` +
      ` L ${cx + r * 0.35} ${cy + r}` +
      ` L ${cx - r * 0.25} ${cy + r * 0.45}` +
      ` L ${cx - r} ${cy + r * 0.45} Z`;
    speaker.setAttribute("d", d);
    speaker.setAttribute("fill", "#9ca3af");
    g.appendChild(speaker);
    for (let i = 1; i <= 2; i++) {
      const arc = document.createElementNS(NS, "path");
      const rArc = r * (0.5 + i * 0.3);
      const ax = cx + r * 0.5;
      arc.setAttribute("d", `M ${ax} ${cy - rArc * 0.7} A ${rArc} ${rArc} 0 0 1 ${ax} ${cy + rArc * 0.7}`);
      arc.setAttribute("stroke", "#9ca3af");
      arc.setAttribute("stroke-width", String(Math.max(1, r * 0.12)));
      arc.setAttribute("fill", "none");
      arc.setAttribute("stroke-linecap", "round");
      g.appendChild(arc);
    }
  } else {
    const disc = document.createElementNS(NS, "circle");
    disc.setAttribute("cx", String(cx));
    disc.setAttribute("cy", String(cy));
    disc.setAttribute("r", String(r * 1.1));
    disc.setAttribute("fill", "#9ca3af");
    g.appendChild(disc);
    const tri = document.createElementNS(NS, "polygon");
    const t = r * 0.55;
    tri.setAttribute(
      "points",
      `${cx - t * 0.35},${cy - t} ${cx + t},${cy} ${cx - t * 0.35},${cy + t}`,
    );
    tri.setAttribute("fill", "#f3f4f6");
    g.appendChild(tri);
  }
  container.insertBefore(g, container.firstChild);
}

function pickTextShape(s: Shape): Shape | undefined {
  if (s.kind === "text") return s;
  if (s.kind === "group") {
    for (const c of s.children) if (c.kind === "text") return c;
  }
  return undefined;
}

function dashPresetToArr(preset: StrokeDashPreset): number[] | undefined {
  switch (preset) {
    case "solid":
      return undefined;
    case "dot":
    case "sysDot":
      return [1, 2];
    case "dash":
    case "sysDash":
      return [4, 3];
    case "lgDash":
      return [8, 3];
    case "dashDot":
    case "sysDashDot":
      return [4, 3, 1, 3];
    case "lgDashDot":
      return [8, 3, 1, 3];
    case "lgDashDotDot":
      return [8, 3, 1, 3, 1, 3];
    case "sysDashDotDot":
      return [4, 3, 1, 3, 1, 3];
    default:
      return undefined;
  }
}

// 与 inspector.ts / commands.ts pickStyleTarget 同义：选取拥有 fill / stroke 的"基底"shape。
// group 优先 *_base 子节点（pptx 中 shape group 内有专门的描边/填充载体），否则取首个子节点。
function pickFirstStyleShape(s: Shape): Shape | undefined {
  if (s.kind === "group") {
    for (const c of s.children) if (c.id.endsWith("_base")) return c;
    return s.children[0];
  }
  return s;
}

function hitWalk(s: Shape, x: number, y: number): string | undefined {
  // 子 bbox 是 slide 绝对坐标，但画面位置还要乘上本节点（及祖先，由递归完成）
  // 的 rotation/flip。命中测试先把点击点逆变换回本节点的未旋转空间。
  const p = inverseNodeTransform(s, x, y);
  if (s.kind === "group") {
    for (let i = s.children.length - 1; i >= 0; i--) {
      const id = hitWalk(s.children[i]!, p.x, p.y);
      if (id) return s.id;
    }
    return undefined;
  }
  const b = s.bbox;
  if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return s.id;
  return undefined;
}

// 命中测试 group 内深度遍历，返回点击位置上的第一个可编辑 text 叶节点 id。
// 用于 dblclick：在 group（如表格）内双击具体子文本框时，跳过"返回 group id"
// 的兜底逻辑，直接进入该子节点的文本编辑。
function hitLeafTextId(g: Shape & { kind: "group" }, x: number, y: number): string | null {
  const p = inverseNodeTransform(g, x, y);
  // 倒序：上层 child 优先（更接近 PowerPoint 的 z-order 行为）。
  for (let i = g.children.length - 1; i >= 0; i--) {
    const c = g.children[i]!;
    if (c.kind === "group") {
      const inner = hitLeafTextId(c, p.x, p.y);
      if (inner) return inner;
      continue;
    }
    if (c.kind !== "text") continue;
    if (c.cellMeta?.hidden) continue;
    const q = inverseNodeTransform(c, p.x, p.y);
    const b = c.bbox;
    if (q.x >= b.x && q.x <= b.x + b.w && q.y >= b.y && q.y <= b.y + b.h) return c.id;
  }
  return null;
}

// 背景选中框：覆盖整页的虚线矩形，无 resize / rotate 手柄（背景不能拖动 / 缩放）。
function drawBackgroundFrame(doc: Document, svg: SVGSVGElement, w: number, h: number, pxToSlide: number): void {
  const NS = "http://www.w3.org/2000/svg";
  const inset = 1 * pxToSlide;
  const rect = doc.createElementNS(NS, "rect");
  rect.setAttribute("x", String(inset));
  rect.setAttribute("y", String(inset));
  rect.setAttribute("width", String(Math.max(0, w - inset * 2)));
  rect.setAttribute("height", String(Math.max(0, h - inset * 2)));
  rect.setAttribute("fill", "none");
  rect.setAttribute("stroke", "#3b82f6");
  rect.setAttribute("stroke-width", String(FRAME_STROKE_SCREEN_PX));
  rect.setAttribute("stroke-dasharray", "6 4");
  rect.setAttribute("vector-effect", "non-scaling-stroke");
  rect.style.pointerEvents = "none";
  svg.appendChild(rect);
}

function drawCropChrome(
  doc: Document,
  svg: SVGSVGElement,
  shape: Shape,
  pxToSlide: number,
  ancestors: Shape[] = [],
): void {
  const NS = "http://www.w3.org/2000/svg";
  const world = composeSvgTransforms([...ancestors, shape]);
  const g = doc.createElementNS(NS, "g");
  if (world) g.setAttribute("transform", world);
  svg.appendChild(g);
  const box = shape.bbox;
  const image = imageFrame(box, readCrop(shape));
  const outside =
    `M ${image.x} ${image.y} h ${image.w} v ${image.h} h ${-image.w} Z ` +
    `M ${box.x} ${box.y} h ${box.w} v ${box.h} h ${-box.w} Z`;
  const src = cropPreviewSrc(shape);
  if (src) {
    const cpId = `ppt-crop-${(shape.id || "s").replace(/[^A-Za-z0-9_-]/g, "") || "s"}`;
    const cp = doc.createElementNS(NS, "clipPath");
    cp.setAttribute("id", cpId);
    cp.setAttribute("clipPathUnits", "userSpaceOnUse");
    const hole = doc.createElementNS(NS, "path");
    hole.setAttribute("d", outside);
    hole.setAttribute("clip-rule", "evenodd");
    cp.appendChild(hole);
    g.appendChild(cp);
    const im = doc.createElementNS(NS, "image");
    im.setAttribute("href", src);
    im.setAttributeNS("http://www.w3.org/1999/xlink", "href", src);
    im.setAttribute("x", String(image.x));
    im.setAttribute("y", String(image.y));
    im.setAttribute("width", String(Math.max(1, image.w)));
    im.setAttribute("height", String(Math.max(1, image.h)));
    im.setAttribute("preserveAspectRatio", "none");
    im.setAttribute("clip-path", `url(#${cpId})`);
    im.style.pointerEvents = "none";
    g.appendChild(im);
    const shade = doc.createElementNS(NS, "path");
    shade.setAttribute("d", outside);
    shade.setAttribute("fill", "#000");
    shade.setAttribute("fill-opacity", "0.55");
    shade.setAttribute("fill-rule", "evenodd");
    shade.style.pointerEvents = "none";
    g.appendChild(shade);
  }
  const halo = doc.createElementNS(NS, "rect");
  halo.setAttribute("x", String(box.x));
  halo.setAttribute("y", String(box.y));
  halo.setAttribute("width", String(box.w));
  halo.setAttribute("height", String(box.h));
  halo.setAttribute("fill", "none");
  halo.setAttribute("stroke", "#111827");
  halo.setAttribute("stroke-width", "4");
  halo.setAttribute("vector-effect", "non-scaling-stroke");
  halo.style.pointerEvents = "none";
  g.appendChild(halo);
  const frame = doc.createElementNS(NS, "rect");
  frame.setAttribute("x", String(box.x));
  frame.setAttribute("y", String(box.y));
  frame.setAttribute("width", String(box.w));
  frame.setAttribute("height", String(box.h));
  frame.setAttribute("fill", "none");
  frame.setAttribute("stroke", "#fff");
  frame.setAttribute("stroke-width", "2");
  frame.setAttribute("vector-effect", "non-scaling-stroke");
  frame.style.pointerEvents = "none";
  g.appendChild(frame);
  const corners: Array<[number, number, string]> = [
    [box.x, box.y, "nw"],
    [box.x + box.w / 2, box.y, "n"],
    [box.x + box.w, box.y, "ne"],
    [box.x + box.w, box.y + box.h / 2, "e"],
    [box.x + box.w, box.y + box.h, "se"],
    [box.x + box.w / 2, box.y + box.h, "s"],
    [box.x, box.y + box.h, "sw"],
    [box.x, box.y + box.h / 2, "w"],
  ];
  for (const [cx, cy, name] of corners) {
    appendSquareHandle(doc, g, cx, cy, name, pxToSlide, handleCursor(name));
  }
  const pull = 18 * pxToSlide;
  const pictureCorners: Array<[number, number, string]> = [
    [image.x, image.y, "pic-nw"],
    [image.x + image.w, image.y, "pic-ne"],
    [image.x + image.w, image.y + image.h, "pic-se"],
    [image.x, image.y + image.h, "pic-sw"],
  ];
  for (const [cx, cy, name] of pictureCorners) {
    const ox = cx < image.x + image.w / 2 ? -pull : pull;
    const oy = cy < image.y + image.h / 2 ? -pull : pull;
    appendCropScaleHandle(doc, g, cx + ox, cy + oy, name, pxToSlide, handleCursor(name.slice(4)));
  }
}

function appendCropScaleHandle(
  doc: Document,
  parent: SVGGElement,
  cx: number,
  cy: number,
  name: string,
  pxToSlide: number,
  cursor: string,
): void {
  const NS = "http://www.w3.org/2000/svg";
  const hitR = (HANDLE_HIT_SCREEN_PX / 2) * pxToSlide;
  const visual = (HANDLE_SCREEN_PX * 0.42) * pxToSlide;
  const hit = doc.createElementNS(NS, "circle");
  hit.setAttribute("data-handle", name);
  hit.setAttribute("cx", String(cx));
  hit.setAttribute("cy", String(cy));
  hit.setAttribute("r", String(hitR));
  hit.setAttribute("fill", "transparent");
  hit.style.pointerEvents = "auto";
  hit.style.cursor = cursor;
  parent.appendChild(hit);
  const dot = doc.createElementNS(NS, "circle");
  dot.setAttribute("data-handle", name);
  dot.setAttribute("cx", String(cx));
  dot.setAttribute("cy", String(cy));
  dot.setAttribute("r", String(visual));
  dot.setAttribute("fill", "#fff");
  dot.setAttribute("stroke", "#111827");
  dot.setAttribute("stroke-width", String(FRAME_STROKE_SCREEN_PX));
  dot.setAttribute("vector-effect", "non-scaling-stroke");
  dot.style.pointerEvents = "auto";
  dot.style.cursor = cursor;
  parent.appendChild(dot);
}

function drawShapeSelectionFrame(
  doc: Document,
  svg: SVGSVGElement,
  shape: Shape,
  pxToSlide: number,
  ancestors: Shape[] = [],
): void {
  const world = composeSvgTransforms([...ancestors, shape]);
  if (shape.kind === "line") {
    drawLineSelectionFrame(doc, svg, shape, pxToSlide, world);
  } else if (shape.kind === "polygon") {
    drawPolygonSelectionFrame(doc, svg, shape, pxToSlide, world);
  } else {
    drawSelectionFrame(doc, svg, shape.bbox, pxToSlide, world);
    if (isPathConnector(shape)) {
      const ends = pathConnectorGeomEnds(shape);
      const g = svg.lastElementChild as SVGGElement | null;
      if (g) {
        appendSquareHandle(doc, g, ends.start.x, ends.start.y, "cxn-start", pxToSlide, "crosshair");
        appendSquareHandle(doc, g, ends.end.x, ends.end.y, "cxn-end", pxToSlide, "crosshair");
      }
    }
    if (shape.kind === "path" && shape.presetType && !shape.locks?.noAdjustHandles) {
      drawPresetAdjHandles(doc, svg, shape, pxToSlide, world);
    }
  }
}

function drawLineSelectionFrame(
  doc: Document,
  svg: SVGSVGElement,
  s: Extract<Shape, { kind: "line" }>,
  pxToSlide: number,
  worldTransform = "",
): void {
  const NS = "http://www.w3.org/2000/svg";
  const b = s.bbox;
  const g = doc.createElementNS(NS, "g");
  if (worldTransform) g.setAttribute("transform", worldTransform);
  svg.appendChild(g);

  const seg = doc.createElementNS(NS, "line");
  seg.setAttribute("x1", String(s.x1));
  seg.setAttribute("y1", String(s.y1));
  seg.setAttribute("x2", String(s.x2));
  seg.setAttribute("y2", String(s.y2));
  seg.setAttribute("stroke", "#3b82f6");
  seg.setAttribute("stroke-width", String(FRAME_STROKE_SCREEN_PX));
  seg.setAttribute("stroke-dasharray", "6 4");
  seg.setAttribute("vector-effect", "non-scaling-stroke");
  seg.style.pointerEvents = "none";
  g.appendChild(seg);

  appendSquareHandle(doc, g, s.x1, s.y1, "line-start", pxToSlide, "crosshair");
  appendSquareHandle(doc, g, s.x2, s.y2, "line-end", pxToSlide, "crosshair");
  appendRotateHandle(doc, g, b, pxToSlide);
}

function drawPolygonSelectionFrame(
  doc: Document,
  svg: SVGSVGElement,
  s: Extract<Shape, { kind: "polygon" }>,
  pxToSlide: number,
  worldTransform = "",
): void {
  const NS = "http://www.w3.org/2000/svg";
  const b = s.bbox;
  const g = doc.createElementNS(NS, "g");
  if (worldTransform) g.setAttribute("transform", worldTransform);
  svg.appendChild(g);

  const poly = doc.createElementNS(NS, "polygon");
  poly.setAttribute("points", s.points.map((p) => `${p[0]},${p[1]}`).join(" "));
  poly.setAttribute("fill", "none");
  poly.setAttribute("stroke", "#3b82f6");
  poly.setAttribute("stroke-width", String(FRAME_STROKE_SCREEN_PX));
  poly.setAttribute("stroke-dasharray", "6 4");
  poly.setAttribute("vector-effect", "non-scaling-stroke");
  poly.style.pointerEvents = "none";
  g.appendChild(poly);

  s.points.forEach((p, i) => {
    appendSquareHandle(doc, g, p[0], p[1], `poly-${i}`, pxToSlide, "crosshair");
  });
  appendRotateHandle(doc, g, b, pxToSlide);
}

function drawSelectionFrame(doc: Document, svg: SVGSVGElement, b: Rect, pxToSlide: number, worldTransform = ""): void {
  const NS = "http://www.w3.org/2000/svg";
  // 整体 group + transform：自身 rotation 以及祖先 group 的 rotation/flip
  // （不影响 hit-test，命中走 inverseNodeTransform）。
  const g = doc.createElementNS(NS, "g");
  if (worldTransform) g.setAttribute("transform", worldTransform);
  svg.appendChild(g);

  const rect = doc.createElementNS(NS, "rect");
  rect.setAttribute("x", String(b.x));
  rect.setAttribute("y", String(b.y));
  rect.setAttribute("width", String(b.w));
  rect.setAttribute("height", String(b.h));
  rect.setAttribute("fill", "none");
  rect.setAttribute("stroke", "#3b82f6");
  rect.setAttribute("stroke-width", String(FRAME_STROKE_SCREEN_PX));
  rect.setAttribute("stroke-dasharray", "6 4");
  rect.setAttribute("vector-effect", "non-scaling-stroke");
  rect.style.pointerEvents = "none";
  g.appendChild(rect);
  const corners: Array<[number, number, string]> = [
    [b.x, b.y, "nw"],
    [b.x + b.w / 2, b.y, "n"],
    [b.x + b.w, b.y, "ne"],
    [b.x + b.w, b.y + b.h / 2, "e"],
    [b.x + b.w, b.y + b.h, "se"],
    [b.x + b.w / 2, b.y + b.h, "s"],
    [b.x, b.y + b.h, "sw"],
    [b.x, b.y + b.h / 2, "w"],
  ];
  for (const [cx, cy, name] of corners) {
    appendSquareHandle(doc, g, cx, cy, name, pxToSlide, handleCursor(name));
  }
  appendRotateHandle(doc, g, b, pxToSlide);
}

function drawPresetAdjHandles(
  doc: Document,
  svg: SVGSVGElement,
  s: Extract<Shape, { kind: "path" }>,
  pxToSlide: number,
  worldTransform = "",
): void {
  if (!s.presetType) return;
  const handles = listOfficialAdjustHandles(s.presetType, s.bbox, s.presetAdj ?? {});
  if (!handles.length) return;
  const NS = "http://www.w3.org/2000/svg";
  const g = doc.createElementNS(NS, "g");
  if (worldTransform) g.setAttribute("transform", worldTransform);
  svg.appendChild(g);
  handles.forEach((h, i) => {
    appendAdjHandle(doc, g, h.x, h.y, `adj-${i}`, pxToSlide);
  });
}

function appendAdjHandle(
  doc: Document,
  parent: SVGGElement,
  cx: number,
  cy: number,
  name: string,
  pxToSlide: number,
): void {
  const NS = "http://www.w3.org/2000/svg";
  const visual = (HANDLE_SCREEN_PX * 0.55) * pxToSlide;
  const hitR = (HANDLE_HIT_SCREEN_PX / 2) * pxToSlide;
  const hit = doc.createElementNS(NS, "circle");
  hit.setAttribute("data-handle", name);
  hit.setAttribute("cx", String(cx));
  hit.setAttribute("cy", String(cy));
  hit.setAttribute("r", String(hitR));
  hit.setAttribute("fill", "transparent");
  hit.style.pointerEvents = "auto";
  hit.style.cursor = "pointer";
  parent.appendChild(hit);
  const diamond = doc.createElementNS(NS, "polygon");
  diamond.setAttribute("data-handle", name);
  diamond.setAttribute(
    "points",
    `${cx},${cy - visual} ${cx + visual},${cy} ${cx},${cy + visual} ${cx - visual},${cy}`,
  );
  diamond.setAttribute("fill", "#facc15");
  diamond.setAttribute("stroke", "#ca8a04");
  diamond.setAttribute("stroke-width", String(FRAME_STROKE_SCREEN_PX));
  diamond.setAttribute("vector-effect", "non-scaling-stroke");
  diamond.style.pointerEvents = "auto";
  diamond.style.cursor = "pointer";
  parent.appendChild(diamond);
}

function appendSquareHandle(
  doc: Document,
  parent: SVGGElement,
  cx: number,
  cy: number,
  name: string,
  pxToSlide: number,
  cursor: string,
): void {
  const NS = "http://www.w3.org/2000/svg";
  const visualSize = HANDLE_SCREEN_PX * pxToSlide;
  const hitSize = HANDLE_HIT_SCREEN_PX * pxToSlide;
  const hit = doc.createElementNS(NS, "rect");
  hit.setAttribute("data-handle", name);
  hit.setAttribute("x", String(cx - hitSize / 2));
  hit.setAttribute("y", String(cy - hitSize / 2));
  hit.setAttribute("width", String(hitSize));
  hit.setAttribute("height", String(hitSize));
  hit.setAttribute("fill", "transparent");
  hit.style.pointerEvents = "auto";
  hit.style.cursor = cursor;
  parent.appendChild(hit);
  const h = doc.createElementNS(NS, "rect");
  h.setAttribute("data-handle", name);
  h.setAttribute("x", String(cx - visualSize / 2));
  h.setAttribute("y", String(cy - visualSize / 2));
  h.setAttribute("width", String(visualSize));
  h.setAttribute("height", String(visualSize));
  h.setAttribute("fill", "#fff");
  h.setAttribute("stroke", "#3b82f6");
  h.setAttribute("stroke-width", String(FRAME_STROKE_SCREEN_PX));
  h.setAttribute("vector-effect", "non-scaling-stroke");
  h.style.pointerEvents = "auto";
  h.style.cursor = cursor;
  parent.appendChild(h);
}

function appendRotateHandle(doc: Document, parent: SVGGElement, b: Rect, pxToSlide: number): void {
  const NS = "http://www.w3.org/2000/svg";
  const handleOffset = 24 * pxToSlide;
  const rotCx = b.x + b.w / 2;
  const rotCy = b.y - handleOffset;
  const connector = doc.createElementNS(NS, "line");
  connector.setAttribute("x1", String(b.x + b.w / 2));
  connector.setAttribute("y1", String(b.y));
  connector.setAttribute("x2", String(rotCx));
  connector.setAttribute("y2", String(rotCy));
  connector.setAttribute("stroke", "#3b82f6");
  connector.setAttribute("stroke-width", String(FRAME_STROKE_SCREEN_PX));
  connector.setAttribute("vector-effect", "non-scaling-stroke");
  connector.style.pointerEvents = "none";
  parent.appendChild(connector);
  const rotHit = doc.createElementNS(NS, "circle");
  rotHit.setAttribute("data-handle", "rotate");
  rotHit.setAttribute("cx", String(rotCx));
  rotHit.setAttribute("cy", String(rotCy));
  rotHit.setAttribute("r", String(HANDLE_HIT_SCREEN_PX * pxToSlide));
  rotHit.setAttribute("fill", "transparent");
  rotHit.style.pointerEvents = "auto";
  rotHit.style.cursor = "alias";
  parent.appendChild(rotHit);
  const rotDot = doc.createElementNS(NS, "circle");
  rotDot.setAttribute("data-handle", "rotate");
  rotDot.setAttribute("cx", String(rotCx));
  rotDot.setAttribute("cy", String(rotCy));
  rotDot.setAttribute("r", String((HANDLE_SCREEN_PX / 2) * pxToSlide));
  rotDot.setAttribute("fill", "#3b82f6");
  rotDot.setAttribute("stroke", "#fff");
  rotDot.setAttribute("stroke-width", String(FRAME_STROKE_SCREEN_PX));
  rotDot.setAttribute("vector-effect", "non-scaling-stroke");
  rotDot.style.pointerEvents = "auto";
  rotDot.style.cursor = "alias";
  parent.appendChild(rotDot);
}

function handleCursor(name: string): string {
  switch (name) {
    case "n":
    case "s":
      return "ns-resize";
    case "e":
    case "w":
      return "ew-resize";
    case "ne":
    case "sw":
      return "nesw-resize";
    case "nw":
    case "se":
      return "nwse-resize";
  }
  return "default";
}

function findHandleAt(svg: SVGSVGElement, clientX: number, clientY: number): string | undefined {
  const el = svg.ownerDocument.elementFromPoint(clientX, clientY);
  if (!el) return undefined;
  const name = el.getAttribute("data-handle");
  return name ?? undefined;
}

// 编辑模式下让所有 shape 可见：入场动画导致的 opacity=0、或用户显式设的 0 都临时 set 1。
// destroy 时由 computeInitialEntranceState + userOpacityZero 重建正确的初始状态，
// 不再依赖 mount-time 的 snapshot 做"原样复原"——那条路径会让用户在编辑器里
// add / remove 的入场动画失效（mount 快照不包含新增的 entrance shape 的 0 状态）。
function forceVisibleForEdit(pres: Presentation): void {
  const walk = (s: Shape): void => {
    if (s.opacity === 0) s.opacity = 1;
    if (s.kind === "group") for (const c of s.children) walk(c);
  };
  for (const slide of pres.slides) {
    for (const layer of slide.layers) for (const s of layer.shapes) walk(s);
  }
}

// Snapshot 用来在 drag 移动 / resize 期间「锚定原始几何」：每个 frame 都 restorePositions
// 回原状再施加 finalDx/Dy，可以避免累积误差和 Shift / snap 的方向震荡。
//
// 几何分支：
//   - 所有 shape 共用 bbox。
//   - `line` 额外存 (x1,y1,x2,y2)（端点是绝对坐标，不是相对 bbox）。
//   - `polygon` 额外存 points 数组（同样是绝对坐标）。
//     之前漏了 polygon 处理 → 三角形 / 五角星拖不动（bbox 移了，points 没移，渲染靠 points）。
type PosSnap = Map<
  string,
  {
    bbox: Rect;
    line?: { x1: number; y1: number; x2: number; y2: number };
    points?: Array<[number, number]>;
    pathD?: string;
    textWrap?: boolean | null;
  }
>;

function snapshotPositions(s: Shape, out: PosSnap): void {
  const entry: {
    bbox: Rect;
    line?: { x1: number; y1: number; x2: number; y2: number };
    points?: Array<[number, number]>;
    pathD?: string;
    textWrap?: boolean | null;
  } = { bbox: { ...s.bbox } };
  if (s.kind === "line") entry.line = { x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 };
  if (s.kind === "polygon") entry.points = s.points.map((p) => [p[0], p[1]] as [number, number]);
  if (s.kind === "path") entry.pathD = s.d;
  if (s.kind === "text") entry.textWrap = s.wrap ?? null;
  out.set(s.id, entry);
  if (s.kind === "group") for (const c of s.children) snapshotPositions(c, out);
}

function restorePositions(s: Shape, snap: PosSnap): void {
  const r = snap.get(s.id);
  if (r) {
    s.bbox = { ...r.bbox };
    if (s.kind === "line" && r.line) {
      s.x1 = r.line.x1;
      s.y1 = r.line.y1;
      s.x2 = r.line.x2;
      s.y2 = r.line.y2;
    }
    if (s.kind === "polygon" && r.points) {
      s.points = r.points.map((p) => [p[0], p[1]] as [number, number]);
    }
    if (s.kind === "path" && r.pathD !== undefined) {
      s.d = r.pathD;
    }
    if (s.kind === "text" && "textWrap" in r) {
      if (r.textWrap == null) delete s.wrap;
      else s.wrap = r.textWrap;
    }
  }
  if (s.kind === "group") for (const c of s.children) restorePositions(c, snap);
}

function translateInPlace(s: Shape, dx: number, dy: number): void {
  s.bbox = { ...s.bbox, x: s.bbox.x + dx, y: s.bbox.y + dy };
  if (s.kind === "line") {
    s.x1 += dx;
    s.y1 += dy;
    s.x2 += dx;
    s.y2 += dy;
  }
  if (s.kind === "polygon") {
    s.points = s.points.map((p) => [p[0] + dx, p[1] + dy] as [number, number]);
  }
  if (s.kind === "path") {
    // preset path 按新 bbox 重算几何；解析自 PPTX 的自定义 path（无 presetType）
    // 直接平移绝对坐标的 d 串，否则渲染层用原 d 画图 → 拖动时图形原地不动。
    if (s.presetType) regeneratePathShape(s);
    else s.d = translatePathD(s.d, dx, dy);
  }
  if (s.kind === "group") for (const c of s.children) translateInPlace(c, dx, dy);
}

function rescaleInPlace(s: Shape, prev: Rect, next: Rect): void {
  enableTextWrapOnWidthChange(s, prev.w, next.w);
  s.bbox = { ...next };
  const sx = prev.w === 0 ? 1 : next.w / prev.w;
  const sy = prev.h === 0 ? 1 : next.h / prev.h;
  if (s.kind === "line") {
    s.x1 = next.x + (s.x1 - prev.x) * sx;
    s.y1 = next.y + (s.y1 - prev.y) * sy;
    s.x2 = next.x + (s.x2 - prev.x) * sx;
    s.y2 = next.y + (s.y2 - prev.y) * sy;
    return;
  }
  if (s.kind === "polygon") {
    s.points = s.points.map((p) => [next.x + (p[0] - prev.x) * sx, next.y + (p[1] - prev.y) * sy] as [number, number]);
    return;
  }
  if (s.kind === "path" && s.presetType) {
    regeneratePathShape(s);
    return;
  }
  if (s.kind !== "group") return;
  const walk = (c: Shape): void => {
    const rx = c.bbox.x - prev.x;
    const ry = c.bbox.y - prev.y;
    c.bbox = { x: next.x + rx * sx, y: next.y + ry * sy, w: c.bbox.w * sx, h: c.bbox.h * sy };
    if (c.kind === "line") {
      c.x1 = next.x + (c.x1 - prev.x) * sx;
      c.y1 = next.y + (c.y1 - prev.y) * sy;
      c.x2 = next.x + (c.x2 - prev.x) * sx;
      c.y2 = next.y + (c.y2 - prev.y) * sy;
    }
    if (c.kind === "polygon") {
      c.points = c.points.map((p) => [next.x + (p[0] - prev.x) * sx, next.y + (p[1] - prev.y) * sy] as [number, number]);
    }
    if (c.kind === "path" && c.presetType) regeneratePathShape(c);
    if (c.kind === "group") for (const cc of c.children) walk(cc);
  };
  for (const c of s.children) walk(c);
}

function computeResize(start: Rect, corner: string, dx: number, dy: number): Rect {
  let { x, y, w, h } = start;
  if (corner.includes("w")) {
    x = start.x + dx;
    w = start.w - dx;
  }
  if (corner.includes("e")) {
    w = start.w + dx;
  }
  if (corner.includes("n")) {
    y = start.y + dy;
    h = start.h - dy;
  }
  if (corner.includes("s")) {
    h = start.h + dy;
  }
  if (w < 4) {
    if (corner.includes("w")) x = start.x + start.w - 4;
    w = 4;
  }
  if (h < 4) {
    if (corner.includes("n")) y = start.y + start.h - 4;
    h = 4;
  }
  return { x, y, w, h };
}

// ---------- Marquee / Smart guides 工具 ----------

function rectFromPts(x1: number, y1: number, x2: number, y2: number): Rect {
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  const w = Math.abs(x1 - x2);
  const h = Math.abs(y1 - y2);
  return { x, y, w, h };
}

function bboxFromLineEndpoints(x1: number, y1: number, x2: number, y2: number): Rect {
  const r = rectFromPts(x1, y1, x2, y2);
  return { x: r.x, y: r.y, w: Math.max(1, r.w), h: Math.max(1, r.h) };
}

function snapLineEndpoint(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  stepDeg = 15,
): { x: number; y: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 0.001) return { x: bx, y: by };
  let ang = Math.atan2(dy, dx);
  const step = (stepDeg * Math.PI) / 180;
  ang = Math.round(ang / step) * step;
  return { x: ax + Math.cos(ang) * len, y: ay + Math.sin(ang) * len };
}

function rectIntersect(a: Rect, b: Rect): boolean {
  return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
}

function unionFromMap(m: Map<string, Rect>): Rect | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let count = 0;
  for (const r of m.values()) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
    count++;
  }
  if (count === 0) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function collectStaticBboxes(slide: Slide, exclude: Set<string>): Rect[] {
  const out: Rect[] = [];
  const walk = (s: Shape): void => {
    if (!exclude.has(s.id)) out.push(s.bbox);
    if (s.kind === "group") for (const c of s.children) walk(c);
  };
  for (const layer of slide.layers) for (const s of layer.shapes) walk(s);
  return out;
}

function drawMarquee(doc: Document, svg: SVGSVGElement, r: Rect): void {
  const NS = "http://www.w3.org/2000/svg";
  const rect = doc.createElementNS(NS, "rect");
  rect.setAttribute("x", String(r.x));
  rect.setAttribute("y", String(r.y));
  rect.setAttribute("width", String(r.w));
  rect.setAttribute("height", String(r.h));
  rect.setAttribute("fill", "rgba(59,130,246,0.12)");
  rect.setAttribute("stroke", "#3b82f6");
  rect.setAttribute("stroke-dasharray", "4 3");
  rect.setAttribute("stroke-width", "1");
  rect.setAttribute("vector-effect", "non-scaling-stroke");
  rect.style.pointerEvents = "none";
  svg.appendChild(rect);
}

function drawStaticGuide(
  doc: Document,
  svg: SVGSVGElement,
  g: Guide,
  slideW: number,
  slideH: number,
  color: string,
  opacity: number,
): void {
  appendAidLine(
    doc,
    svg,
    (ln) => {
      if (g.orient === "v") {
        ln.setAttribute("x1", String(g.at));
        ln.setAttribute("x2", String(g.at));
        ln.setAttribute("y1", "0");
        ln.setAttribute("y2", String(slideH));
      } else {
        ln.setAttribute("y1", String(g.at));
        ln.setAttribute("y2", String(g.at));
        ln.setAttribute("x1", "0");
        ln.setAttribute("x2", String(slideW));
      }
    },
    color,
    GUIDE_AID_WIDTH,
    opacity,
  );
}

function drawGuide(doc: Document, svg: SVGSVGElement, g: Guide, slideW: number, slideH: number): void {
  const NS = "http://www.w3.org/2000/svg";
  const ln = doc.createElementNS(NS, "line");
  if (g.orient === "v") {
    ln.setAttribute("x1", String(g.at));
    ln.setAttribute("x2", String(g.at));
    ln.setAttribute("y1", String(Math.max(0, Math.min(g.from, g.to))));
    ln.setAttribute("y2", String(Math.min(slideH, Math.max(g.from, g.to))));
  } else {
    ln.setAttribute("y1", String(g.at));
    ln.setAttribute("y2", String(g.at));
    ln.setAttribute("x1", String(Math.max(0, Math.min(g.from, g.to))));
    ln.setAttribute("x2", String(Math.min(slideW, Math.max(g.from, g.to))));
  }
  ln.setAttribute("stroke", "#f97316");
  ln.setAttribute("stroke-width", "1");
  ln.setAttribute("vector-effect", "non-scaling-stroke");
  ln.style.pointerEvents = "none";
  svg.appendChild(ln);
}

// 计算 movedRect 与 others 的 snap 距离。返回 dx/dy（应该额外移动多少）和需要画的辅助线。
function computeSnap(
  movedRect: Rect,
  others: Rect[],
  threshold: number,
  staticLines?: { v: number[]; h: number[] },
  grid?: { step: number; width: number; height: number },
): { dx: number; dy: number; guides: Guide[] } {
  const guides: Guide[] = [];
  const movedXs = [movedRect.x, movedRect.x + movedRect.w / 2, movedRect.x + movedRect.w];
  const movedYs = [movedRect.y, movedRect.y + movedRect.h / 2, movedRect.y + movedRect.h];
  let bestDx = 0;
  let bestDistX = threshold + 1;
  let bestGuideX: Guide | null = null;
  let bestDy = 0;
  let bestDistY = threshold + 1;
  let bestGuideY: Guide | null = null;
  for (const other of others) {
    const otherXs = [other.x, other.x + other.w / 2, other.x + other.w];
    const otherYs = [other.y, other.y + other.h / 2, other.y + other.h];
    for (let i = 0; i < movedXs.length; i++) {
      for (let j = 0; j < otherXs.length; j++) {
        const diff = otherXs[j]! - movedXs[i]!;
        const ad = Math.abs(diff);
        if (ad < bestDistX) {
          bestDistX = ad;
          bestDx = diff;
          bestGuideX = {
            orient: "v",
            at: otherXs[j]!,
            from: Math.min(movedRect.y, other.y),
            to: Math.max(movedRect.y + movedRect.h, other.y + other.h),
          };
        }
      }
    }
    for (let i = 0; i < movedYs.length; i++) {
      for (let j = 0; j < otherYs.length; j++) {
        const diff = otherYs[j]! - movedYs[i]!;
        const ad = Math.abs(diff);
        if (ad < bestDistY) {
          bestDistY = ad;
          bestDy = diff;
          bestGuideY = {
            orient: "h",
            at: otherYs[j]!,
            from: Math.min(movedRect.x, other.x),
            to: Math.max(movedRect.x + movedRect.w, other.x + other.w),
          };
        }
      }
    }
  }
  if (grid) {
    const hitX = pickGridSnap(
      movedXs,
      grid.step,
      grid.width,
      threshold,
    );
    if (hitX && Math.abs(hitX.delta) < bestDistX) {
      bestDistX = Math.abs(hitX.delta);
      bestDx = hitX.delta;
      bestGuideX = { orient: "v", at: hitX.at, from: movedRect.y, to: movedRect.y + movedRect.h };
    }
    const hitY = pickGridSnap(
      movedYs,
      grid.step,
      grid.height,
      threshold,
    );
    if (hitY && Math.abs(hitY.delta) < bestDistY) {
      bestDistY = Math.abs(hitY.delta);
      bestDy = hitY.delta;
      bestGuideY = { orient: "h", at: hitY.at, from: movedRect.x, to: movedRect.x + movedRect.w };
    }
  }
  if (staticLines) {
    for (const x of staticLines.v) {
      for (const mx of movedXs) {
        const diff = x - mx;
        const ad = Math.abs(diff);
        if (ad < bestDistX) {
          bestDistX = ad;
          bestDx = diff;
          bestGuideX = { orient: "v", at: x, from: movedRect.y, to: movedRect.y + movedRect.h };
        }
      }
    }
    for (const y of staticLines.h) {
      for (const my of movedYs) {
        const diff = y - my;
        const ad = Math.abs(diff);
        if (ad < bestDistY) {
          bestDistY = ad;
          bestDy = diff;
          bestGuideY = { orient: "h", at: y, from: movedRect.x, to: movedRect.x + movedRect.w };
        }
      }
    }
  }
  if (bestDistX > threshold) {
    bestDx = 0;
    bestGuideX = null;
  }
  if (bestDistY > threshold) {
    bestDy = 0;
    bestGuideY = null;
  }
  if (bestGuideX) guides.push(bestGuideX);
  if (bestGuideY) guides.push(bestGuideY);
  return { dx: bestDx, dy: bestDy, guides };
}

// 行内文本编辑器（双击进入的 contenteditable overlay）的构造 / 读回逻辑见
// ./text-edit-overlay.ts —— 那里逐条镜像了 renderer 对 ‹txBody› 的排版规则。
