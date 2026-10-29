import type { PluginUIHost, PluginUIOptions } from "./plugins.js";
interface UIHostDeps {
    doc: Document;
    /** 顶层 host 容器（.ppt-host）。 */
    host: HTMLElement;
    /** 控制栏（.ppt-controls），可能为 null。 */
    controls: HTMLElement | null;
    /** stage（.ppt-stage），插件 overlay 跟它共享 transform。 */
    stage: HTMLElement;
    /** UI 配置。 */
    options: PluginUIOptions;
}
export declare function createPluginUI(deps: UIHostDeps): {
    ui: PluginUIHost;
    destroy: () => void;
};
export {};
