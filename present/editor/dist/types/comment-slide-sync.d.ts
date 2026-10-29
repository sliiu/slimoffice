import type { DeckComment, Presentation } from "@sliiu/present-core";
/** 删除一页后：移除该页批注，其后页批注 slideIndex -1。 */
export declare function remapCommentsAfterSlideDelete(pres: Presentation, deletedIndex: number): DeckComment[];
/** 撤销删除页：在 idx 插入页后，恢复 removed 并上移其后批注索引。 */
export declare function restoreCommentsAfterSlideInsert(pres: Presentation, insertedIndex: number, restored: DeckComment[]): void;
/** 在 at 插入空白页：at 及之后批注 slideIndex +1。 */
export declare function remapCommentsAfterSlideInsert(pres: Presentation, at: number): void;
/** 撤销插入页：移除 at 页批注并下移其后索引。 */
export declare function remapCommentsAfterSlideRemoveAt(pres: Presentation, at: number): void;
/** 批量删除（indices 降序）：移除对应页批注并重映射索引。 */
export declare function remapCommentsAfterSlidesDelete(pres: Presentation, indicesDesc: readonly number[]): Map<number, DeckComment[]>;
/** 撤销批量删除：按升序插回各页批注并恢复索引。 */
export declare function restoreCommentsAfterSlidesInsert(pres: Presentation, removedByIndex: Map<number, DeckComment[]>): void;
/** 移动一页后重映射批注 slideIndex。 */
export declare function remapCommentsAfterSlideMove(pres: Presentation, from: number, to: number): void;
