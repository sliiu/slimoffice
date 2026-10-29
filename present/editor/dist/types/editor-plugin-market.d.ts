import { type PluginChooserEntry, type PluginChooserLabels } from "./plugin-chooser.js";
export interface EditorPluginMarketEntry {
    id: string;
    name: string;
    description?: string;
    origin?: "official" | "imported";
}
export interface EditorPluginMarketPopoverOptions {
    entries: EditorPluginMarketEntry[];
    enabled: Set<string>;
    onChange: (next: Set<string>) => void;
    title: string;
    emptyText: string;
    labels?: PluginChooserLabels;
    onImport?: () => Promise<PluginChooserEntry | null>;
    onDelete?: (id: string) => Promise<boolean>;
}
export declare function openEditorPluginMarketPopover(doc: Document, anchor: HTMLElement, opts: EditorPluginMarketPopoverOptions): void;
