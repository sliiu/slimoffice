export interface ContextMenuItem {
    kind?: "sep";
    label?: string;
    shortcut?: string;
    disabled?: boolean;
    onClick?: () => void;
}
export interface ContextMenuHandle {
    el: HTMLDivElement;
    destroy: () => void;
}
export declare function showContextMenu(doc: Document, items: ContextMenuItem[], clientX: number, clientY: number): ContextMenuHandle;
