import type { PlayerContextMenuAPI, PlayerContextMenuItem } from "@sliiu/present-plugin-sdk";
export interface ContextMenuManagerDeps {
    doc: Document;
    /** 监听右键的元素（一般是 stage）。 */
    trigger: HTMLElement;
    /** 菜单挂载的容器（一般是 host，使全屏下也可见）。 */
    host: HTMLElement;
    /** 是否启用（false 时所有 API 仍可调用但右键不会弹出菜单）。 */
    enabled?: boolean;
}
export interface ContextMenuManager {
    api: PlayerContextMenuAPI;
    /** 注册内置项（不计入插件 UIHandle 跟踪）。 */
    addBuiltinItem(item: PlayerContextMenuItem): void;
    /** 按菜单项 shortcut 触发 onClick。命中则返回 true。 */
    invokeShortcut(e: KeyboardEvent): boolean;
    destroy(): void;
}
export declare function createContextMenuManager(deps: ContextMenuManagerDeps): ContextMenuManager;
