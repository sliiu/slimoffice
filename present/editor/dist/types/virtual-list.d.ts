/** Decks larger than this use windowed thumbnail / sorter rendering. */
export declare const VIRTUAL_LIST_THRESHOLD = 40;
export interface VirtualListHandle {
    refresh(): void;
    scrollToIndex(index: number, align?: "start" | "center" | "end" | "nearest"): void;
    destroy(): void;
}
/**
 * Vertical virtual list: only mounts row DOM for the visible scroll range (+ overscan).
 */
export declare function createVirtualList(opts: {
    scrollRoot: HTMLElement;
    container: HTMLElement;
    count: number;
    estimateSize: (index: number) => number;
    overscan?: number;
    rowTag?: keyof HTMLElementTagNameMap;
    render: (index: number, row: HTMLElement) => void | (() => void);
}): VirtualListHandle;
export interface VirtualGridHandle {
    refresh(): void;
    scrollToIndex(itemIndex: number, align?: "start" | "center" | "end" | "nearest"): void;
    destroy(): void;
}
/**
 * Grid virtual list (fixed row height). `itemCount` cells laid out in `columnCount` columns.
 */
export declare function createVirtualGrid(opts: {
    scrollRoot: HTMLElement;
    container: HTMLElement;
    itemCount: number;
    columnCount: number;
    rowHeight: number;
    gap: number;
    overscan?: number;
    render: (itemIndex: number, cell: HTMLElement) => void | (() => void);
}): VirtualGridHandle;
export declare function gridColumnCount(containerWidth: number, minCellWidth: number, gap: number): number;
