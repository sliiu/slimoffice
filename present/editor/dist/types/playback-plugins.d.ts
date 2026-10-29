import { type PluginChooserEntry, type PluginChooserLabels } from "./plugin-chooser.js";
export interface PlaybackPluginEntry {
    /** 稳定 id。官方插件以 `official:` 开头。 */
    id: string;
    /** 显示名。 */
    name: string;
    /** 一行描述。 */
    description?: string;
    origin?: "official" | "imported";
}
export interface PlaybackPluginPopoverOptions {
    entries: PlaybackPluginEntry[];
    selected: Set<string>;
    onChange: (next: Set<string>) => void;
    /** 标题文字（i18n）。 */
    title: string;
    /** 空态文字（i18n）。 */
    emptyText: string;
    labels?: PluginChooserLabels;
    onImport?: () => Promise<PluginChooserEntry | null>;
    onDelete?: (id: string) => Promise<boolean>;
}
export declare function openPlaybackPluginPopover(doc: Document, anchor: HTMLElement, opts: PlaybackPluginPopoverOptions): void;
