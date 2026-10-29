import type { Presentation, PresentationSource } from "@sliiu/present-core";
export interface ReattachOptions {
    /**
     * 持久化时记录的「pres.slides[i] → 原 slide part 路径」映射（新增 slide 为 null）。
     * 没有它时只能按下标猜 `slide{i+1}.xml` —— 一旦用户删页 / 重排后再从缓存恢复，
     * index 猜测会把 slide 挂到**别人的** part 上：脏判定错位、rebuildOrigins 嫁接错基线，
     * 保存时 A 页的编辑写进 B 页。调用方（playground local-store）应尽量传入。
     */
    slidePartPaths?: Array<string | null | undefined>;
}
/**
 * 从 IndexedDB 恢复的 Presentation 没有非可枚举 `__source`。
 * 把持久化的 archive 字节重新挂回去，并补全 slide/master/layout 的 partPath，
 * 让 writePptx 能继续走 round-trip patch（而不是 from-scratch 丢动画/母版细节）。
 *
 * bgSnapshot / themeSnapshot：若 record 里带了 snapshot 就用；否则留空 → patch 阶段
 * 会把当前内存 background/theme 写回（正确性优先于字节级保留）。
 */
export declare function reattachPresentationSource(pres: Presentation, source: PresentationSource, opts?: ReattachOptions): void;
