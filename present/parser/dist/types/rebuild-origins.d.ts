import type { Presentation } from "@sliiu/present-core";
/**
 * 用 pres.__source 的原始字节重建并嫁接 round-trip 基线（__origin）到 pres 上。
 * 在 reattachPresentationSource 之后调用。返回是否成功（无 __source 或重解析失败时为 false）。
 */
export declare function rebuildOriginsFromSource(pres: Presentation): boolean;
