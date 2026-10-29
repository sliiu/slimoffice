import type { EditCommand, Presentation } from "@sliiu/present-core";
import { setEffectProperty, type EffectPath, type EffectTrigger, type InsertEffectArgs } from "./store.js";
export declare class AddAnimEffectCmd implements EditCommand {
    private slideIdx;
    private args;
    readonly label = "Add Animation";
    private before;
    constructor(slideIdx: number, args: InsertEffectArgs);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class RemoveAnimEffectCmd implements EditCommand {
    private slideIdx;
    private path;
    readonly label = "Remove Animation";
    private before;
    constructor(slideIdx: number, path: EffectPath);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class MoveAnimEffectCmd implements EditCommand {
    private slideIdx;
    private path;
    private newIndex;
    readonly label = "Reorder Animation";
    private before;
    constructor(slideIdx: number, path: EffectPath, newIndex: number);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class SetAnimEffectPropCmd implements EditCommand {
    private slideIdx;
    private path;
    private patch;
    readonly label = "Update Animation";
    private before;
    constructor(slideIdx: number, path: EffectPath, patch: Parameters<typeof setEffectProperty>[2]);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class SetAnimTriggerCmd extends SetAnimEffectPropCmd {
    constructor(slideIdx: number, path: EffectPath, trigger: EffectTrigger);
}
export declare class CopyShapeAnimationsCmd implements EditCommand {
    private slideIdx;
    private sourceShapeId;
    private targetShapeId;
    readonly label = "Animation painter";
    private before;
    constructor(slideIdx: number, sourceShapeId: string, targetShapeId: string);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
