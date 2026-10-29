"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reattachPresentationSource = reattachPresentationSource;
/**
 * 从 IndexedDB 恢复的 Presentation 没有非可枚举 `__source`。
 * 把持久化的 archive 字节重新挂回去，并补全 slide/master/layout 的 partPath，
 * 让 writePptx 能继续走 round-trip patch（而不是 from-scratch 丢动画/母版细节）。
 *
 * bgSnapshot / themeSnapshot：若 record 里带了 snapshot 就用；否则留空 → patch 阶段
 * 会把当前内存 background/theme 写回（正确性优先于字节级保留）。
 */
function reattachPresentationSource(pres, source, opts = {}) {
    Object.defineProperty(pres, "__source", {
        value: source,
        enumerable: false,
        configurable: true,
        writable: true,
    });
    const explicit = opts.slidePartPaths;
    const useExplicit = Array.isArray(explicit) && explicit.length === pres.slides.length;
    pres.slides.forEach((slide, i) => {
        const partPath = useExplicit ? explicit[i] : `ppt/slides/slide${i + 1}.xml`;
        // 显式映射里的 null = 该 slide 是新增的（原 archive 无对应 part）→ 不挂 __source，
        // round-trip 的 slide 列表对齐阶段会为它新建 part。
        if (!partPath)
            return;
        if (!source.files.has(partPath))
            return;
        const prev = slide.__source;
        Object.defineProperty(slide, "__source", {
            value: {
                partPath,
                rawMainShapes: prev?.rawMainShapes,
                bgSnapshot: prev?.bgSnapshot,
                timingSnapshot: prev?.timingSnapshot,
                transitionSnapshot: prev?.transitionSnapshot,
                notesSnapshot: prev?.notesSnapshot,
                notesPartPath: prev?.notesPartPath,
            },
            enumerable: false,
            configurable: true,
            writable: true,
        });
    });
    for (const master of pres.masters ?? []) {
        const partPath = `ppt/slideMasters/${master.id}.xml`;
        if (!source.files.has(partPath))
            continue;
        Object.defineProperty(master, "__source", {
            value: { partPath, bgSnapshot: master.__source?.bgSnapshot },
            enumerable: false,
            configurable: true,
            writable: true,
        });
        for (const layout of master.layouts ?? []) {
            const layoutPath = `ppt/slideLayouts/${layout.id}.xml`;
            if (!source.files.has(layoutPath))
                continue;
            Object.defineProperty(layout, "__source", {
                value: { partPath: layoutPath, bgSnapshot: layout.__source?.bgSnapshot },
                enumerable: false,
                configurable: true,
                writable: true,
            });
        }
    }
}
