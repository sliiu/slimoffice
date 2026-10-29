import type { EditCommand, Presentation, SmartArtItem, SmartArtLayoutKind } from "@sliiu/present-core";
export declare class RebuildSmartArtCmd implements EditCommand {
    private readonly slideIdx;
    private readonly groupId;
    private readonly nextItems;
    private readonly prevItems;
    private readonly nextLayout?;
    private readonly prevLayout?;
    readonly label: string;
    constructor(slideIdx: number, groupId: string, nextItems: SmartArtItem[], prevItems: SmartArtItem[], nextLayout?: SmartArtLayoutKind | undefined, prevLayout?: SmartArtLayoutKind | undefined);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class UpdateSmartArtItemsCmd implements EditCommand {
    private readonly slideIdx;
    private readonly groupId;
    private readonly nextItems;
    private readonly prevItems;
    readonly label = "Edit diagram items";
    constructor(slideIdx: number, groupId: string, nextItems: SmartArtItem[], prevItems: SmartArtItem[]);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class AddSmartArtItemCmd implements EditCommand {
    private readonly slideIdx;
    private readonly groupId;
    private readonly snapshot;
    readonly label = "Add diagram item";
    constructor(slideIdx: number, groupId: string, snapshot: SmartArtItem[]);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class DuplicateSmartArtItemCmd implements EditCommand {
    private readonly slideIdx;
    private readonly groupId;
    private readonly itemIndex;
    private readonly snapshot;
    readonly label = "Duplicate diagram item";
    constructor(slideIdx: number, groupId: string, itemIndex: number, snapshot: SmartArtItem[]);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class ClearSmartArtPicturesCmd implements EditCommand {
    private readonly slideIdx;
    private readonly groupId;
    private readonly snapshot;
    readonly label = "Clear diagram pictures";
    constructor(slideIdx: number, groupId: string, snapshot: SmartArtItem[]);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class RemoveSmartArtItemCmd implements EditCommand {
    private readonly slideIdx;
    private readonly groupId;
    private readonly snapshot;
    private readonly itemIndex?;
    readonly label = "Remove diagram item";
    constructor(slideIdx: number, groupId: string, snapshot: SmartArtItem[], itemIndex?: number | undefined);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class MoveSmartArtItemCmd implements EditCommand {
    private readonly slideIdx;
    private readonly groupId;
    private readonly itemIndex;
    private readonly direction;
    private readonly snapshot;
    readonly label = "Reorder diagram item";
    constructor(slideIdx: number, groupId: string, itemIndex: number, direction: -1 | 1, snapshot: SmartArtItem[]);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class SetSmartArtItemLevelCmd implements EditCommand {
    private readonly slideIdx;
    private readonly groupId;
    private readonly itemIndex;
    private readonly delta;
    private readonly snapshot;
    readonly label = "Change diagram level";
    constructor(slideIdx: number, groupId: string, itemIndex: number, delta: -1 | 1, snapshot: SmartArtItem[]);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class SetSmartArtLayoutCmd implements EditCommand {
    private readonly slideIdx;
    private readonly groupId;
    private readonly layout;
    private readonly prevLayout;
    private readonly itemsSnapshot;
    readonly label = "Change diagram layout";
    constructor(slideIdx: number, groupId: string, layout: SmartArtLayoutKind, prevLayout: SmartArtLayoutKind, itemsSnapshot: SmartArtItem[]);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
/** 将文本框（含 bullets 多段）替换为 SmartArt group。 */
export declare class ConvertToSmartArtCmd implements EditCommand {
    private readonly slideIdx;
    private readonly shapeId;
    private readonly layout?;
    readonly label = "Convert to diagram";
    private removed?;
    private layerIdx?;
    private groupId?;
    /** Populated on apply for collab wire (full group + placement). */
    private inserted?;
    constructor(slideIdx: number, shapeId: string, layout?: SmartArtLayoutKind | undefined);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
