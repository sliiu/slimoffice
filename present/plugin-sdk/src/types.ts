// @ppt/plugin-sdk —— 类型定义
//
// 这些类型是 SDK 与 player 之间的契约。player 直接复用这些类型，确保 SDK
// 用户写的插件 100% 与 player 运行时兼容。
//
// 关键设计：
//   - 完全不依赖任何 @ppt/core / animation / renderer 的内部类型。
//   - 用 SDK 自己声明的、稳定的"扁平快照"类型，让插件作者不需要懂 OOXML 内部。

// ---------------------------------------------------------------------------
// PPT 元数据快照
// ---------------------------------------------------------------------------

export interface PresentationInfo {
  /** Presentation 的唯一 id（通常对应 PPTX 内部 id）。 */
  id: string;
  /** Slide 像素尺寸（EMU 已经被 player 转换为像素）。 */
  size: { width: number; height: number };
  /** 演示文稿标题（如 PPTX 内 docProps/title）。 */
  title?: string;
  /** 全量 slide 元数据，按文件原始顺序。 */
  slides: SlideInfo[];
  /** 按可见顺序的 slide 索引（指向 slides 数组的 index）。 */
  visibleOrder: number[];
  /** PPTX 顶级 meta（作者、关键字等）。 */
  meta?: Record<string, unknown>;
}

export interface SlideInfo {
  id: string;
  name: string;
  /** 在 presentation.slides 中的绝对索引（不变量）。 */
  index: number;
  /** 在可见序列中的位置；隐藏页为 -1。 */
  visibleIndex: number;
  /** 是否可见（ECMA-376 §19.3.1.37 sld@show=false 时为 false）。 */
  show: boolean;
  /** 是否有 OOXML timing（即可推进的动画 step）。 */
  hasAnimations: boolean;
  /** mainSteps 的步数（onClick + onLoad），无 timing 时为 0。 */
  totalAnimationSteps: number;
  notes?: string;
  transition?: { kind: string; duration: number };
}

// ---------------------------------------------------------------------------
// 事件
// ---------------------------------------------------------------------------

export interface SlideChangeEvent {
  visibleIndex: number;
  absoluteIndex: number;
  total: number;
  slide: SlideInfo;
}

export interface StepChangeEvent {
  visibleIndex: number;
  absoluteIndex: number;
  currentStep: number;
  totalSteps: number;
  /** 当前动画已跳到 / 播到末态（直播跟随时观众应 freeze，而不是继续播）。 */
  frozen?: boolean;
}

export type PlayerEventType =
  | "slidechange"
  | "stepchange"
  | "complete"
  | "destroy";

export interface PlayerEventMap {
  slidechange: SlideChangeEvent;
  stepchange: StepChangeEvent;
  complete: void;
  destroy: void;
}

export type EventUnsubscribe = () => void;

export interface PlayerEventBus {
  on<E extends PlayerEventType>(
    event: E,
    cb: (payload: PlayerEventMap[E]) => void,
  ): EventUnsubscribe;
  off<E extends PlayerEventType>(
    event: E,
    cb: (payload: PlayerEventMap[E]) => void,
  ): void;
  /** 重发一次最新的 slidechange 快照。 */
  emitCurrentSlide(): void;
}

// ---------------------------------------------------------------------------
// 播放控制
// ---------------------------------------------------------------------------

export interface PlayerControlAPI {
  next(): void;
  prev(): void;
  goto(visibleIndex: number): void;
  gotoById(slideId: string): boolean;
  current(): number;
  total(): number;

  /** 推进一个 onClick step。返回 true 表示推进了，false 表示该页已无更多 step。 */
  nextStep(): boolean;
  /**
   * 触发某个 shape 的 click 动画。`shapeId` 是渲染节点 id（即 DOM `<g>` 上的
   * `data-id`，形如 `sp_<spid>`），与 {@link ShapeInfo.id} / `ctx.scene` 返回的 id 一致。
   */
  triggerShape(shapeId: string): boolean;
  /** 当前 slide 的动画 step 状态。 */
  step(): { totalSteps: number; currentStep: number };
  /** 把所有 active step 冻结到末态。 */
  freezeActive(): void;

  /**
   * 锁定 / 解锁导航。锁定后，播放器内置的「单击推进 / 翻页」「键盘翻页」「单击
   * 形状触发动画 / 超链接」全部停用 —— 插件可以接管交互（典型场景：单选题答题前
   * 不让观众点空白处翻页）。不影响 `next()` / `goto()` 等编程式 API。
   */
  setNavigationLocked(locked: boolean): void;
  /** 当前导航是否被锁定。 */
  isNavigationLocked(): boolean;
}

// ---------------------------------------------------------------------------
// 场景 / shape 模型（当前 slide 的只读快照 + 受控显隐）
// ---------------------------------------------------------------------------
//
// `ctx.scene` 让插件在**不依赖具体渲染 backend / DOM 结构**的前提下，按 PPT 里
// 的 shape 名字（PowerPoint「选择窗格」可改）认元素、做命中测试、显隐控制、触发
// 动画。坐标统一使用 slide 内部坐标（与 OOXML 一致，非屏幕像素）。

/** 当前 slide 上单个顶层 shape 的扁平快照。 */
export interface ShapeInfo {
  /**
   * 渲染节点 id（DOM `<g>` 的 `data-id`，形如 `sp_<spid>`）。可直接传给
   * `ctx.scene.triggerShape` / `ctx.player.triggerShape`。
   */
  id: string;
  /** shape 名字（PPTX `<p:nvSpPr><p:cNvPr name>`；PowerPoint 选择窗格里可编辑）。 */
  name: string;
  /** shape 类型：`text` / `image` / `rect` / `ellipse` / `line` / `group` / `chart` ... */
  kind: string;
  /** slide 坐标系下的包围盒。 */
  bbox: { x: number; y: number; w: number; h: number };
  /** 当前是否可见（综合初始 visible、动画 visibleOverride 与 opacity>0）。 */
  visible: boolean;
  /** 纯文本内容（文字 shape / 含文字的 group 才有），便于按文案识别题干 / 选项。 */
  text?: string;
  /** 是否存在「单击触发」动画（可被 triggerShape 播放）。 */
  hasClickAnimation: boolean;
}

export interface SceneAPI {
  /** 当前 slide 的全部顶层 shape，按 z 序从底到顶。 */
  shapes(): ShapeInfo[];
  /** 按名字精确匹配，返回第一个（按 z 序）匹配的 shape；无则 null。 */
  byName(name: string): ShapeInfo | null;
  /** 按名字精确匹配，返回全部匹配（按 z 序）。 */
  allByName(name: string): ShapeInfo[];
  /** 按渲染节点 id 取 shape。 */
  byId(id: string): ShapeInfo | null;
  /** slide 坐标命中测试，返回命中的最顶层可见 shape；无则 null。 */
  hitTest(x: number, y: number): ShapeInfo | null;
  /**
   * 把屏幕坐标（如 PointerEvent.clientX/clientY）换算成 slide 坐标。
   * 舞台尚未完成布局时返回 null。
   */
  toSlideCoords(clientX: number, clientY: number): { x: number; y: number } | null;
  /** 显示 / 隐藏一个 shape。返回 false 表示当前 slide 找不到该 id。 */
  setVisible(id: string, visible: boolean): boolean;
  /** 设置 shape 透明度 [0,1]。返回 false 表示找不到该 id。 */
  setOpacity(id: string, opacity: number): boolean;
  /**
   * 播放该 shape 在 PPT 里设置的「单击触发」动画。等价 `ctx.player.triggerShape`。
   * 返回 false 表示该 shape 没有可触发的 click 动画。
   */
  triggerShape(id: string): boolean;
}

// ---------------------------------------------------------------------------
// 缩略图
// ---------------------------------------------------------------------------
//
// 缩略图统一走矢量 SVG 渲染（和编辑器 slide list 实现完全一致）：
//   - 矢量，可任意缩放，字体 / 滤镜 / 路径完全保真
//   - 无需异步等待 canvas → Blob 流程，mount 即可见
//   - 不丢失初始动画状态（hidden / clip / paragraph overrides 等）
//
// 推荐用法：`ctx.thumbnail.mount(hostEl, target)` 直接挂载到 DOM。
// 老的 `byVisibleIndex` 等 Promise<Blob> 系列保留并改为返回 SVG Blob（mime
// `image/svg+xml`），可平滑迁移。

/**
 * 缩略图目标定位：
 *   - `number` —— 可见序列索引（最常用）
 *   - `{ absoluteIndex }` —— Presentation.slides 数组的绝对索引
 *   - `{ id }` —— slide id
 *   - `{ visibleIndex }` —— 等价于直接传 number
 */
export type ThumbnailTarget =
  | number
  | { visibleIndex: number }
  | { absoluteIndex: number }
  | { id: string };

export interface ThumbnailMountOptions {
  /** 透明背景（默认 false，白底；与编辑器 slide list 一致）。 */
  transparent?: boolean;
}

export interface ThumbnailHandle {
  /** 已挂载的 SVG 元素。 */
  readonly element: SVGSVGElement;
  /** 卸载缩略图，从 DOM 移除 SVG 并释放底层 backend。 */
  destroy(): void;
}

/** 兼容旧位图 API 的选项。新代码应改用 mount() / toSvgBlob()。 */
export interface ThumbnailOptions {
  /** 期望宽度（px）—— 仅影响矢量到位图的转换尺寸，矢量本身无尺寸概念。默认 240。 */
  width?: number;
  /** 缩放倍率，默认 1。 */
  scale?: number;
  /**
   * MIME。新实现默认 `image/svg+xml`。若传 `image/png`/`image/jpeg`，会做
   * SVG → canvas → blob 转换（要求当前文档有 DOM）。
   */
  mimeType?: string;
  /** PNG/JPEG 质量 [0,1]，默认 0.92。 */
  quality?: number;
  /** 强制重新渲染，跳过缓存。 */
  force?: boolean;
  /** 透明背景。 */
  transparent?: boolean;
}

export interface ThumbnailAPI {
  /**
   * 推荐：把缩略图直接挂载到 host 元素上（矢量 SVG）。返回 handle，调用
   * `handle.destroy()` 卸载（销毁 backend）。
   *
   * host 应自带固定宽高（CSS `aspect-ratio: var(--ar)` 或类似），SVG 会 100%
   * 撑满 host。重复调用 mount 不会自动清理之前的 SVG —— 由调用方负责。
   */
  mount(
    host: HTMLElement,
    target: ThumbnailTarget,
    opts?: ThumbnailMountOptions,
  ): ThumbnailHandle;

  /** 返回 slide 的 SVG 字符串（同步）。 */
  toSvgString(target: ThumbnailTarget, opts?: ThumbnailMountOptions): string;
  /** 返回 SVG Blob（mime `image/svg+xml`）。 */
  toSvgBlob(target: ThumbnailTarget, opts?: ThumbnailMountOptions): Blob;
  /** 返回 SVG data URL。 */
  toDataUrl(target: ThumbnailTarget, opts?: ThumbnailMountOptions): string;

  /** @deprecated 改用 mount() 或 toSvgBlob()。返回 SVG Blob（mime image/svg+xml）。 */
  byVisibleIndex(visibleIndex: number, opts?: ThumbnailOptions): Promise<Blob>;
  /** @deprecated 改用 mount() 或 toSvgBlob()。 */
  byAbsoluteIndex(absoluteIndex: number, opts?: ThumbnailOptions): Promise<Blob>;
  /** @deprecated 改用 mount() 或 toSvgBlob()。 */
  byId(slideId: string, opts?: ThumbnailOptions): Promise<Blob>;
  /** @deprecated 改用 toDataUrl()。 */
  dataUrlByVisibleIndex(visibleIndex: number, opts?: ThumbnailOptions): Promise<string>;
  /** 清空缓存（字符串 / Blob / dataUrl 缓存）。 */
  clearCache(): void;
}

// ---------------------------------------------------------------------------
// UI 扩展
// ---------------------------------------------------------------------------

export interface PanelOptions {
  id?: string;
  title: string;
  render: (body: HTMLElement) => void;
  initialOpen?: boolean;
  /** 排序权重，越小越靠上；默认 100。 */
  order?: number;
}

export interface ToolbarButtonOptions {
  label: string;
  onClick: (e: MouseEvent) => void;
  tooltip?: string;
  position?: "start" | "end";
}

export interface OverlayOptions {
  /** Slide 内部坐标（与 OOXML 一致；非屏幕像素）。 */
  bbox?: { x: number; y: number; w: number; h: number };
  node: HTMLElement;
  zIndex?: number;
}

export interface UIHandle {
  remove(): void;
}

export interface PluginUIHost {
  addPanel(opts: PanelOptions): UIHandle;
  addToolbarButton(opts: ToolbarButtonOptions): UIHandle;
  addOverlay(opts: OverlayOptions): UIHandle;
  /** 在 player root 上直接 append；用于完全自定义布局。 */
  mount(node: HTMLElement): UIHandle;
  setDockOpen(open: boolean): void;
  toggleDock(): void;
  isDockOpen(): boolean;
  rootElement(): HTMLElement;
  stageElement(): HTMLElement;
}

// ---------------------------------------------------------------------------
// 播放器右键菜单
// ---------------------------------------------------------------------------
//
// 设计要点：
//   - 播放器内置一组「翻页 / 跳转 / 结束放映」项；插件可以通过
//     `ctx.contextMenu.addItem()` 贡献菜单项。
//   - 不维护层级菜单（PowerPoint 放映态也只是一层平铺 + 子分组）。所有项按
//     `group` 分组，同 group 项之间不加分隔线；不同 group 之间自动加一条
//     分隔线。
//   - `checked` / `disabled` 支持函数形式 —— 菜单每次打开时都重新求值，
//     允许 toggleable 项（例如「显示白板」勾选状态）。
//   - 排序：先按 `order`（默认 100），再按插入顺序稳定。

export type ContextMenuItemKind = "item" | "checkbox" | "separator";

export interface PlayerContextMenuItem {
  /** 可选 id，用于运行时移除单项（不传则自动生成）。 */
  id?: string;
  kind?: ContextMenuItemKind;
  /** 显示文本。`kind: "separator"` 时可省略。 */
  label?: string;
  /** 右侧灰色快捷键提示。放映时会按这个绑定键盘（无修饰键的单键 / ←→ / Esc / Home / End）。 */
  shortcut?: string;
  /** 排序权重，越小越靠上；默认 100。 */
  order?: number;
  /** 分组键，同 group 项不加分隔线；不同 group 间自动加一条分隔线。 */
  group?: string;
  /** checkbox 模式下的勾选状态，可传函数延迟求值。 */
  checked?: boolean | (() => boolean);
  /** 是否禁用，可传函数延迟求值。 */
  disabled?: boolean | (() => boolean);
  /**
   * 点击回调。第二个参数是触发右键的 MouseEvent（含 clientX / clientY 等）；
   * 大部分场景不需要，但白板这种「在点击位置开始绘制」的插件可能用到。
   */
  onClick?: (e?: MouseEvent) => void;
}

export interface PlayerContextMenuAPI {
  /** 注册一项。返回 handle，调用 `remove()` 移除。 */
  addItem(item: PlayerContextMenuItem): UIHandle;
  /** 编程式打开菜单（用于测试 / 自定义触发器）。 */
  open(x: number, y: number): void;
  /** 关闭已经打开的菜单（如有）。 */
  close(): void;
}

// ---------------------------------------------------------------------------
// 插件
// ---------------------------------------------------------------------------

export interface PluginContext {
  readonly presentation: PresentationInfo;
  readonly player: PlayerControlAPI;
  readonly events: PlayerEventBus;
  readonly ui: PluginUIHost;
  /** 当前 slide 的 shape 模型：查询 / 命中测试 / 显隐 / 触发动画。 */
  readonly scene: SceneAPI;
  readonly thumbnail: ThumbnailAPI;
  /** 播放器右键菜单管理：注册菜单项 / 编程式打开关闭。 */
  readonly contextMenu: PlayerContextMenuAPI;
  /** 同 mount 内全部插件共享的轻量 KV。 */
  readonly shared: Record<string, unknown>;
  /**
   * 宿主当前 UI 语言（来自 `mount({ locale })`，已归一，如 `"en"` / `"zh-CN"`）。
   * 插件应据此本地化自己渲染的可见文本（菜单项、工具栏按钮等）。
   */
  readonly locale: string;
  /**
   * 直播放映通道。未接入直播时 `attached()` 为 false，`send` 为空操作。
   * 任意插件可用同一通道双向同步状态（白板笔迹、激光点等）。
   */
  readonly live: PluginLiveAPI;
  log(...args: unknown[]): void;
}

export interface PluginLiveAPI {
  /** 当前是否挂了直播传输（主持或已准入的观众）。 */
  attached(): boolean;
  /**
   * 发给房间里其他人。`snap: true` 时网关会保留最近一份，供迟到观众回放。
   */
  send(data: unknown, opts?: { snap?: boolean }): void;
  /** 收到其他人的消息。返回取消订阅。 */
  on(fn: (data: unknown, meta: { from: string }) => void): () => void;
  /** 直播通道接通 / 断开。接通时插件应把当前状态 snap 出去。 */
  onAttach(fn: (attached: boolean) => void): () => void;
}

export type PluginCleanup = () => void;

export interface Plugin {
  id: string;
  name?: string;
  version?: string;
  activate(
    ctx: PluginContext,
  ): PluginCleanup | void | Promise<PluginCleanup | void>;
  deactivate?(): void;
}

// ---------------------------------------------------------------------------
// UI 主题选项（透传给 player.mount，让用户自定义内置 UI 外观）
// ---------------------------------------------------------------------------

/** Player 内置 plugin UI 的配置选项。透传给 mount。 */
export interface PluginUIOptions {
  /**
   * Headless 模式 — 完全不创建内置的 dock / toolbar 接收点。
   * `addPanel` / `addToolbarButton` 会自动 fallback 为 `ui.mount()` 创建的
   * 浮层容器（自由布局，由用户/插件自己负责样式）。
   */
  headless?: boolean;
  /** Dock 位置（默认 'right'）。 */
  dockPosition?: "left" | "right" | "top" | "bottom";
  /** Dock 宽度（水平 dock）或高度（垂直 dock）px。默认 320。 */
  dockSize?: number;
  /** 初始是否打开 dock；未指定时第一次 addPanel 自动打开。 */
  dockInitialOpen?: boolean;
  /** 主题模式（默认 dark）。 */
  themeMode?: "dark" | "light" | "auto";
  /**
   * 自定义 CSS 变量。会以 `--ppt-<key>: value` 形式注入到 host 元素的 style 上。
   * 支持的 key（见 SDK README）：
   *   dock-bg, dock-fg, dock-border, dock-radius,
   *   panel-bg, panel-head-bg, panel-head-fg, panel-divider,
   *   toolbar-btn-bg, toolbar-btn-fg, toolbar-btn-border,
   *   accent, font, font-size
   */
  cssVars?: Record<string, string>;
  /** 自定义 CSS 字符串。会以 <style> 形式插入，作用域为整个 host。 */
  customCss?: string;
  /** 加在 .ppt-host 上的额外 className（方便用户用自己的样式表覆盖）。 */
  hostClassName?: string;
}
