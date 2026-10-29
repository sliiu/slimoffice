"use strict";
// 把一页画面克隆成若干裁切块。门、百叶窗、梳理要用旧页自己的内容，不能涂黑块。
// id 加前缀，避免和还在树上的原节点抢 url(#…)。
Object.defineProperty(exports, "__esModule", { value: true });
exports.mountTwin = mountTwin;
exports.dropTwins = dropTwins;
let twinSeq = 0;
function mountTwin(source, clip) {
    const twin = source.cloneNode(true);
    const prefix = `__tw${++twinSeq}_`;
    const idMap = new Map();
    const take = (el) => {
        const old = el.getAttribute("id");
        if (!old)
            return;
        const next = prefix + old;
        el.setAttribute("id", next);
        idMap.set(old, next);
    };
    take(twin);
    twin.querySelectorAll("[id]").forEach(take);
    if (idMap.size > 0)
        rewriteLocalRefs(twin, idMap);
    copyCanvasBitmaps(source, twin);
    twin.style.clipPath = clip;
    twin.style.visibility = "visible";
    twin.style.pointerEvents = "none";
    twin.style.zIndex = source.style.zIndex || "2";
    source.parentElement?.appendChild(twin);
    return twin;
}
function dropTwins(twins, source, prevVisibility) {
    for (const t of twins)
        t.remove();
    source.style.visibility = prevVisibility;
}
function copyCanvasBitmaps(src, dst) {
    const srcCanvases = src.querySelectorAll("canvas");
    const dstCanvases = dst.querySelectorAll("canvas");
    const n = Math.min(srcCanvases.length, dstCanvases.length);
    for (let i = 0; i < n; i++) {
        const s = srcCanvases[i];
        const d = dstCanvases[i];
        if (s.width === 0 || s.height === 0)
            continue;
        d.width = s.width;
        d.height = s.height;
        const ctx = d.getContext("2d");
        if (!ctx)
            continue;
        try {
            ctx.drawImage(s, 0, 0);
        }
        catch {
            // 跨域画布画不上，这块保持空白。
        }
    }
}
function rewriteLocalRefs(root, idMap) {
    const xlinkNs = "http://www.w3.org/1999/xlink";
    const replaceUrl = (s) => s.replace(/url\(\s*#([^)\s"']+)\s*\)/g, (full, id) => {
        const next = idMap.get(id);
        return next ? `url(#${next})` : full;
    });
    const visit = (el) => {
        for (let i = 0; i < el.attributes.length; i++) {
            const a = el.attributes[i];
            if (a.name === "id")
                continue;
            if (a.value.includes("url(#"))
                a.value = replaceUrl(a.value);
            else if ((a.localName === "href" || a.name === "href") && a.value.startsWith("#")) {
                const next = idMap.get(a.value.slice(1));
                if (next)
                    a.value = "#" + next;
            }
        }
        const xhref = el.getAttributeNS(xlinkNs, "href");
        if (xhref?.startsWith("#")) {
            const next = idMap.get(xhref.slice(1));
            if (next)
                el.setAttributeNS(xlinkNs, "href", "#" + next);
        }
        for (const child of Array.from(el.children))
            visit(child);
    };
    visit(root);
}
