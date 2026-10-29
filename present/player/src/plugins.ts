// 播放器插件系统 — 运行时实现
//
// 所有对外类型（Plugin / PluginContext / PluginUIHost / 事件类型 / 缩略图 / UI 选项等）
// 都从 `@ppt/plugin-sdk` 导入并 re-export，保证 SDK 和 player 用同一份契约。
// 本文件只负责 player-side 的 EventBus / PluginManager / PresentationInfo 构造。

import type { Presentation, Slide } from "@ppt/core";
import type {
  Plugin,
  PlayerEventBus,
  PlayerEventMap,
  PlayerEventType,
  PluginContext,
  PluginLiveAPI,
  PluginUIHost,
  PresentationInfo,
  SlideChangeEvent,
  SlideInfo,
  UIHandle,
} from "@ppt/plugin-sdk";

// Re-export 公共类型，方便 @ppt/player 自身的消费者直接拿（ESM 用户既可以从
// @ppt/plugin-sdk 也可以从 @ppt/player 取，保持向后兼容）。
export type {
  ContextMenuItemKind,
  EventUnsubscribe,
  OverlayOptions,
  PanelOptions,
  PlayerContextMenuAPI,
  PlayerContextMenuItem,
  PlayerControlAPI,
  PlayerEventBus,
  PlayerEventMap,
  PlayerEventType,
  Plugin,
  PluginCleanup,
  PluginContext,
  PluginLiveAPI,
  PluginUIHost,
  PluginUIOptions,
  PresentationInfo,
  SceneAPI,
  ShapeInfo,
  SlideChangeEvent,
  SlideInfo,
  StepChangeEvent,
  ThumbnailAPI,
  ThumbnailHandle,
  ThumbnailMountOptions,
  ThumbnailOptions,
  ThumbnailTarget,
  ToolbarButtonOptions,
  UIHandle,
} from "@ppt/plugin-sdk";

// ---------------------------------------------------------------------------
// EventBus
// ---------------------------------------------------------------------------

export class EventBus implements PlayerEventBus {
  private listeners = new Map<PlayerEventType, Set<(p: unknown) => void>>();
  private currentSlideSnapshot: SlideChangeEvent | null = null;

  on<E extends PlayerEventType>(
    event: E,
    cb: (payload: PlayerEventMap[E]) => void,
  ): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(cb as (p: unknown) => void);
    if (event === "slidechange" && this.currentSlideSnapshot) {
      (cb as (p: SlideChangeEvent) => void)(this.currentSlideSnapshot);
    }
    return (): void => {
      this.listeners.get(event)?.delete(cb as (p: unknown) => void);
    };
  }

  off<E extends PlayerEventType>(
    event: E,
    cb: (payload: PlayerEventMap[E]) => void,
  ): void {
    this.listeners.get(event)?.delete(cb as (p: unknown) => void);
  }

  fire<E extends PlayerEventType>(event: E, payload: PlayerEventMap[E]): void {
    if (event === "slidechange") {
      this.currentSlideSnapshot = payload as SlideChangeEvent;
    }
    const set = this.listeners.get(event);
    if (!set) return;
    for (const cb of [...set]) {
      try {
        (cb as (p: unknown) => void)(payload);
      } catch (e) {
        console.error(`[ppt-player] event '${event}' listener threw`, e);
      }
    }
  }

  emitCurrentSlide(): void {
    if (!this.currentSlideSnapshot) return;
    const set = this.listeners.get("slidechange");
    if (!set) return;
    for (const cb of [...set]) {
      try {
        (cb as (p: SlideChangeEvent) => void)(this.currentSlideSnapshot);
      } catch (e) {
        console.error("[ppt-player] emitCurrentSlide listener threw", e);
      }
    }
  }

  clear(): void {
    this.listeners.clear();
    this.currentSlideSnapshot = null;
  }
}

// ---------------------------------------------------------------------------
// Presentation → PresentationInfo
// ---------------------------------------------------------------------------

export function buildPresentationInfo(pres: Presentation): PresentationInfo {
  const visibleOrder: number[] = [];
  const slides: SlideInfo[] = pres.slides.map((s, i) => {
    const show = s.show !== false;
    if (show) visibleOrder.push(i);
    return slideToInfo(s, i, -1);
  });
  for (let v = 0; v < visibleOrder.length; v++) {
    const absI = visibleOrder[v]!;
    slides[absI]!.visibleIndex = v;
  }
  return {
    id: pres.id,
    size: { width: pres.size.width, height: pres.size.height },
    title:
      typeof pres.meta?.title === "string" ? (pres.meta.title as string) : undefined,
    slides,
    visibleOrder,
    meta: pres.meta ? { ...pres.meta } : undefined,
  };
}

function slideToInfo(s: Slide, index: number, visibleIndex: number): SlideInfo {
  const totalAnimationSteps = countMainSteps(s);
  return {
    id: s.id,
    name: s.name,
    index,
    visibleIndex,
    show: s.show !== false,
    hasAnimations: totalAnimationSteps > 0,
    totalAnimationSteps,
    notes: s.notes,
    transition: s.transition
      ? { kind: s.transition.kind, duration: s.transition.duration }
      : undefined,
  };
}

function countMainSteps(s: Slide): number {
  const timing = s.ooxmlTiming as unknown as
    | {
        tnLst?: Array<{ trigger?: string; childTnLst?: unknown[] }>;
      }
    | undefined;
  if (!timing) return 0;
  if (Array.isArray(timing.tnLst)) return timing.tnLst.length;
  return 1;
}

// ---------------------------------------------------------------------------
// PluginManager
// ---------------------------------------------------------------------------

interface ActivePluginRecord {
  plugin: Plugin;
  cleanups: Array<() => void>;
}

export class PluginManager {
  private records = new Map<string, ActivePluginRecord>();
  private ctxFactory: (pluginId: string) => PluginContext;
  private uiHandlesByPlugin = new Map<string, Set<UIHandle>>();

  constructor(ctxFactory: (pluginId: string) => PluginContext) {
    this.ctxFactory = ctxFactory;
  }

  async register(plugin: Plugin): Promise<void> {
    if (!plugin || !plugin.id) {
      throw new Error("[ppt-player] plugin.id is required");
    }
    if (this.records.has(plugin.id)) {
      console.warn(`[ppt-player] re-registering plugin '${plugin.id}', unloading previous`);
      this.unregister(plugin.id);
    }
    const ctx = this.ctxFactory(plugin.id);
    const trackedUi = this.wrapUiHost(plugin.id, ctx.ui);
    const trackedCtx: PluginContext = { ...ctx, ui: trackedUi };
    const cleanups: Array<() => void> = [];
    try {
      const ret = await plugin.activate(trackedCtx);
      if (typeof ret === "function") cleanups.push(ret);
    } catch (e) {
      console.error(`[ppt-player] plugin '${plugin.id}' activate threw`, e);
      this.disposeUiHandles(plugin.id);
      return;
    }
    this.records.set(plugin.id, { plugin, cleanups });
  }

  registerAll(plugins: Plugin[] | undefined): Promise<void> {
    if (!plugins || plugins.length === 0) return Promise.resolve();
    return Promise.all(plugins.map((p) => this.register(p))).then(() => undefined);
  }

  unregister(id: string): boolean {
    const rec = this.records.get(id);
    if (!rec) return false;
    this.records.delete(id);
    for (const c of rec.cleanups) {
      try {
        c();
      } catch (e) {
        console.error(`[ppt-player] plugin '${id}' cleanup threw`, e);
      }
    }
    try {
      rec.plugin.deactivate?.();
    } catch (e) {
      console.error(`[ppt-player] plugin '${id}' deactivate threw`, e);
    }
    this.disposeUiHandles(id);
    return true;
  }

  destroyAll(): void {
    for (const id of [...this.records.keys()]) this.unregister(id);
  }

  list(): string[] {
    return [...this.records.keys()];
  }

  has(id: string): boolean {
    return this.records.has(id);
  }

  private wrapUiHost(pluginId: string, ui: PluginUIHost): PluginUIHost {
    const track = (h: UIHandle): UIHandle => {
      let set = this.uiHandlesByPlugin.get(pluginId);
      if (!set) {
        set = new Set();
        this.uiHandlesByPlugin.set(pluginId, set);
      }
      set.add(h);
      return {
        remove: () => {
          try {
            h.remove();
          } finally {
            this.uiHandlesByPlugin.get(pluginId)?.delete(h);
          }
        },
      };
    };
    return {
      addPanel: (o) => track(ui.addPanel(o)),
      addToolbarButton: (o) => track(ui.addToolbarButton(o)),
      addOverlay: (o) => track(ui.addOverlay(o)),
      mount: (n) => track(ui.mount(n)),
      setDockOpen: (v) => ui.setDockOpen(v),
      toggleDock: () => ui.toggleDock(),
      isDockOpen: () => ui.isDockOpen(),
      rootElement: () => ui.rootElement(),
      stageElement: () => ui.stageElement(),
    };
  }

  private disposeUiHandles(pluginId: string): void {
    const set = this.uiHandlesByPlugin.get(pluginId);
    if (!set) return;
    for (const h of [...set]) {
      try {
        h.remove();
      } catch {
        // ignore
      }
    }
    this.uiHandlesByPlugin.delete(pluginId);
  }
}
