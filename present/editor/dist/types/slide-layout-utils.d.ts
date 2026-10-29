import type { Layer, Presentation, Shape, Slide, SlideLayout, SlideMaster } from "@sliiu/present-core";
export declare function findMainLayer(slide: Slide): Layer | undefined;
export declare function resolveSlideMaster(pres: Presentation, slide: Slide): SlideMaster | undefined;
export declare function resolveSlideLayout(pres: Presentation, slide: Slide): SlideLayout | undefined;
export interface LayoutListEntry {
    masterId: string;
    layoutId: string;
    name: string;
    type?: string;
}
export declare function listLayoutsForSlide(pres: Presentation, slide: Slide): LayoutListEntry[];
/** Clone placeholder shapes from a layout with fresh ids (for slide reset / layout switch). */
export declare function cloneLayoutPlaceholders(layout: SlideLayout): Shape[];
export declare function replaceSlideMainShapes(slide: Slide, shapes: Shape[]): void;
export declare function syncRawMainShapes(slide: Slide, shapes: Shape[]): void;
