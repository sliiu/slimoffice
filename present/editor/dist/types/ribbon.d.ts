import { type BulletDef, type CommandHistoryEntry, type TextParagraph, type TextRun } from "@sliiu/present-core";
import type { InsertShapeKind, SaveFormat } from "./editor.js";
import type { PasteSpecialMode } from "./paste-special-dialog.js";
import type { TextStylePatch, ParagraphSpacingPatch } from "./commands.js";
import type { AlignMode } from "./commands.js";
export type { TransitionPatch } from "./transition-panel.js";
export interface RibbonActions {
    insertShape: (kind: InsertShapeKind) => void;
    /** 进入拖放绘制模式（矩形/椭圆等）；缺省时回退 insertShape。 */
    armShapeDraw?: (kind: InsertShapeKind) => void;
    insertImage: () => void;
    /** Insert a new slide after the current page. */
    insertSlide?: () => void;
    /** Return to the pointer / select tool (cancel ink + pending shape draw). */
    selectPointer?: () => void;
    /** 视图条缩放：按离散档位步进；getZoomPercent 返回当前实际比例（适应窗口时 fit=true）。 */
    stepZoom?: (dir: -1 | 1) => void;
    getZoomPercent?: () => {
        fit: boolean;
        percent: number;
    };
    /** 宿主明暗切换（视图条太阳 / 月亮）。 */
    toggleAppearance?: () => void;
    isDarkAppearance?: () => boolean;
    /** 外观偏好变化时刷新视图条按钮；返回取消订阅。 */
    subscribeAppearance?: (listener: () => void) => () => void;
    openPhotoAlbum?: () => void;
    insertOnlinePicture?: () => void;
    insertScreenshot?: () => void;
    insertVideo?: () => void;
    insertAudio?: () => void;
    openMediaLibrary?: () => void;
    openRecordDialog?: () => void;
    /** 实验 tab：屏幕录制并下载为 WebM（不自动插入幻灯片）。 */
    saveAsVideo?: () => void;
    setSlideAspect: (ratio: "16:9" | "4:3") => void;
    setBackground: (color: string) => void;
    openFormatBackground?: () => void;
    openThemeGallery?: () => void;
    listThemeVariants?: () => Array<{
        id: string;
        label: string;
        swatch: string;
    }>;
    applyThemeVariant?: (variantId: string) => void;
    openDesigner?: () => void;
    getCurrentThemeId?: () => string | undefined;
    setZoom: (mode: "fit" | number) => void;
    toggleGrid: () => boolean;
    isGridOn?: () => boolean;
    togglePropertiesPanel?: () => boolean;
    isPropertiesPanelOpen?: () => boolean;
    toggleTimelinePanel?: () => boolean;
    isTimelinePanelOpen?: () => boolean;
    toggleSnapGrid?: () => boolean;
    isSnapGridOn?: () => boolean;
    toggleSnapShapes?: () => boolean;
    isSnapShapesOn?: () => boolean;
    bringForward: () => void;
    sendBackward: () => void;
    bringFront: () => void;
    sendBack: () => void;
    undo: () => void;
    redo: () => void;
    canUndo?: () => boolean;
    canRedo?: () => boolean;
    listHistory?: () => CommandHistoryEntry[];
    jumpToHistory?: (mark: number) => void;
    duplicate: () => void;
    remove: () => void;
    cut?: () => void;
    copy?: () => void;
    paste?: () => void;
    canPaste?: () => boolean;
    openPasteSpecial?: (mode: PasteSpecialMode) => void;
    applyChangeCase?: (mode: "upper" | "lower" | "title" | "sentence") => void;
    focusLayersPanel?: () => void;
    openLayoutPicker?: () => void;
    resetSlideLayout?: () => void;
    addSection?: () => void;
    listQuickStyles?: () => Array<{
        id: string;
        label: string;
        color: string;
        preview?: "fill" | "outline";
    }>;
    applyQuickStyle?: (presetId: string) => void;
    convertInkToShape?: () => void;
    convertInkToText?: () => void;
    toggleFormatPainter?: (persistent: boolean) => void;
    isFormatPainterOn?: () => boolean;
    openFindReplace?: () => void;
    openReplace?: () => void;
    applyTextStyle: (patch: TextStylePatch) => void;
    toggleTextShadow?: () => void;
    isTextShadowOn?: () => boolean;
    applyAlign: (align: NonNullable<TextParagraph["align"]>) => void;
    applyParagraphSpacing?: (patch: ParagraphSpacingPatch) => void;
    getCurrentParagraph?: () => TextParagraph | undefined;
    clearTextFormatting?: () => void;
    adjustIndent?: (deltaPx: number) => void;
    getCurrentTextRun: () => TextRun | undefined;
    setParagraphBullet?: (next: BulletDef | undefined) => void;
    convertToSmartArt?: () => void;
    setParagraphRtl?: (rtl: boolean) => void;
    setTextOrientation?: (vert: "horz" | "vert" | "vert270" | "wordArtVert" | "wordArtVertRtl" | "eaVert" | "mongolianVert" | null) => void;
    getTextOrientation?: () => "horz" | "vert" | "vert270" | "wordArtVert" | "wordArtVertRtl" | "eaVert" | "mongolianVert" | undefined;
    setTextRowOrder?: (rtl: boolean) => void;
    getTextRowOrderRtl?: () => boolean | undefined;
    setCjkTypography?: (enabled: boolean) => void;
    setTextVAlign?: (vAlign: "top" | "middle" | "bottom") => void;
    setTextColumns?: (cols: number) => void;
    getTextColumns?: () => number | undefined;
    groupSelection?: () => void;
    ungroupSelection?: () => void;
    alignSelection?: (mode: AlignMode) => void;
    distributeSelection?: (axis: "h" | "v") => void;
    flipSelection?: (axis: "h" | "v") => void;
    rotateSelection?: (delta: number) => void;
    lockSelection?: () => void;
    unlockSelection?: () => void;
    selectionCount?: () => number;
    isSelectionLocked?: () => boolean;
    isSelectionGroup?: () => boolean;
    setSelectionFill?: (color: string | "none") => void;
    setSelectionStroke?: (color: string | "none") => void;
    setSelectionStrokeWidth?: (px: number) => void;
    setSelectionStrokeDash?: (preset: import("@sliiu/present-core").StrokeDashPreset) => void;
    setSelectionLineArrows?: (mode: "none" | "head" | "tail" | "both") => void;
    getSelectionFill?: () => string | undefined;
    getSelectionStroke?: () => {
        color?: string;
        width?: number;
        dashPreset?: import("@sliiu/present-core").StrokeDashPreset;
    } | undefined;
    getSelectionLineArrows?: () => "none" | "head" | "tail" | "both" | undefined;
    selectionHasLine?: () => boolean;
    listFillGradientPresets?: () => Array<{
        id: string;
        label: string;
        preview: string;
    }>;
    applyFillGradientPreset?: (id: string) => void;
    listShapeEffectPresets?: () => Array<{
        id: string;
        label: string;
        swatch: string;
    }>;
    applyShapeEffectPreset?: (id: string) => void;
    saveAs?: (fmt: SaveFormat) => void;
    /** Query only — hide PDF in the Export popover unless the host already exports it. */
    canExport?: (fmt: SaveFormat) => boolean;
    /** Query only — populate the Share modal link field. */
    getShareUrl?: () => string | undefined;
    save?: () => void;
    openFile?: () => void;
    openRecent?: () => void;
    newPresentation?: () => void;
    print?: () => void;
    share?: () => void;
    openAccount?: () => void;
    openOptions?: () => void;
    openCollab?: () => void;
    isShareAvailable?: () => boolean;
    /** Plan C header center: current 0-based slide index. */
    getSlideIndex?: () => number;
    /** Plan C header center: deck length. */
    getSlideCount?: () => number;
    insertTable?: (rows?: number, cols?: number) => void;
    insertChart?: () => void;
    insertSmartArt?: () => void;
    openModel3DPicker?: () => void;
    openOleInsert?: () => void;
    insertHyperlink?: () => void;
    insertWebEmbed?: () => void;
    insertDateTimeField?: () => void;
    insertSlideNumberField?: () => void;
    setBookmark?: () => void;
    insertWordArt?: () => void;
    insertSymbol?: () => void;
    insertIcon?: () => void;
    insertEquation?: () => void;
    insertHeaderFooter?: () => void;
    toggleRulers?: () => boolean;
    isRulersOn?: () => boolean;
    toggleGuides?: () => boolean;
    isGuidesOn?: () => boolean;
    getGuideAidColor?: () => string;
    setGuideAidColor?: (color: string) => void;
    getGuideAidOpacity?: () => number;
    setGuideAidOpacity?: (opacity: number) => void;
    resetGuideAidColor?: () => void;
    getGridAidColor?: () => string;
    setGridAidColor?: (color: string) => void;
    getGridAidOpacity?: () => number;
    setGridAidOpacity?: (opacity: number) => void;
    resetGridAidColor?: () => void;
    toggleNotes?: () => boolean;
    isNotesOn?: () => boolean;
    toggleLecture?: () => boolean;
    isLectureOn?: () => boolean;
    /** 状态栏与动画功能区：只开关时间轴页，关掉后自动展开不再弹回。 */
    toggleTimeline?: () => boolean;
    isTimelineOn?: () => boolean;
    newComment?: () => void;
    toggleComments?: () => boolean;
    isCommentsOn?: () => boolean;
    resolveSlideComments?: () => void;
    hasOpenSlideComments?: () => boolean;
    reopenSlideComments?: () => void;
    hasResolvedSlideComments?: () => boolean;
    checkAccessibility?: () => void;
    toggleSpelling?: () => boolean;
    isSpellingOn?: () => boolean;
    openThesaurus?: () => void;
    openSmartLookup?: () => void;
    openTranslate?: () => void;
    openProofingLanguage?: () => void;
    openCompare?: () => void;
    openProtect?: () => void;
    openEmbedFonts?: () => void;
    isProtected?: () => boolean;
    openHelp?: () => void;
    openFeedback?: () => void;
    openTraining?: () => void;
    /** Help tab：功能导览（由 playground 等宿主注入）。 */
    openEditorTour?: () => void;
    setColorViewMode?: (mode: "color" | "grayscale" | "blackWhite") => void;
    getColorViewMode?: () => "color" | "grayscale" | "blackWhite";
    setInkMode?: (mode: "pen" | "highlighter" | "eraser" | null) => void;
    getInkMode?: () => "pen" | "highlighter" | "eraser" | null;
    setInkPenColor?: (color: string) => void;
    getInkPenColor?: () => string;
    setInkPenWidth?: (width: number) => void;
    getInkPenWidth?: () => number;
    clearInkOnSlide?: () => void;
    setPresentationView?: (mode: "normal" | "sorter" | "outline" | "reading" | "notesPage") => void;
    getPresentationView?: () => "normal" | "sorter" | "outline" | "reading" | "notesPage";
    toggleMasterView?: () => boolean;
    isMasterViewOn?: () => boolean;
    toggleNotesMasterView?: () => boolean;
    isNotesMasterViewOn?: () => boolean;
    toggleHandoutMasterView?: () => boolean;
    isHandoutMasterViewOn?: () => boolean;
    getMasterOutline?: () => Array<{
        masterId: string;
        name: string;
        layouts: Array<{
            id: string;
            name: string;
        }>;
    }>;
    getMasterTarget?: () => {
        masterId: string;
        layoutId?: string;
    } | undefined;
    setMasterTarget?: (masterId: string, layoutId?: string) => void;
    openPlaybackPlugins?: (anchor: HTMLElement) => void;
    playbackPluginCount?: () => number;
    openEditorPlugins?: (anchor: HTMLElement) => void;
    openVbaInfo?: () => void;
    hasVbaProject?: () => boolean;
    editorPluginCount?: () => number;
    startSlideshowFromBeginning?: () => void;
    startSlideshowFromCurrent?: () => void;
    startLiveSlideshow?: () => void;
    toggleWindowedMode?: () => boolean;
    isWindowedModeOn?: () => boolean;
    toggleSlideshowLoop?: () => boolean;
    isSlideshowLoopOn?: () => boolean;
    toggleCurrentSlideHidden?: () => boolean;
    isCurrentSlideHidden?: () => boolean;
    togglePresenterView?: () => boolean;
    isPresenterViewOn?: () => boolean;
    toggleSlideshowUseTimings?: () => boolean;
    isSlideshowUseTimingsOn?: () => boolean;
    toggleSlideshowPlayNarrations?: () => boolean;
    isSlideshowPlayNarrationsOn?: () => boolean;
    openCustomShow?: () => void;
    openNewWindow?: () => void;
    closeAllAuxWindows?: () => void;
    focusAuxWindow?: () => void;
    arrangeAllWindows?: () => void;
    arrangeSideBySideWindows?: () => void;
    arrangeStackedWindows?: () => void;
    cascadeWindows?: () => void;
    startRehearseTimings?: () => void;
    startRecordSlideShowFromBeginning?: () => void;
    startRecordSlideShowFromCurrent?: () => void;
    openSetupSlideShow?: () => void;
    previewTransition?: () => void;
    applyTransitionToAll?: () => void;
    applyQuickTransition?: (kind: string, durationSec?: number) => void;
    getCurrentTransition?: () => {
        kind: string;
        duration: number;
    } | undefined;
    focusTransitionsPanel?: () => void;
    openAnimationPicker?: () => void;
    focusAnimationsPanel?: () => void;
    toggleAnimationPainter?: (persistent: boolean) => void;
    isAnimationPainterOn?: () => boolean;
    close?: () => void;
}
export interface RibbonHandle {
    el: HTMLDivElement;
    /** 视图切换 · 缩放 | 放映 · 明暗 · 属性栏；宿主放在顶栏下方。 */
    viewBar: HTMLDivElement;
    /** 底部唯一命令行：左侧分组切换器，右侧是当前分组命令。 */
    commandBar: HTMLDivElement;
    /** 状态栏左端：视图下拉。 */
    statusStart: HTMLDivElement;
    /** 状态栏右端：备注开关。 */
    statusEnd: HTMLDivElement;
    refresh(): void;
    /** 只刷新视图条缩放比例（舞台尺寸变化时调用，开销小）。 */
    refreshZoom(): void;
    /**
     * 命令条挂到布局后按实际宽度收成统一图标（`markUniformIconStrip`）。
     * 条尚未有 clientWidth 时会等到盒子量出来再量一次。
     */
    fitCommandStrip(): void;
    /** 释放挂在 document 上的浮层 DOM / 事件监听 / ResizeObserver（见 setupRibbonOverflow）。 */
    destroy(): void;
}
export declare function buildRibbon(doc: Document, a: RibbonActions): RibbonHandle;
