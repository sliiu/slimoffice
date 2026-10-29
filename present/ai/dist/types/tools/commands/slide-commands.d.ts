import { type EditCommand, type Presentation } from "@sliiu/present-core";
import { type SlideSpec } from "../../generate/compile/layouts.js";
export { ApplyCustomThemeCmd, ApplyThemeCmd, type ApplyCustomThemeOpts, type ApplyThemeOpts, } from "@sliiu/present-themes";
export { DeleteSlideCmd, DeleteSlidesCmd, DuplicateSlideCmd, InsertSlideCmd, MoveSlideCmd, } from "@sliiu/present-editor/commands";
export declare class CreateSlideFromSpecCmd implements EditCommand {
    private idx;
    private spec;
    private themeId;
    readonly label = "AI: Create slide";
    private inserted?;
    constructor(idx: number, spec: SlideSpec, themeId: string | undefined);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class SetSlideNameCmd implements EditCommand {
    private idx;
    private next;
    readonly label = "AI: Rename slide";
    private prev?;
    constructor(idx: number, next: string);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class SetSlideNotesCmd implements EditCommand {
    private idx;
    private next;
    readonly label = "AI: Set notes";
    private prev?;
    constructor(idx: number, next: string);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class ReplaceTextCmd implements EditCommand {
    private slideIdx;
    private shapeId;
    private next;
    readonly label = "AI: Replace text";
    private prev?;
    constructor(slideIdx: number, shapeId: string, next: string[]);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
