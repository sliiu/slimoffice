import type { EditCommand, HeaderFooter, Paint, Presentation, Shape } from "@sliiu/present-core";
export declare class SetSlideLayoutRefCmd implements EditCommand {
    private slideIdx;
    private next;
    readonly label = "Switch Layout";
    private prev?;
    constructor(slideIdx: number, next: {
        masterId: string;
        layoutId: string;
    } | undefined);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class AddLayoutCmd implements EditCommand {
    private masterId;
    private spec;
    readonly label = "Add Layout";
    private inserted?;
    constructor(masterId: string, spec: {
        id: string;
        name: string;
        type?: string;
        shapes?: Shape[];
        background?: Paint;
        hf?: HeaderFooter;
        pos?: number;
    });
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class DeleteLayoutCmd implements EditCommand {
    private masterId;
    private layoutId;
    readonly label = "Delete Layout";
    private removed?;
    constructor(masterId: string, layoutId: string);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class RenameLayoutCmd implements EditCommand {
    private masterId;
    private layoutId;
    private nextName;
    readonly label = "Rename Layout";
    private prev?;
    constructor(masterId: string, layoutId: string, nextName: string);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class DuplicateMasterCmd implements EditCommand {
    private masterId;
    private newId;
    readonly label = "Duplicate Master";
    private inserted?;
    constructor(masterId: string, newId: string);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class SetPlaceholderTypeCmd implements EditCommand {
    private masterId;
    private layoutId;
    private shapeId;
    private nextType;
    /** OOXML 中 placeholder idx 是字符串属性（"0".."10"），保持原类型避免转换失误。 */
    private nextIdx?;
    readonly label = "Set Placeholder Type";
    private prev?;
    constructor(masterId: string, layoutId: string | undefined, shapeId: string, nextType: string, 
    /** OOXML 中 placeholder idx 是字符串属性（"0".."10"），保持原类型避免转换失误。 */
    nextIdx?: string | number | undefined);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
    private findShape;
}
export type TxStyleScope = "title" | "body" | "other";
export type LevelStylePatch = {
    pPr?: import("@sliiu/present-core").TextParagraphDefaults;
    rPr?: import("@sliiu/present-core").TextRunDefaults;
    bullet?: import("@sliiu/present-core").BulletDef;
};
export declare class SetMasterTxStylesCmd implements EditCommand {
    private masterId;
    private scope;
    private level;
    private patch;
    readonly label = "Set Master Text Styles";
    private prev?;
    constructor(masterId: string, scope: TxStyleScope, level: number, patch: LevelStylePatch);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
