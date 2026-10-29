import type { EditCommand, Presentation, Slide } from "@sliiu/present-core";
export declare function reindexPresentationSlides(pres: Presentation): void;
export declare function newSlideId(): string;
/** 将 `from` 位置的 slide 插入到 `dropBefore` 之前；无需移动时返回 null。 */
export declare function computeSlideMoveTarget(from: number, dropBefore: number): number | null;
/** slide 列表重排后，把单个下标映射到新位置。 */
export declare function remapIndexAfterSlideMove(from: number, to: number, idx: number): number;
/** 批量重映射 slide 多选集合。 */
export declare function remapSlideIndexSetAfterMove(from: number, to: number, indices: ReadonlySet<number>): Set<number>;
/** 在指定位置插入一张幻灯片。 */
export declare class InsertSlideCmd implements EditCommand {
    private idx;
    private slide;
    readonly label = "Insert slide";
    private inserted?;
    constructor(idx: number, slide: Slide);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class DeleteSlideCmd implements EditCommand {
    private idx;
    readonly label = "Delete slide";
    private removed?;
    private removedComments;
    constructor(idx: number);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
/** 批量删除（单次 undo）；indices 应为降序，调用方负责排序。 */
export declare class DeleteSlidesCmd implements EditCommand {
    readonly label = "Delete slides";
    private removed?;
    private removedComments;
    constructor(indices: number[]);
    private readonly indices;
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class MoveSlideCmd implements EditCommand {
    private from;
    private to;
    readonly label = "Move slide";
    private done?;
    constructor(from: number, to: number);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class DuplicateSlideCmd implements EditCommand {
    private idx;
    readonly label = "Duplicate slide";
    private inserted?;
    constructor(idx: number);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
