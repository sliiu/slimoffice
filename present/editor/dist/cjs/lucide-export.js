"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lucideSvg = exports.POPULAR_LUCIDE_ICONS = void 0;
exports.listLucideIconIds = listLucideIconIds;
exports.lucideIconSvgDataUrl = lucideIconSvgDataUrl;
exports.lucideIconToDataUrl = lucideIconToDataUrl;
exports.lucideIconToPngDataUrl = lucideIconToPngDataUrl;
const lucide_1 = require("lucide");
const icons_1 = require("./icons");
function kebabToPascal(id) {
    return id.replace(/[-_]+(.)/g, (_, c) => c.toUpperCase()).replace(/^(.)/, (m) => m.toUpperCase());
}
/** 全部 Lucide 图标 id（kebab-case，按字母序）。 */
function listLucideIconIds() {
    const rec = lucide_1.icons;
    const out = new Set();
    for (const key of Object.keys(rec)) {
        if (!rec[key])
            continue;
        const kebab = key.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
        out.add(kebab);
    }
    return [...out].sort((a, b) => a.localeCompare(b));
}
exports.POPULAR_LUCIDE_ICONS = [
    "home",
    "user",
    "users",
    "heart",
    "star",
    "mail",
    "phone",
    "calendar",
    "clock",
    "map-pin",
    "search",
    "settings",
    "bell",
    "camera",
    "image",
    "video",
    "music",
    "file-text",
    "folder",
    "download",
    "upload",
    "share-2",
    "link",
    "check",
    "x",
    "plus",
    "minus",
    "arrow-right",
    "chevron-right",
    "circle-check",
    "circle-alert",
    "lightbulb",
    "zap",
    "globe",
    "lock",
    "unlock",
    "eye",
    "eye-off",
    "trash-2",
    "pencil",
    "chart-column",
    "table",
    "layout-grid",
    "message-circle",
    "smartphone",
    "laptop",
    "wifi",
    "cloud",
    "sun",
    "moon",
];
function iconNodeRaw(id) {
    const rec = lucide_1.icons;
    return rec[id] ?? rec[kebabToPascal(id)];
}
function escapeSvgAttr(value) {
    return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
function serializeIconChild(node) {
    const [tag, attrs, children] = node;
    const attr = Object.entries(attrs)
        .map(([key, value]) => ` ${key}="${escapeSvgAttr(String(value))}"`)
        .join("");
    const inner = children?.map(serializeIconChild).join("") ?? "";
    return inner ? `<${tag}${attr}>${inner}</${tag}>` : `<${tag}${attr}/>`;
}
/** Lucide 图标的 SVG data URL。未知 id 返回 null，不换成别的图标。不需要 DOM。 */
function lucideIconSvgDataUrl(iconName, opts = {}) {
    const node = iconNodeRaw(iconName);
    if (!node)
        return null;
    const size = opts.size ?? 96;
    const color = opts.color ?? "#111827";
    const strokeWidth = opts.strokeWidth ?? 2;
    const xml = [
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"`,
        ` width="${size}" height="${size}" fill="none" stroke="${escapeSvgAttr(color)}"`,
        ` stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">`,
        node.map(serializeIconChild).join(""),
        `</svg>`,
    ].join("");
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
}
function appendIconChild(parent, node) {
    const [tag, attrs, children] = node;
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [k, v] of Object.entries(attrs)) {
        el.setAttribute(k, String(v));
    }
    children?.forEach((child) => appendIconChild(el, child));
    parent.appendChild(el);
}
/** 将 Lucide 图标渲染为可插入幻灯片的 SVG data URL。 */
function lucideIconToDataUrl(doc, iconName, opts = {}) {
    const id = (0, icons_1.normalizeLucideIconName)(iconName);
    const node = iconNodeRaw(id) ?? iconNodeRaw("circle-help");
    const size = opts.size ?? 96;
    const color = opts.color ?? "#111827";
    const strokeWidth = opts.strokeWidth ?? 2;
    const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", color);
    svg.setAttribute("stroke-width", String(strokeWidth));
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    node.forEach((child) => appendIconChild(svg, child));
    const xml = new XMLSerializer().serializeToString(svg);
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
}
/** 将 Lucide 图标栅格成 PNG data URL，给 OOXML `a:blip` 回退用。失败时退回 SVG。 */
function lucideIconToPngDataUrl(doc, iconName, opts = {}) {
    const svgUrl = lucideIconToDataUrl(doc, iconName, opts);
    const size = opts.size ?? 96;
    const win = doc.defaultView;
    if (!win)
        return Promise.resolve(svgUrl);
    return new Promise((resolve) => {
        const img = new win.Image();
        img.onload = () => {
            const canvas = doc.createElement("canvas");
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext("2d");
            if (!ctx) {
                resolve(svgUrl);
                return;
            }
            ctx.drawImage(img, 0, 0, size, size);
            try {
                resolve(canvas.toDataURL("image/png"));
            }
            catch {
                resolve(svgUrl);
            }
        };
        img.onerror = () => resolve(svgUrl);
        img.src = svgUrl;
    });
}
/** 预览用小图标（复用 lucideSvg）。 */
var icons_2 = require("./icons");
Object.defineProperty(exports, "lucideSvg", { enumerable: true, get: function () { return icons_2.lucideSvg; } });
