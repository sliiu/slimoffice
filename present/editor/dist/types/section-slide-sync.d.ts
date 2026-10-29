import type { Presentation } from "@sliiu/present-core";
/** 删除一页后：移除该页节标题，其后节 startIndex -1。 */
export declare function remapSectionsAfterSlideDelete(pres: Presentation, deletedIndex: number): void;
/** 批量删除后：移除落在删除索引上的节，并递减其后 startIndex。 */
export declare function remapSectionsAfterSlidesDelete(pres: Presentation, deletedIndices: readonly number[]): void;
/** 在 at 插入页：at 及之后节 startIndex +1。 */
export declare function remapSectionsAfterSlideInsert(pres: Presentation, at: number): void;
/** 撤销插入：at 及之后节 startIndex -1。 */
export declare function remapSectionsAfterSlideRemoveAt(pres: Presentation, at: number): void;
/** 单页移动后重映射节 startIndex。 */
export declare function remapSectionsAfterSlideMove(pres: Presentation, from: number, to: number): void;
