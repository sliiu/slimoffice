export interface PluginChooserEntry {
    id: string;
    name: string;
    description?: string;
    origin?: "official" | "imported";
}
export interface PluginChooserLabels {
    official: string;
    imported: string;
    import: string;
    delete: string;
    privateNote: string;
    empty: string;
}
export interface PluginChooserOptions {
    entries: PluginChooserEntry[];
    enabled: Set<string>;
    onChange: (next: Set<string>) => void;
    labels?: PluginChooserLabels;
    onImport?: () => Promise<PluginChooserEntry | null>;
    onDelete?: (id: string) => Promise<boolean>;
}
export declare function appendPluginChooser(panel: HTMLElement, opts: PluginChooserOptions): void;
