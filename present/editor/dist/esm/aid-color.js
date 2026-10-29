/** 参考线 / 网格的线芯颜色。只记在这台浏览器，不写进 pptx。 */
export const GUIDE_AID_COLOR_KEY = "pp.aid.guideColor";
export const GRID_AID_COLOR_KEY = "pp.aid.gridColor";
export const GUIDE_AID_OPACITY_KEY = "pp.aid.guideOpacity";
export const GRID_AID_OPACITY_KEY = "pp.aid.gridOpacity";
/** 视图条「参考线」现在的线色。拖动时的对齐线另画，不走这里。 */
export const DEFAULT_GUIDE_AID_COLOR = "#22d3ee";
export const DEFAULT_GRID_AID_COLOR = "#3b82f6";
/** 屏幕像素（non-scaling-stroke）。一条线，不再叠细边。 */
export const GUIDE_AID_WIDTH = 1;
export const GRID_AID_WIDTH = 1;
/** 默认半透，避免网格铺满页面。可在右键条里改到 5%–100%。 */
export const DEFAULT_AID_OPACITY = 0.4;
const HEX6 = /^#[0-9a-fA-F]{6}$/;
export function normalizeAidColor(raw) {
    const v = raw.trim();
    if (!HEX6.test(v))
        return null;
    return v.toLowerCase();
}
export function readAidColor(store, key, fallback) {
    if (!store)
        return fallback;
    try {
        const saved = store.getItem(key);
        if (!saved)
            return fallback;
        return normalizeAidColor(saved) ?? fallback;
    }
    catch {
        return fallback;
    }
}
export function writeAidColor(store, key, color) {
    const next = normalizeAidColor(color);
    if (!next || !store)
        return false;
    try {
        store.setItem(key, next);
        return true;
    }
    catch {
        return false;
    }
}
export function normalizeAidOpacity(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n))
        return null;
    return Math.min(1, Math.max(0.05, Math.round(n * 20) / 20));
}
export function readAidOpacity(store, key, fallback) {
    if (!store)
        return fallback;
    try {
        const saved = store.getItem(key);
        if (saved == null || saved === "")
            return fallback;
        return normalizeAidOpacity(saved) ?? fallback;
    }
    catch {
        return fallback;
    }
}
export function writeAidOpacity(store, key, opacity) {
    const next = normalizeAidOpacity(String(opacity));
    if (next == null || !store)
        return false;
    try {
        store.setItem(key, String(next));
        return true;
    }
    catch {
        return false;
    }
}
export function clearAidColor(store, key) {
    if (!store)
        return;
    try {
        store.removeItem(key);
    }
    catch {
        /* private mode */
    }
}
export function aidColorStore() {
    try {
        return globalThis.localStorage ?? null;
    }
    catch {
        return null;
    }
}
const NS = "http://www.w3.org/2000/svg";
/** 一条实线，颜色就是用户选的线色。 */
export function appendAidLine(doc, parent, applyGeom, color, width, opacity) {
    const ln = doc.createElementNS(NS, "line");
    applyGeom(ln);
    ln.setAttribute("stroke", normalizeAidColor(color) ?? DEFAULT_GUIDE_AID_COLOR);
    ln.setAttribute("stroke-width", String(width));
    ln.setAttribute("stroke-opacity", String(normalizeAidOpacity(String(opacity)) ?? DEFAULT_AID_OPACITY));
    ln.setAttribute("vector-effect", "non-scaling-stroke");
    ln.style.pointerEvents = "none";
    parent.appendChild(ln);
}
let closeCurrent = null;
/** 右键视图条按钮后的取色条。左键开关不走这里。 */
export function openAidColorPopover(doc, opts) {
    closeCurrent?.();
    const el = doc.createElement("div");
    el.className = "ppt-aid-color-pop";
    el.dataset.pptAidColor = "1";
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    el.addEventListener("mousedown", (e) => e.stopPropagation());
    const label = doc.createElement("span");
    label.textContent = opts.label;
    const input = doc.createElement("input");
    input.type = "color";
    input.className = "ppt-color-swatch";
    input.value = normalizeAidColor(opts.value) ?? opts.fallback;
    input.setAttribute("aria-label", opts.label);
    input.addEventListener("input", () => {
        const next = normalizeAidColor(input.value);
        if (next)
            opts.onColor(next);
    });
    const opacityLabel = doc.createElement("span");
    opacityLabel.textContent = opts.opacityLabel;
    const range = doc.createElement("input");
    range.type = "range";
    range.className = "ppt-range ppt-aid-color-opacity";
    range.min = "0.05";
    range.max = "1";
    range.step = "0.05";
    range.value = String(normalizeAidOpacity(String(opts.opacity)) ?? opts.opacityFallback);
    range.setAttribute("aria-label", opts.opacityLabel);
    const pct = doc.createElement("span");
    pct.className = "ppt-aid-color-opacity-value";
    const showOpacity = () => {
        pct.textContent = `${Math.round(Number(range.value) * 100)}%`;
    };
    showOpacity();
    range.addEventListener("input", () => {
        showOpacity();
        const next = normalizeAidOpacity(range.value);
        if (next != null)
            opts.onOpacity(next);
    });
    const reset = doc.createElement("button");
    reset.type = "button";
    reset.className = "ppt-aid-color-reset";
    reset.textContent = opts.resetLabel;
    reset.addEventListener("click", () => {
        opts.onReset();
        input.value = opts.fallback;
        range.value = String(opts.opacityFallback);
        showOpacity();
    });
    el.append(label, input, opacityLabel, range, pct, reset);
    doc.body.appendChild(el);
    const rect = opts.anchor.getBoundingClientRect();
    const pop = el.getBoundingClientRect();
    const vw = doc.defaultView?.innerWidth ?? rect.left + pop.width;
    const vh = doc.defaultView?.innerHeight ?? rect.bottom + pop.height;
    let left = rect.left;
    let top = rect.bottom + 4;
    if (top + pop.height > vh - 4)
        top = Math.max(4, rect.top - pop.height - 4);
    if (left + pop.width > vw - 4)
        left = Math.max(4, vw - pop.width - 4);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    const onDocPointerDown = (e) => {
        if (el.contains(e.target))
            return;
        destroy();
    };
    const onKey = (e) => {
        if (e.key !== "Escape")
            return;
        e.preventDefault();
        destroy();
    };
    let registered = false;
    const armTimer = doc.defaultView?.setTimeout(() => {
        if (!doc.body.contains(el))
            return;
        doc.addEventListener("pointerdown", onDocPointerDown, true);
        doc.addEventListener("keydown", onKey, true);
        registered = true;
    }, 0);
    function destroy() {
        if (registered) {
            doc.removeEventListener("pointerdown", onDocPointerDown, true);
            doc.removeEventListener("keydown", onKey, true);
        }
        else if (armTimer !== undefined) {
            doc.defaultView?.clearTimeout(armTimer);
        }
        el.remove();
        if (closeCurrent === destroy)
            closeCurrent = null;
    }
    closeCurrent = destroy;
}
