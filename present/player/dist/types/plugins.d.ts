import type { Presentation } from "@sliiu/present-core";
import type { Plugin, PlayerEventBus, PlayerEventMap, PlayerEventType, PluginContext, PresentationInfo } from "@sliiu/present-plugin-sdk";
export type { ContextMenuItemKind, EventUnsubscribe, OverlayOptions, PanelOptions, PlayerContextMenuAPI, PlayerContextMenuItem, PlayerControlAPI, PlayerEventBus, PlayerEventMap, PlayerEventType, Plugin, PluginCleanup, PluginContext, PluginLiveAPI, PluginUIHost, PluginUIOptions, PresentationInfo, SceneAPI, ShapeInfo, SlideChangeEvent, SlideInfo, StepChangeEvent, ThumbnailAPI, ThumbnailHandle, ThumbnailMountOptions, ThumbnailOptions, ThumbnailTarget, ToolbarButtonOptions, UIHandle, } from "@sliiu/present-plugin-sdk";
export declare class EventBus implements PlayerEventBus {
    private listeners;
    private currentSlideSnapshot;
    on<E extends PlayerEventType>(event: E, cb: (payload: PlayerEventMap[E]) => void): () => void;
    off<E extends PlayerEventType>(event: E, cb: (payload: PlayerEventMap[E]) => void): void;
    fire<E extends PlayerEventType>(event: E, payload: PlayerEventMap[E]): void;
    emitCurrentSlide(): void;
    clear(): void;
}
export declare function buildPresentationInfo(pres: Presentation): PresentationInfo;
export declare class PluginManager {
    private records;
    private ctxFactory;
    private uiHandlesByPlugin;
    constructor(ctxFactory: (pluginId: string) => PluginContext);
    register(plugin: Plugin): Promise<void>;
    registerAll(plugins: Plugin[] | undefined): Promise<void>;
    unregister(id: string): boolean;
    destroyAll(): void;
    list(): string[];
    has(id: string): boolean;
    private wrapUiHost;
    private disposeUiHandles;
}
