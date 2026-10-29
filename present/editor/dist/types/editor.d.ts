import { CommandStack, type EditCommand, type Presentation, type Slide, type MediaLibraryAdapter } from "@sliiu/present-core";
import { Selection } from "./selection.js";
import { type CommentAssignUi } from "./comments-panel.js";
import { type HelpLinks } from "./help-dialog.js";
import { type EditorPlugin, type EditorPluginCatalogEntry } from "./editor-plugins.js";
import { type DesignerAiResult } from "./designer-dialog.js";
import { type SlideshowSetupState } from "./setup-slideshow-dialog.js";
import { type DevDumpSection } from "./dev-panel.js";
import { type ContextMenuItem } from "./context-menu.js";
import { type Locale } from "./i18n.js";
import { type AiInlineUi } from "./ai-inline-box.js";
import { type PresentationViewMode } from "./presentation-views.js";
export type InsertShapeKind = "rect" | "ellipse" | "text" | "triangle" | "star" | "arrow" | "line" | (string & {});
export type SaveFormat = "pptx" | "html" | "html-zip" | "pdf" | "png";
/**
 * 编辑器视图中暴露的「放映时可选插件」描述。宿主（playground / 业务壳）把
 * 完整的可选清单传入；编辑器仅维护选中状态并通过 onPlaybackPluginsChange 回写，
 * 不持有真正的 Plugin 对象。这样 @sliiu/present-editor 不需要硬依赖 @sliiu/present-player。
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
    locale?: Locale;
    onSelectionChange?: (ids: ReadonlySet<string>) => void;
    onCommandStackChange?: (info: {
        canUndo: boolean;
        canRedo: boolean;
    }) => void;
    /** Fired after a local command is applied (not undo/redo). Used for per-command collab sync. */
    onCommandExecuted?: (cmd: EditCommand) => void;
    /**
     * 批注正文里带 @ai 并提交后调用。宿主改这一页并在该线程下回复，
     * 不打开助手。进行中、正忙和失败通过 ui 写在这张批注卡片上。
     */
    onAssignCommentToAi?: (comment: {
        id: string;
        slideIndex: number;
        text: string;
        shapeId?: string;
        parentId?: string;
    }, ui: CommentAssignUi) => void;
    /**
     * AI 点选模式下，在选区旁的输入框里提交后调用。宿主只改 shapeIds，
     * 进行中、正忙、失败和完成通过 ui 写在输入框里。不提供则没有 AI 点选模式。
     */
    onAskAiInline?: (req: {
        slideIndex: number;
        shapeIds: string[];
        text: string;
    }, ui: AiInlineUi) => void;
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
    saveAs?: (fmt: SaveFormat) => void;
    /** Query only: Export popover lists only formats this returns true for (PPTX always). */
    canExport?: (fmt: SaveFormat) => boolean;
    /** Query only: Share modal copies this URL when present. */
    getShareUrl?: () => string | undefined;
    /** 快速保存到已打开的磁盘文件（File System Access）；无句柄时宿主可回落 saveAs。 */
    save?: () => void;
    openFile?: () => void;
    newPresentation?: () => void;
    /** File tab「最近」列表（由宿主提供本地缓存条目）。 */
    openRecent?: () => void;
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
    availablePlaybackPlugins?: PlaybackPluginOption[];
    selectedPlaybackPlugins?: string[];
    onPlaybackPluginsChange?: (ids: string[]) => void;
    startSlideshowFromBeginning?: () => void;
    startSlideshowFromCurrent?: () => void;
    startLiveSlideshow?: () => void;
    windowedMode?: boolean;
    onWindowedModeChange?: (next: boolean) => void;
    slideshowLoop?: boolean;
    onSlideshowLoopChange?: (next: boolean) => void;
    presenterMode?: boolean;
    onPresenterModeChange?: (next: boolean) => void;
    slideshowUseTimings?: boolean;
    onSlideshowUseTimingsChange?: (next: boolean) => void;
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
    }) => Promise<{
        text: string;
    } | null>;
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
    getStockImageKeys?: () => {
        unsplashKey?: string;
        pexelsKey?: string;
    };
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
    importPlugin?: (kind: "editor" | "playback") => Promise<{
        id: string;
        name: string;
        description?: string;
    } | null>;
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
export type EditorContext = {
    kind: "slides";
} | {
    kind: "master";
    masterId: string;
    layoutId?: string;
} | {
    kind: "notesMaster";
    masterId: string;
} | {
    kind: "handoutMaster";
    masterId: string;
};
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
    insertImage(src: string, natural?: {
        w: number;
        h: number;
    }): void;
    /** 读取图片 / 视频 / 音频并插入。读取过程在舞台底部显示进度。 */
    insertMediaFiles(files: readonly File[]): Promise<void>;
    /** `narration`：录制旁白——自动播放并写成 OOXML `p:audio@isNarration`。 */
    insertAudio(src: string, opts?: {
        duration?: number;
        narration?: boolean;
    }): void;
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
    setImportedPluginCatalog(editorExtras: EditorPluginCatalogEntry[], playback: PlaybackPluginOption[]): void;
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
    setHostStatus(msg: string, kind?: "info" | "ok" | "err", action?: {
        label: string;
        onClick: () => void;
    } | null): void;
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
export declare function mountEditor(host: HTMLElement, initialPres: Presentation, opts?: EditorOptions): EditorHandle;
