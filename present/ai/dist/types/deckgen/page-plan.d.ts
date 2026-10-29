/**
 * Assign Layout + Variant from the whitelist only.
 * Inventing a layout is a hard fail.
 */
import { type LayoutId, type AnyVariantId } from "./ids.js";
import type { NarrativeOutline } from "./narrative.js";
export interface SlidePlan {
    layout: LayoutId;
    variant: AnyVariantId;
    title?: string;
    subtitle?: string;
    meta?: string;
    number?: string;
    claim?: string;
    note?: string;
    items?: string[];
    leftTitle?: string;
    leftItems?: string[];
    rightTitle?: string;
    rightItems?: string[];
    imageSrc?: string;
    value?: string;
    label?: string;
    kpis?: Array<{
        value: string;
        label: string;
    }>;
    next?: string;
}
export declare function assignPagePlan(outline: NarrativeOutline): SlidePlan[];
/** Apply slot caps and split overflow into extra whitelist pages. Never shrink type. */
export declare function enforceSlotCaps(plans: SlidePlan[]): SlidePlan[];
