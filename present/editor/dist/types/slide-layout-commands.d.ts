import type { EditCommand, Presentation, SlideLayoutRef } from "@sliiu/present-core";
/** Switch the current slide to another master layout and reset placeholders. */
export declare class ApplySlideLayoutCmd implements EditCommand {
    private slideIdx;
    private next;
    readonly label = "Apply layout";
    private prevLayoutRef?;
    private prevShapes?;
    constructor(slideIdx: number, next: SlideLayoutRef);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
/** Reset slide placeholders to the current layout defaults; removes extra shapes. */
export declare class ResetSlideToLayoutCmd implements EditCommand {
    private slideIdx;
    readonly label = "Reset layout";
    private prevShapes?;
    constructor(slideIdx: number);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
