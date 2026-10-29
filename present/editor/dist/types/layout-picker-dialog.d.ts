import type { LayoutListEntry } from "./slide-layout-utils.js";
export declare function openLayoutPickerDialog(doc: Document, layouts: LayoutListEntry[], current: {
    masterId: string;
    layoutId: string;
} | undefined, onPick: (entry: LayoutListEntry) => void): void;
