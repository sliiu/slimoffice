import type { EditCommand, Presentation, ShowProperties, ViewGuides } from "@sliiu/present-core";
/** Replace `pres.viewGuides` (undoable). */
export declare class SetViewGuidesCmd implements EditCommand {
    private next;
    readonly label = "View guides";
    private prev?;
    private captured;
    constructor(next: ViewGuides | undefined);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
/** Replace `pres.showPr` (undoable) — ECMA-376 `p:showPr` slideshow settings. */
export declare class SetShowPropertiesCmd implements EditCommand {
    private next;
    readonly label = "Show settings";
    private prev?;
    private captured;
    constructor(next: ShowProperties | undefined);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
