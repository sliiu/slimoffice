/**
 * L2 Layout + L3 Variant catalog.
 * Each entry is a named skeleton with slots. Inventing a layout/variant fails.
 */
import { type LayoutId, type AnyVariantId } from "./ids.js";
export type SlotKind = "text" | "image" | "rule" | "bar" | "surface";
export interface SlotDef {
    id: string;
    kind: SlotKind;
    required: boolean;
    /** Max characters for a single text slot. */
    maxChars?: number;
    /** Max items when the slot is a list. */
    maxItems?: number;
    /** Max lines for a text slot. */
    maxLines?: number;
}
export interface LayoutDef {
    id: LayoutId;
    variant: AnyVariantId;
    slots: SlotDef[];
}
export declare function listLayoutCatalog(): LayoutDef[];
export declare function resolveLayout(layout: string, variant: string): LayoutDef;
export declare function imageSlotsAllowed(layout: LayoutId, variant: string): boolean;
