"use strict";
/**
 * Pick the locked skeleton, fill slots, truncate to caps.
 * Font size is taken from VisualSystem type scale and never reduced to fit.
 * Composition uses the system grid (columns + gutter) and color-field / hairline
 * vocabulary — not a title dumped in the 5% margin.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.fillSlide = fillSlide;
exports.fillPlans = fillPlans;
const ids_js_1 = require("./ids.js");
const layouts_js_1 = require("./layouts.js");
const visual_system_js_1 = require("./visual-system.js");
const text_measure_js_1 = require("./text-measure.js");
function gridOf(sys) {
    const mx = visual_system_js_1.CANVAS.width * sys.grid.margin;
    const my = visual_system_js_1.CANVAS.height * sys.grid.margin;
    const innerW = visual_system_js_1.CANVAS.width - 2 * mx;
    const innerH = visual_system_js_1.CANVAS.height - 2 * my;
    const cols = sys.grid.columns;
    const gutter = sys.grid.gutter;
    const colW = (innerW - gutter * (cols - 1)) / cols;
    return {
        mx,
        my,
        innerW,
        innerH,
        cols,
        gutter,
        area: { x: mx, y: my, w: innerW, h: innerH },
        col(start, span) {
            const x = mx + start * (colW + gutter);
            const w = span * colW + Math.max(0, span - 1) * gutter;
            return { x, w };
        },
    };
}
function tx(sys, role, fontSize, text = "") {
    return (0, visual_system_js_1.typeRole)(sys, role, fontSize, text);
}
function ruleH(sys) {
    return sys.id === "swiss" ? 1 : 2;
}
function gap(sys) {
    return sys.density === "tight" ? 12 : 20;
}
function pad(sys) {
    return sys.density === "tight" ? 16 : 24;
}
function el(slot, kind, bbox, paintRole, extra = {}) {
    return { slot, kind, name: `slot:${slot}`, bbox: { ...bbox }, paintRole, align: "start", ...extra };
}
function fitText(raw, fontSize, bbox, maxLines, maxChars) {
    let t = raw;
    if (maxChars != null)
        t = (0, text_measure_js_1.truncateChars)(t, maxChars).text;
    return (0, text_measure_js_1.truncateToLines)(t, fontSize, bbox.w, maxLines).text;
}
function visualField(slot, bbox, src, fallback = "accentSoft") {
    const real = realImageSrc(src);
    if (real)
        return el(slot, "image", bbox, "surface", { src: real });
    return el(slot, "surface", bbox, fallback);
}
function realImageSrc(src) {
    const t = (src ?? "").trim();
    if (!t)
        return undefined;
    if (/^(data:|https?:|blob:)/i.test(t))
        return t;
    return undefined;
}
function idxLabel(i) {
    return String(i + 1).padStart(2, "0");
}
function optionalTitle(out, plan, sys, g) {
    if (!plan.title)
        return g.my;
    const t = { x: g.mx, y: g.my, w: g.innerW, h: sys.typeScale.h1 * 1.25 };
    out.push(el("title", "text", t, "ink", {
        text: fitText(plan.title, sys.typeScale.h1, t, 1),
        fontSize: sys.typeScale.h1,
        ...tx(sys, "h1", sys.typeScale.h1, plan.title),
    }));
    return t.y + t.h + gap(sys);
}
function parseBarItem(item, index, n) {
    const parts = item.split("|").map((s) => s.trim()).filter(Boolean);
    let label = item.trim();
    let weight;
    if (parts.length >= 2) {
        const a = Number.parseFloat(parts[0].replace(/[^\d.-]/g, ""));
        const b = Number.parseFloat(parts[1].replace(/[^\d.-]/g, ""));
        if (Number.isFinite(a) && !Number.isFinite(b)) {
            weight = Math.abs(a);
            label = parts.slice(1).join(" ");
        }
        else if (Number.isFinite(b)) {
            weight = Math.abs(b);
            label = parts[0];
        }
        else {
            label = parts[0];
        }
    }
    else {
        const m = item.match(/[-+]?\d+(?:\.\d+)?/);
        if (m) {
            const v = Number.parseFloat(m[0]);
            if (Number.isFinite(v) && v > 0)
                weight = v;
        }
    }
    return { label, weight: weight != null && weight > 0 ? weight : Math.max(1, n - index) };
}
function fillCover(plan, sys, g) {
    const display = (0, visual_system_js_1.displaySize)(sys, plan.title ?? "");
    const out = [];
    const editorial = sys.id === "editorial";
    const poster = plan.variant === "poster";
    const titleSpan = poster
        ? editorial
            ? g.col(7, 5)
            : g.col(9, 7)
        : editorial
            ? g.col(0, 8)
            : g.col(3, 13);
    if (poster) {
        const field = editorial ? g.col(0, 7) : g.col(0, 9);
        out.push(el("bar", "bar", { x: field.x, y: g.my, w: field.w, h: g.innerH }, "accent"));
    }
    else if (editorial) {
        const plane = g.col(8, 4);
        out.push(el("plane", "surface", { x: plane.x, y: g.my, w: plane.w, h: g.innerH }, "accentSoft"));
        const tick = g.col(0, 3);
        out.push(el("rule", "rule", { x: tick.x, y: g.my, w: tick.w, h: ruleH(sys) }, "accent", { hairline: true }));
    }
    else {
        const rail = g.col(0, 2);
        out.push(el("bar", "bar", { x: rail.x, y: g.my, w: rail.w, h: g.innerH }, "accent"));
    }
    const titleBox = {
        x: titleSpan.x,
        y: g.my + g.innerH * (editorial ? 0.36 : 0.4),
        w: titleSpan.w,
        h: display * 2.35,
    };
    out.push(el("title", "text", titleBox, "ink", {
        text: fitText(plan.title ?? "", display, titleBox, 2),
        fontSize: display,
        ...tx(sys, "display", display, plan.title ?? ""),
    }));
    if (plan.subtitle) {
        const subBox = {
            x: titleSpan.x,
            y: titleBox.y + titleBox.h + gap(sys),
            w: titleSpan.w * 0.92,
            h: sys.typeScale.h2 * 2.2,
        };
        out.push(el("subtitle", "text", subBox, "muted", {
            text: fitText(plan.subtitle, sys.typeScale.h2, subBox, 2),
            fontSize: sys.typeScale.h2,
            ...tx(sys, editorial ? "h2" : "body", sys.typeScale.h2, plan.subtitle),
        }));
    }
    if (plan.variant === "title-meta" && plan.meta) {
        const metaBox = {
            x: titleSpan.x,
            y: g.my + g.innerH - sys.typeScale.caption * 1.8,
            w: titleSpan.w * 0.7,
            h: sys.typeScale.caption * 1.6,
        };
        out.push(el("meta", "text", metaBox, "muted", {
            text: fitText(plan.meta, sys.typeScale.caption, metaBox, 1),
            fontSize: sys.typeScale.caption,
            ...tx(sys, "kicker", sys.typeScale.caption, plan.meta),
        }));
    }
    return out;
}
function fillSection(plan, sys, g) {
    const num = plan.number ?? "01";
    const display = (0, visual_system_js_1.displaySize)(sys, num);
    const numCol = sys.id === "editorial" ? g.col(0, 4) : g.col(0, 5);
    const titleCol = sys.id === "editorial" ? g.col(0, 11) : g.col(5, 11);
    const numBox = { x: numCol.x, y: g.my, w: numCol.w, h: display * 1.15 };
    const titleY = sys.id === "editorial" ? numBox.y + numBox.h + gap(sys) + 8 : g.my + display * 0.15;
    const titleBox = {
        x: titleCol.x,
        y: titleY,
        w: titleCol.w,
        h: (0, visual_system_js_1.displaySize)(sys, plan.title ?? "") * 2.2,
    };
    const ruleY = sys.id === "editorial" ? numBox.y + numBox.h + 8 : g.my + g.innerH * 0.55;
    const rule = sys.id === "editorial" ? g.col(0, 4) : g.col(5, 11);
    const titleSize = (0, visual_system_js_1.displaySize)(sys, plan.title ?? "");
    return [
        el("number", "text", numBox, "accent", {
            text: fitText(num, display, numBox, 1, 8),
            fontSize: display,
            ...tx(sys, "numeral", display, num),
        }),
        el("rule", "rule", { x: rule.x, y: ruleY, w: rule.w, h: ruleH(sys) }, "accent", { hairline: true }),
        el("title", "text", titleBox, "ink", {
            text: fitText(plan.title ?? "", titleSize, titleBox, 2),
            fontSize: titleSize,
            ...tx(sys, "display", titleSize, plan.title ?? ""),
        }),
    ];
}
function fillStatement(plan, sys, g) {
    const display = (0, visual_system_js_1.displaySize)(sys, plan.claim ?? "");
    const col = sys.id === "editorial" ? g.col(0, 10) : g.col(1, 14);
    const claimY = g.my + g.innerH * (plan.variant === "question" ? 0.28 : 0.3);
    const tick = { x: col.x, y: claimY - 16, w: sys.id === "swiss" ? col.w : Math.min(96, col.w), h: ruleH(sys) };
    const claimBox = { x: col.x, y: claimY, w: col.w, h: display * (plan.variant === "question" ? 2.1 : 1.45) };
    const out = [];
    out.push(el("rule", "rule", tick, "accent", { hairline: true }));
    out.push(el("claim", "text", claimBox, "ink", {
        text: fitText(plan.claim ?? "", display, claimBox, plan.variant === "question" ? 2 : 1, ids_js_1.SLOT_CAPS.statementClaimChars),
        fontSize: display,
        ...tx(sys, "display", display, plan.claim ?? ""),
    }));
    if (plan.variant === "line-plus-note" && plan.note) {
        const noteBox = {
            x: col.x,
            y: claimBox.y + claimBox.h + gap(sys),
            w: col.w * 0.78,
            h: sys.typeScale.body * 2.6,
        };
        out.push(el("note", "text", noteBox, "muted", {
            text: fitText(plan.note, sys.typeScale.body, noteBox, 2),
            fontSize: sys.typeScale.body,
            ...tx(sys, "body", sys.typeScale.body, plan.note),
        }));
    }
    return out;
}
function fillBullets(plan, sys, g) {
    const items = (plan.items ?? []).slice(0, ids_js_1.SLOT_CAPS.bulletItems);
    const titleCol = g.col(0, g.cols);
    const titleBox = { x: titleCol.x, y: g.my, w: titleCol.w, h: sys.typeScale.h1 * 1.35 };
    const out = [
        el("title", "text", titleBox, "ink", {
            text: fitText(plan.title ?? "", sys.typeScale.h1, titleBox, 1),
            fontSize: sys.typeScale.h1,
            ...tx(sys, "h1", sys.typeScale.h1, plan.title ?? ""),
        }),
    ];
    const rule = g.col(0, sys.id === "editorial" ? 5 : 6);
    const ruleY = titleBox.y + titleBox.h + 8;
    out.push(el("rule", "rule", { x: rule.x, y: ruleY, w: rule.w, h: ruleH(sys) }, "line", { hairline: true }));
    const idxCol = g.col(0, sys.id === "editorial" ? 1 : 2);
    const bodyCol = sys.id === "editorial" ? g.col(1, 11) : g.col(2, 14);
    const startY = ruleY + gap(sys);
    const rowH = Math.min(sys.typeScale.body * 2.4, (g.my + g.innerH - startY) / Math.max(1, items.length));
    items.forEach((item, i) => {
        const y = startY + i * rowH;
        const idxBox = { x: idxCol.x, y, w: idxCol.w - 8, h: sys.typeScale.caption * 1.6 };
        out.push(el("index", "text", idxBox, "accent", {
            name: `slot:index:${i}`,
            text: idxLabel(i),
            fontSize: sys.typeScale.caption,
            ...tx(sys, "index", sys.typeScale.caption, idxLabel(i)),
        }));
        const box = { x: bodyCol.x, y, w: bodyCol.w, h: rowH - 8 };
        out.push(el("items", "text", box, "ink", {
            name: `slot:items:${i}`,
            text: fitText(item, sys.typeScale.body, box, 1, ids_js_1.SLOT_CAPS.bulletItemChars),
            fontSize: sys.typeScale.body,
            ...tx(sys, "body", sys.typeScale.body, item),
        }));
    });
    return out;
}
function fillSplit(plan, sys, g) {
    const out = [];
    const titleBox = { x: g.mx, y: g.my, w: g.innerW, h: sys.typeScale.h1 * 1.25 };
    if (plan.title) {
        out.push(el("title", "text", titleBox, "ink", {
            text: fitText(plan.title, sys.typeScale.h1, titleBox, 1),
            fontSize: sys.typeScale.h1,
            ...tx(sys, "h1", sys.typeScale.h1, plan.title),
        }));
    }
    const top = plan.title ? titleBox.y + titleBox.h + gap(sys) : g.my;
    const h = g.my + g.innerH - top;
    const left = plan.variant === "figure-text"
        ? sys.id === "editorial"
            ? g.col(0, 8)
            : g.col(0, 9)
        : plan.variant === "text-figure"
            ? sys.id === "editorial"
                ? g.col(0, 4)
                : g.col(0, 7)
            : sys.id === "editorial"
                ? g.col(0, 7)
                : g.col(0, 8);
    const right = plan.variant === "figure-text"
        ? sys.id === "editorial"
            ? g.col(8, 4)
            : g.col(9, 7)
        : plan.variant === "text-figure"
            ? sys.id === "editorial"
                ? g.col(4, 8)
                : g.col(7, 9)
            : sys.id === "editorial"
                ? g.col(7, 5)
                : g.col(8, 8);
    const inset = pad(sys);
    if (plan.variant === "figure-text") {
        out.push(visualField("image", { x: left.x, y: top, w: left.w, h }, plan.imageSrc));
        const rx = right.x + inset;
        const rw = right.w - inset * 2;
        let ry = top + inset;
        if (plan.rightTitle || plan.leftTitle) {
            const label = plan.rightTitle ?? plan.leftTitle ?? "";
            const b = { x: rx, y: ry, w: rw, h: sys.typeScale.h2 * 1.4 };
            out.push(el("rightTitle", "text", b, "muted", {
                text: fitText(label, sys.typeScale.h2, b, 1),
                fontSize: sys.typeScale.h2,
                ...tx(sys, "h2", sys.typeScale.h2, label),
            }));
            ry += sys.typeScale.h2 * 1.6;
        }
        const copy = (plan.rightItems ?? plan.leftItems ?? []).slice(0, 4);
        copy.forEach((item, i) => {
            const box = { x: rx, y: ry + i * sys.typeScale.body * 2, w: rw, h: sys.typeScale.body * 1.8 };
            out.push(el("rightItems", "text", box, "ink", {
                name: `slot:rightItems:${i}`,
                text: fitText(item, sys.typeScale.body, box, 1, ids_js_1.SLOT_CAPS.bulletItemChars),
                fontSize: sys.typeScale.body,
                ...tx(sys, "body", sys.typeScale.body, item),
            }));
        });
        return out;
    }
    out.push(el("leftPanel", "surface", { x: left.x, y: top, w: left.w, h }, "surface"));
    const dividerX = left.x + left.w + g.gutter / 2;
    out.push(el("rule", "rule", { x: dividerX, y: top + inset, w: 1, h: h - inset * 2 }, "line", { hairline: true }));
    const textX = left.x + inset;
    const textW = left.w - inset * 2;
    let cursor = top + inset;
    if (plan.leftTitle) {
        const b = { x: textX, y: cursor, w: textW, h: sys.typeScale.h2 * 1.4 };
        out.push(el("leftTitle", "text", b, "muted", {
            text: fitText(plan.leftTitle, sys.typeScale.h2, b, 1),
            fontSize: sys.typeScale.h2,
            ...tx(sys, "h2", sys.typeScale.h2, plan.leftTitle),
        }));
        cursor += sys.typeScale.h2 * 1.6;
    }
    (plan.leftItems ?? []).slice(0, 4).forEach((item, i) => {
        const box = { x: textX, y: cursor + i * sys.typeScale.body * 2, w: textW, h: sys.typeScale.body * 1.8 };
        out.push(el("leftItems", "text", box, "ink", {
            name: `slot:leftItems:${i}`,
            text: fitText(item, sys.typeScale.body, box, 1, ids_js_1.SLOT_CAPS.bulletItemChars),
            fontSize: sys.typeScale.body,
            ...tx(sys, "body", sys.typeScale.body, item),
        }));
    });
    if (plan.variant === "text-figure") {
        out.push(visualField("image", { x: right.x, y: top, w: right.w, h }, plan.imageSrc));
    }
    else {
        out.push(el("rightPanel", "surface", { x: right.x, y: top, w: right.w, h }, "surface"));
        const rx = right.x + inset;
        const rw = right.w - inset * 2;
        let ry = top + inset;
        if (plan.rightTitle) {
            const b = { x: rx, y: ry, w: rw, h: sys.typeScale.h2 * 1.4 };
            out.push(el("rightTitle", "text", b, "muted", {
                text: fitText(plan.rightTitle, sys.typeScale.h2, b, 1),
                fontSize: sys.typeScale.h2,
                ...tx(sys, "h2", sys.typeScale.h2, plan.rightTitle),
            }));
            ry += sys.typeScale.h2 * 1.6;
        }
        (plan.rightItems ?? []).slice(0, 4).forEach((item, i) => {
            const box = { x: rx, y: ry + i * sys.typeScale.body * 2, w: rw, h: sys.typeScale.body * 1.8 };
            out.push(el("rightItems", "text", box, "ink", {
                name: `slot:rightItems:${i}`,
                text: fitText(item, sys.typeScale.body, box, 1, ids_js_1.SLOT_CAPS.bulletItemChars),
                fontSize: sys.typeScale.body,
                ...tx(sys, "body", sys.typeScale.body, item),
            }));
        });
    }
    return out;
}
function fillFigure(plan, sys, g) {
    if (plan.variant === "hero") {
        const capH = sys.typeScale.h1 * 1.3 + sys.typeScale.body * 2.2 + gap(sys);
        const imgH = g.innerH - capH;
        const imgBox = { x: g.mx, y: g.my, w: g.innerW, h: imgH };
        const out = [visualField("image", imgBox, plan.imageSrc)];
        if (plan.title) {
            const t = { x: g.mx, y: g.my + imgH + 10, w: g.innerW, h: sys.typeScale.h1 * 1.2 };
            out.push(el("title", "text", t, "ink", {
                text: fitText(plan.title, sys.typeScale.h1, t, 1),
                fontSize: sys.typeScale.h1,
                ...tx(sys, "h1", sys.typeScale.h1, plan.title),
            }));
        }
        if (plan.note) {
            const noteBox = {
                x: g.mx,
                y: g.my + imgH + sys.typeScale.h1 * 1.25 + 8,
                w: g.innerW,
                h: sys.typeScale.body * 2,
            };
            out.push(el("note", "text", noteBox, "muted", {
                text: fitText(plan.note, sys.typeScale.body, noteBox, ids_js_1.SLOT_CAPS.figureNoteLines),
                fontSize: sys.typeScale.body,
                ...tx(sys, "body", sys.typeScale.body, plan.note),
            }));
        }
        return out;
    }
    const captionH = sys.typeScale.body * 2.6;
    const imgH = g.innerH - captionH - gap(sys);
    const imgBox = { x: g.mx, y: g.my, w: g.innerW, h: imgH };
    const out = [visualField("image", imgBox, plan.imageSrc, "accentSoft")];
    out.push(el("rule", "rule", { x: g.mx, y: g.my + imgH + 8, w: 64, h: ruleH(sys) }, "accent", { hairline: true }));
    if (plan.note) {
        const noteBox = { x: g.mx, y: g.my + imgH + gap(sys), w: g.innerW, h: captionH };
        out.push(el("note", "text", noteBox, "muted", {
            text: fitText(plan.note, sys.typeScale.body, noteBox, ids_js_1.SLOT_CAPS.figureNoteLines),
            fontSize: sys.typeScale.body,
            ...tx(sys, "body", sys.typeScale.body, plan.note),
        }));
    }
    return out;
}
function fillKpi(plan, sys, g) {
    const valueRole = sys.id === "swiss" ? "accent" : "ink";
    if (plan.variant === "big-number") {
        const plane = sys.id === "editorial" ? g.col(0, 5) : g.col(0, 6);
        const rest = sys.id === "editorial" ? g.col(5, 7) : g.col(7, 9);
        const value = plan.value ?? "";
        const display = (0, visual_system_js_1.displaySize)(sys, value);
        const valueBox = {
            x: plane.x + pad(sys),
            y: g.my + g.innerH * 0.28,
            w: plane.w - pad(sys) * 2,
            h: display * 1.25,
        };
        const out = [
            el("bar", "bar", { x: plane.x, y: g.my, w: plane.w, h: g.innerH }, "accentSoft"),
            el("value", "text", valueBox, valueRole, {
                text: fitText(value, display, valueBox, 1),
                fontSize: display,
                ...tx(sys, "numeral", display, value),
            }),
        ];
        if (plan.label) {
            const lab = {
                x: rest.x,
                y: g.my + g.innerH * 0.38,
                w: rest.w,
                h: sys.typeScale.h2 * 2.2,
            };
            out.push(el("label", "text", lab, "muted", {
                text: fitText(plan.label, sys.typeScale.h2, lab, 2),
                fontSize: sys.typeScale.h2,
                ...tx(sys, "h2", sys.typeScale.h2, plan.label),
            }));
        }
        return out;
    }
    if (plan.variant === "ledger") {
        const rows = (plan.kpis ?? []).slice(0, ids_js_1.SLOT_CAPS.barItems + 2);
        const out = [];
        if (plan.title) {
            const t = { x: g.mx, y: g.my, w: g.innerW, h: sys.typeScale.h1 * 1.25 };
            out.push(el("title", "text", t, "ink", {
                text: fitText(plan.title, sys.typeScale.h1, t, 1),
                fontSize: sys.typeScale.h1,
                ...tx(sys, "h1", sys.typeScale.h1, plan.title),
            }));
        }
        const top = plan.title ? g.my + sys.typeScale.h1 * 1.5 : g.my;
        const rowH = Math.min(sys.typeScale.h1 * 1.35, (g.my + g.innerH - top) / Math.max(1, rows.length));
        rows.forEach((k, i) => {
            const y = top + i * rowH;
            out.push(el("kpis", "rule", { x: g.mx, y, w: g.innerW, h: ruleH(sys) }, "line", { name: `slot:kpis:${i}:rule`, hairline: true }));
            const vbox = { x: g.mx, y: y + 8, w: g.innerW * 0.28, h: sys.typeScale.h1 };
            out.push(el("kpis", "text", vbox, valueRole, {
                name: `slot:kpis:${i}:value`,
                text: fitText(k.value, sys.typeScale.h1, vbox, 1),
                fontSize: sys.typeScale.h1,
                ...tx(sys, "numeral", sys.typeScale.h1, k.value),
            }));
            const lbox = { x: g.mx + g.innerW * 0.32, y: y + 12, w: g.innerW * 0.68, h: sys.typeScale.body * 1.6 };
            out.push(el("kpis", "text", lbox, "muted", {
                name: `slot:kpis:${i}:label`,
                text: fitText(k.label, sys.typeScale.body, lbox, 1),
                fontSize: sys.typeScale.body,
                ...tx(sys, "body", sys.typeScale.body, k.label),
            }));
        });
        return out;
    }
    const kpis = (plan.kpis ?? []).slice(0, ids_js_1.SLOT_CAPS.kpiRow);
    const out = [];
    if (plan.title) {
        const t = { x: g.mx, y: g.my, w: g.innerW, h: sys.typeScale.h1 * 1.25 };
        out.push(el("title", "text", t, "ink", {
            text: fitText(plan.title, sys.typeScale.h1, t, 1),
            fontSize: sys.typeScale.h1,
            ...tx(sys, "h1", sys.typeScale.h1, plan.title),
        }));
    }
    const top = plan.title ? g.my + sys.typeScale.h1 * 1.5 : g.my;
    const n = Math.max(1, kpis.length);
    const span = Math.floor(g.cols / n);
    kpis.forEach((k, i) => {
        const col = g.col(i * span, i === n - 1 ? g.cols - i * span : span);
        const h = g.my + g.innerH - top;
        out.push(el("kpis", "surface", { x: col.x, y: top, w: col.w, h }, "surface", { name: `slot:kpis:${i}:panel` }));
        out.push(el("kpis", "rule", { x: col.x, y: top, w: col.w, h: 4 }, "accent", { name: `slot:kpis:${i}:bar` }));
        const vbox = {
            x: col.x + pad(sys),
            y: top + pad(sys) + 8,
            w: col.w - pad(sys) * 2,
            h: (0, visual_system_js_1.displaySize)(sys, k.value) * 1.2,
        };
        out.push(el("kpis", "text", vbox, valueRole, {
            name: `slot:kpis:${i}:value`,
            text: fitText(k.value, (0, visual_system_js_1.displaySize)(sys, k.value), vbox, 1),
            fontSize: (0, visual_system_js_1.displaySize)(sys, k.value),
            ...tx(sys, "numeral", (0, visual_system_js_1.displaySize)(sys, k.value), k.value),
        }));
        const lbox = {
            x: col.x + pad(sys),
            y: vbox.y + vbox.h + 8,
            w: col.w - pad(sys) * 2,
            h: sys.typeScale.caption * 2.2,
        };
        out.push(el("kpis", "text", lbox, "muted", {
            name: `slot:kpis:${i}:label`,
            text: fitText(k.label, sys.typeScale.caption, lbox, 2),
            fontSize: sys.typeScale.caption,
            ...tx(sys, "kicker", sys.typeScale.caption, k.label),
        }));
    });
    return out;
}
function fillCompare(plan, sys, g) {
    const out = [];
    if (plan.title) {
        const t = { x: g.mx, y: g.my, w: g.innerW, h: sys.typeScale.h1 * 1.25 };
        out.push(el("title", "text", t, "ink", {
            text: fitText(plan.title, sys.typeScale.h1, t, 1),
            fontSize: sys.typeScale.h1,
            ...tx(sys, "h1", sys.typeScale.h1, plan.title),
        }));
    }
    const top = plan.title ? g.my + sys.typeScale.h1 * 1.5 : g.my;
    const h = g.my + g.innerH - top;
    const left = g.col(0, Math.floor(g.cols / 2));
    const right = g.col(Math.floor(g.cols / 2), g.cols - Math.floor(g.cols / 2));
    const inset = pad(sys);
    out.push(el("leftPanel", "surface", { x: left.x, y: top, w: left.w, h }, "accentSoft"));
    out.push(el("rightPanel", "surface", { x: right.x, y: top, w: right.w, h }, "surface"));
    const paintCol = (col, titleSlot, itemsSlot, title, items) => {
        let y = top + inset;
        if (title) {
            const b = { x: col.x + inset, y, w: col.w - inset * 2, h: sys.typeScale.h2 * 1.3 };
            out.push(el(titleSlot, "text", b, "ink", {
                text: fitText(title, sys.typeScale.h2, b, 1),
                fontSize: sys.typeScale.h2,
                ...tx(sys, "h2", sys.typeScale.h2, title),
            }));
            out.push(el("rule", "rule", { x: col.x + inset, y: y + sys.typeScale.h2 * 1.35, w: 48, h: ruleH(sys) }, "accent", { hairline: true, name: `slot:${titleSlot}:rule` }));
            y += sys.typeScale.h2 * 1.7;
        }
        items.slice(0, 4).forEach((item, i) => {
            const box = {
                x: col.x + inset,
                y: y + i * sys.typeScale.body * 2,
                w: col.w - inset * 2,
                h: sys.typeScale.body * 1.8,
            };
            out.push(el(itemsSlot, "text", box, "ink", {
                name: `slot:${itemsSlot}:${i}`,
                text: fitText(item, sys.typeScale.body, box, 1, ids_js_1.SLOT_CAPS.bulletItemChars),
                fontSize: sys.typeScale.body,
                ...tx(sys, "body", sys.typeScale.body, item),
            }));
        });
    };
    paintCol(left, "leftTitle", "leftItems", plan.leftTitle, plan.leftItems ?? []);
    paintCol(right, "rightTitle", "rightItems", plan.rightTitle, plan.rightItems ?? []);
    return out;
}
function fillClose(plan, sys, g) {
    const out = [];
    if (plan.variant === "manifesto") {
        const display = (0, visual_system_js_1.displaySize)(sys, plan.title ?? "");
        const titleBox = { x: g.mx, y: g.my + g.innerH * 0.12, w: g.innerW, h: display * 2.2 };
        out.push(el("title", "text", titleBox, "ink", {
            text: fitText(plan.title ?? "", display, titleBox, 2),
            fontSize: display,
            ...tx(sys, "display", display, plan.title ?? ""),
        }));
        const items = (plan.items ?? []).slice(0, ids_js_1.SLOT_CAPS.closeTakeaways);
        const y0 = titleBox.y + titleBox.h + gap(sys);
        items.forEach((item, i) => {
            const box = { x: g.mx, y: y0 + i * sys.typeScale.body * 1.8, w: g.innerW * 0.72, h: sys.typeScale.body * 1.6 };
            out.push(el("items", "text", box, "muted", {
                name: `slot:items:${i}`,
                text: fitText(item, sys.typeScale.body, box, 1, ids_js_1.SLOT_CAPS.bulletItemChars),
                fontSize: sys.typeScale.body,
                ...tx(sys, "body", sys.typeScale.body, item),
            }));
        });
        return out;
    }
    if (plan.title) {
        const t = { x: g.mx, y: g.my, w: g.innerW, h: sys.typeScale.h1 * 1.3 };
        out.push(el("title", "text", t, "ink", {
            text: fitText(plan.title, sys.typeScale.h1, t, 1),
            fontSize: sys.typeScale.h1,
            ...tx(sys, "h1", sys.typeScale.h1, plan.title),
        }));
    }
    const top = plan.title ? g.my + sys.typeScale.h1 * 1.6 : g.my;
    if (plan.variant === "next-step") {
        out.push(el("bar", "bar", { x: g.mx, y: top, w: 8, h: sys.typeScale.h1 * 2 }, "accent"));
        const box = { x: g.mx + 24, y: top, w: g.innerW - 24, h: sys.typeScale.h1 * 2.2 };
        out.push(el("next", "text", box, "ink", {
            text: fitText(plan.next ?? "", sys.typeScale.h1, box, 2),
            fontSize: sys.typeScale.h1,
            ...tx(sys, "h1", sys.typeScale.h1, plan.next ?? ""),
        }));
        return out;
    }
    const items = (plan.items ?? []).slice(0, ids_js_1.SLOT_CAPS.closeTakeaways);
    const n = Math.max(1, items.length);
    const span = Math.floor(g.cols / n);
    items.forEach((item, i) => {
        const col = g.col(i * span, i === n - 1 ? g.cols - i * span : span);
        const h = g.my + g.innerH - top;
        out.push(el("items", "surface", { x: col.x, y: top, w: col.w, h }, "surface", { name: `slot:items:${i}:panel` }));
        const numBox = { x: col.x + pad(sys), y: top + pad(sys), w: col.w - pad(sys) * 2, h: sys.typeScale.h2 * 1.2 };
        out.push(el("index", "text", numBox, "accent", {
            name: `slot:index:${i}`,
            text: idxLabel(i),
            fontSize: sys.typeScale.h2,
            ...tx(sys, "index", sys.typeScale.h2, idxLabel(i)),
        }));
        const box = {
            x: col.x + pad(sys),
            y: numBox.y + numBox.h + 8,
            w: col.w - pad(sys) * 2,
            h: sys.typeScale.body * 3,
        };
        out.push(el("items", "text", box, "ink", {
            name: `slot:items:${i}`,
            text: fitText(item, sys.typeScale.body, box, 2, ids_js_1.SLOT_CAPS.bulletItemChars),
            fontSize: sys.typeScale.body,
            ...tx(sys, "body", sys.typeScale.body, item),
        }));
    });
    return out;
}
function fillQuote(plan, sys, g) {
    const claim = plan.claim ?? plan.title ?? "";
    const display = (0, visual_system_js_1.displaySize)(sys, claim);
    const col = plan.variant === "band"
        ? sys.id === "editorial"
            ? g.col(2, 10)
            : g.col(3, 13)
        : g.col(0, sys.id === "editorial" ? 10 : 14);
    const out = [];
    if (plan.variant === "band") {
        const field = sys.id === "editorial" ? g.col(0, 2) : g.col(0, 3);
        out.push(el("bar", "bar", { x: field.x, y: g.my, w: field.w, h: g.innerH }, "accent"));
    }
    const claimBox = { x: col.x, y: g.my + g.innerH * 0.28, w: col.w, h: display * 2.2 };
    out.push(el("claim", "text", claimBox, "ink", {
        text: fitText(claim, display, claimBox, 2, ids_js_1.SLOT_CAPS.quoteChars),
        fontSize: display,
        italic: sys.id === "editorial",
        ...tx(sys, "display", display, claim),
    }));
    if (plan.note) {
        const noteBox = {
            x: col.x,
            y: claimBox.y + claimBox.h + gap(sys),
            w: col.w * 0.7,
            h: sys.typeScale.caption * 1.6,
        };
        out.push(el("note", "text", noteBox, "muted", {
            text: fitText(plan.note, sys.typeScale.caption, noteBox, 1),
            fontSize: sys.typeScale.caption,
            ...tx(sys, "kicker", sys.typeScale.caption, plan.note),
        }));
    }
    return out;
}
function fillSteps(plan, sys, g) {
    const cap = plan.variant === "row-3" ? 3 : ids_js_1.SLOT_CAPS.stepItems;
    const items = (plan.items ?? []).slice(0, cap);
    const out = [];
    const top = optionalTitle(out, plan, sys, g);
    const n = Math.max(1, items.length);
    const span = Math.floor(g.cols / n);
    const h = g.my + g.innerH - top;
    items.forEach((item, i) => {
        const col = g.col(i * span, i === n - 1 ? g.cols - i * span : span);
        const numBox = { x: col.x, y: top, w: col.w, h: sys.typeScale.h2 * 1.2 };
        out.push(el("index", "text", numBox, "accent", {
            name: `slot:index:${i}`,
            text: idxLabel(i),
            fontSize: sys.typeScale.h2,
            ...tx(sys, "index", sys.typeScale.h2, idxLabel(i)),
        }));
        if (i < n - 1) {
            out.push(el("rule", "rule", { x: col.x, y: top + sys.typeScale.h2 * 1.3, w: col.w + g.gutter, h: ruleH(sys) }, "line", {
                hairline: true,
                name: `slot:rule:${i}`,
            }));
        }
        const box = {
            x: col.x,
            y: top + sys.typeScale.h2 * 1.5,
            w: col.w - 8,
            h: Math.min(sys.typeScale.body * 4, h - sys.typeScale.h2 * 1.6),
        };
        out.push(el("items", "text", box, "ink", {
            name: `slot:items:${i}`,
            text: fitText(item, sys.typeScale.body, box, 3, ids_js_1.SLOT_CAPS.bulletItemChars),
            fontSize: sys.typeScale.body,
            ...tx(sys, "body", sys.typeScale.body, item),
        }));
    });
    return out;
}
function fillTimeline(plan, sys, g) {
    const items = (plan.items ?? []).slice(0, ids_js_1.SLOT_CAPS.timelineItems);
    const out = [];
    const top = optionalTitle(out, plan, sys, g);
    const n = Math.max(1, items.length);
    if (plan.variant === "vertical") {
        const idxCol = g.col(0, sys.id === "editorial" ? 2 : 3);
        const bodyCol = sys.id === "editorial" ? g.col(2, 10) : g.col(3, 13);
        out.push(el("rule", "rule", { x: idxCol.x + idxCol.w, y: top, w: ruleH(sys), h: g.my + g.innerH - top }, "accent", {
            hairline: true,
        }));
        const rowH = (g.my + g.innerH - top) / n;
        items.forEach((item, i) => {
            const y = top + i * rowH;
            const idxBox = { x: idxCol.x, y, w: idxCol.w - 8, h: sys.typeScale.caption * 1.6 };
            out.push(el("index", "text", idxBox, "accent", {
                name: `slot:index:${i}`,
                text: idxLabel(i),
                fontSize: sys.typeScale.caption,
                ...tx(sys, "index", sys.typeScale.caption, idxLabel(i)),
            }));
            const box = { x: bodyCol.x, y, w: bodyCol.w, h: rowH - 8 };
            out.push(el("items", "text", box, "ink", {
                name: `slot:items:${i}`,
                text: fitText(item, sys.typeScale.body, box, 2, ids_js_1.SLOT_CAPS.bulletItemChars),
                fontSize: sys.typeScale.body,
                ...tx(sys, "body", sys.typeScale.body, item),
            }));
        });
        return out;
    }
    const railY = top + sys.typeScale.h2;
    out.push(el("rule", "rule", { x: g.mx, y: railY, w: g.innerW, h: ruleH(sys) }, "accent", { hairline: true }));
    const span = Math.floor(g.cols / n);
    items.forEach((item, i) => {
        const col = g.col(i * span, i === n - 1 ? g.cols - i * span : span);
        out.push(el("index", "bar", { x: col.x, y: railY - 4, w: 8, h: 8 }, "accent", { name: `slot:node:${i}` }));
        const idxBox = { x: col.x, y: top, w: col.w, h: sys.typeScale.caption * 1.4 };
        out.push(el("index", "text", idxBox, "muted", {
            name: `slot:index:${i}`,
            text: idxLabel(i),
            fontSize: sys.typeScale.caption,
            ...tx(sys, "index", sys.typeScale.caption, idxLabel(i)),
        }));
        const box = { x: col.x, y: railY + 16, w: col.w - 8, h: sys.typeScale.body * 4 };
        out.push(el("items", "text", box, "ink", {
            name: `slot:items:${i}`,
            text: fitText(item, sys.typeScale.body, box, 3, ids_js_1.SLOT_CAPS.bulletItemChars),
            fontSize: sys.typeScale.body,
            ...tx(sys, "body", sys.typeScale.body, item),
        }));
    });
    return out;
}
function fillCards(plan, sys, g) {
    const cap = plan.variant === "six" ? ids_js_1.SLOT_CAPS.cardItems : plan.variant === "four" ? 4 : 3;
    const items = (plan.items ?? []).slice(0, cap);
    const out = [];
    const top = optionalTitle(out, plan, sys, g);
    const cols = plan.variant === "four" ? 2 : 3;
    const rows = plan.variant === "three" ? 1 : 2;
    const n = Math.max(1, items.length);
    const cellW = (g.innerW - g.gutter * (cols - 1)) / cols;
    const cellH = (g.my + g.innerH - top - g.gutter * (rows - 1)) / rows;
    for (let i = 0; i < n; i++) {
        const c = i % cols;
        const r = Math.floor(i / cols);
        const x = g.mx + c * (cellW + g.gutter);
        const y = top + r * (cellH + g.gutter);
        out.push(el("items", "surface", { x, y, w: cellW, h: cellH }, i === 0 ? "accentSoft" : "surface", {
            name: `slot:items:${i}:panel`,
        }));
        const numBox = { x: x + pad(sys), y: y + pad(sys), w: cellW - pad(sys) * 2, h: sys.typeScale.h2 };
        out.push(el("index", "text", numBox, "accent", {
            name: `slot:index:${i}`,
            text: idxLabel(i),
            fontSize: sys.typeScale.h2,
            ...tx(sys, "index", sys.typeScale.h2, idxLabel(i)),
        }));
        const box = {
            x: x + pad(sys),
            y: numBox.y + numBox.h + 8,
            w: cellW - pad(sys) * 2,
            h: Math.max(sys.typeScale.body, cellH - pad(sys) * 2 - sys.typeScale.h2 - 8),
        };
        out.push(el("items", "text", box, "ink", {
            name: `slot:items:${i}`,
            text: fitText(items[i] ?? "", sys.typeScale.body, box, 3, ids_js_1.SLOT_CAPS.bulletItemChars),
            fontSize: sys.typeScale.body,
            ...tx(sys, "body", sys.typeScale.body, items[i] ?? ""),
        }));
    }
    return out;
}
function fillBars(plan, sys, g) {
    const items = (plan.items ?? []).slice(0, ids_js_1.SLOT_CAPS.barItems);
    const out = [];
    const top = optionalTitle(out, plan, sys, g);
    const n = Math.max(1, items.length);
    const parsed = items.map((item, i) => parseBarItem(item, i, n));
    const max = Math.max(1, ...parsed.map((p) => p.weight));
    if (plan.variant === "horizontal") {
        const labelCol = g.col(0, sys.id === "editorial" ? 4 : 5);
        const barCol = sys.id === "editorial" ? g.col(4, 8) : g.col(5, 11);
        const rowH = (g.my + g.innerH - top) / n;
        parsed.forEach((p, i) => {
            const y = top + i * rowH;
            const lab = { x: labelCol.x, y: y + 8, w: labelCol.w - 8, h: sys.typeScale.body * 1.6 };
            out.push(el("items", "text", lab, "ink", {
                name: `slot:items:${i}`,
                text: fitText(p.label, sys.typeScale.body, lab, 1, ids_js_1.SLOT_CAPS.bulletItemChars),
                fontSize: sys.typeScale.body,
                ...tx(sys, "body", sys.typeScale.body, p.label),
            }));
            const bw = Math.max(8, barCol.w * (p.weight / max));
            const bh = Math.min(sys.typeScale.h2, rowH - 16);
            out.push(el("bar", "bar", { x: barCol.x, y: y + 10, w: bw, h: bh }, "accent", { name: `slot:bar:${i}` }));
        });
        return out;
    }
    const span = Math.floor(g.cols / n);
    const labelH = sys.typeScale.body * 2.2;
    const maxBarH = g.my + g.innerH - top - labelH - 8;
    parsed.forEach((p, i) => {
        const col = g.col(i * span, i === n - 1 ? g.cols - i * span : span);
        const bh = Math.max(8, maxBarH * (p.weight / max));
        const by = g.my + g.innerH - labelH - bh;
        out.push(el("bar", "bar", { x: col.x, y: by, w: col.w, h: bh }, "accent", { name: `slot:bar:${i}` }));
        const lab = { x: col.x, y: g.my + g.innerH - labelH + 4, w: col.w, h: sys.typeScale.body * 1.8 };
        out.push(el("items", "text", lab, "ink", {
            name: `slot:items:${i}`,
            text: fitText(p.label, sys.typeScale.caption, lab, 2, ids_js_1.SLOT_CAPS.bulletItemChars),
            fontSize: sys.typeScale.caption,
            ...tx(sys, "caption", sys.typeScale.caption, p.label),
        }));
    });
    return out;
}
function fillLoop(plan, sys, g) {
    const items = (plan.items ?? []).slice(0, ids_js_1.SLOT_CAPS.loopItems);
    const out = [];
    const top = optionalTitle(out, plan, sys, g);
    const cols = 2;
    const rows = 2;
    const n = Math.max(1, items.length);
    const cellW = (g.innerW - g.gutter) / cols;
    const cellH = (g.my + g.innerH - top - g.gutter) / rows;
    for (let i = 0; i < n; i++) {
        const c = i % cols;
        const r = Math.floor(i / cols);
        const x = g.mx + c * (cellW + g.gutter);
        const y = top + r * (cellH + g.gutter);
        out.push(el("items", "surface", { x, y, w: cellW, h: cellH }, i === 0 ? "accentSoft" : "surface", {
            name: `slot:items:${i}:panel`,
        }));
        const numBox = { x: x + pad(sys), y: y + pad(sys), w: cellW - pad(sys) * 2, h: sys.typeScale.h2 };
        out.push(el("index", "text", numBox, "accent", {
            name: `slot:index:${i}`,
            text: idxLabel(i),
            fontSize: sys.typeScale.h2,
            ...tx(sys, "index", sys.typeScale.h2, idxLabel(i)),
        }));
        const box = {
            x: x + pad(sys),
            y: numBox.y + numBox.h + 8,
            w: cellW - pad(sys) * 2,
            h: cellH - pad(sys) * 2 - sys.typeScale.h2,
        };
        out.push(el("items", "text", box, "ink", {
            name: `slot:items:${i}`,
            text: fitText(items[i] ?? "", sys.typeScale.body, box, 3, ids_js_1.SLOT_CAPS.bulletItemChars),
            fontSize: sys.typeScale.body,
            ...tx(sys, "body", sys.typeScale.body, items[i] ?? ""),
        }));
    }
    return out;
}
function fillGallery(plan, sys, g) {
    const cap = plan.variant === "matrix" ? ids_js_1.SLOT_CAPS.galleryItems : 3;
    const items = (plan.items ?? []).slice(0, cap);
    const cols = 3;
    const rows = plan.variant === "matrix" ? 2 : 1;
    const count = cols * rows;
    const out = [];
    const top = optionalTitle(out, plan, sys, g);
    const cellW = (g.innerW - g.gutter * (cols - 1)) / cols;
    const cellH = (g.my + g.innerH - top - g.gutter * (rows - 1)) / rows;
    const capH = sys.typeScale.caption * 2;
    for (let i = 0; i < count; i++) {
        const c = i % cols;
        const r = Math.floor(i / cols);
        const x = g.mx + c * (cellW + g.gutter);
        const y = top + r * (cellH + g.gutter);
        const imgH = cellH - capH - 8;
        const field = visualField("image", { x, y, w: cellW, h: imgH }, i === 0 ? plan.imageSrc : undefined, i % 2 === 0 ? "accentSoft" : "surface");
        out.push({ ...field, name: `slot:image:${i}` });
        if (items[i]) {
            const box = { x, y: y + imgH + 6, w: cellW, h: capH };
            out.push(el("items", "text", box, "muted", {
                name: `slot:items:${i}`,
                text: fitText(items[i], sys.typeScale.caption, box, 1, ids_js_1.SLOT_CAPS.bulletItemChars),
                fontSize: sys.typeScale.caption,
                ...tx(sys, "caption", sys.typeScale.caption, items[i]),
            }));
        }
    }
    return out;
}
function fillBanner(plan, sys, g) {
    const out = [];
    if (plan.title) {
        const t = { x: g.mx, y: g.my, w: g.innerW, h: sys.typeScale.h1 * 1.25 };
        out.push(el("title", "text", t, "ink", {
            text: fitText(plan.title, sys.typeScale.h1, t, 1),
            fontSize: sys.typeScale.h1,
            ...tx(sys, "h1", sys.typeScale.h1, plan.title),
        }));
    }
    const bandH = g.innerH * 0.28;
    const bandY = g.my + g.innerH * 0.36;
    out.push(el("bar", "bar", { x: g.mx, y: bandY, w: g.innerW, h: bandH }, "accent"));
    const next = plan.next ?? plan.claim ?? "";
    if (next) {
        const box = { x: g.mx, y: bandY + bandH + gap(sys), w: g.innerW, h: sys.typeScale.h1 * 2 };
        out.push(el("next", "text", box, "ink", {
            text: fitText(next, sys.typeScale.h1, box, 2),
            fontSize: sys.typeScale.h1,
            ...tx(sys, "h1", sys.typeScale.h1, next),
        }));
    }
    return out;
}
function fillSlide(plan, system) {
    (0, layouts_js_1.resolveLayout)(plan.layout, plan.variant);
    const g = gridOf(system);
    let elements;
    switch (plan.layout) {
        case "cover":
            elements = fillCover(plan, system, g);
            break;
        case "section":
            elements = fillSection(plan, system, g);
            break;
        case "statement":
            elements = fillStatement(plan, system, g);
            break;
        case "quote":
            elements = fillQuote(plan, system, g);
            break;
        case "bullets":
            elements = fillBullets(plan, system, g);
            break;
        case "steps":
            elements = fillSteps(plan, system, g);
            break;
        case "timeline":
            elements = fillTimeline(plan, system, g);
            break;
        case "cards":
            elements = fillCards(plan, system, g);
            break;
        case "bars":
            elements = fillBars(plan, system, g);
            break;
        case "loop":
            elements = fillLoop(plan, system, g);
            break;
        case "split":
            elements = fillSplit(plan, system, g);
            break;
        case "figure":
            elements = fillFigure(plan, system, g);
            break;
        case "gallery":
            elements = fillGallery(plan, system, g);
            break;
        case "kpi":
            elements = fillKpi(plan, system, g);
            break;
        case "compare":
            elements = fillCompare(plan, system, g);
            break;
        case "banner":
            elements = fillBanner(plan, system, g);
            break;
        case "close":
            elements = fillClose(plan, system, g);
            break;
        default:
            throw new Error(`Unknown Layout "${plan.layout}".`);
    }
    if (!(0, layouts_js_1.imageSlotsAllowed)(plan.layout, plan.variant)) {
        if (elements.some((e) => e.kind === "image")) {
            throw new Error(`Image slot not allowed on ${plan.layout}/${plan.variant}.`);
        }
    }
    return { layout: plan.layout, variant: plan.variant, elements };
}
function fillPlans(plans, system) {
    return plans.map((p) => fillSlide(p, system));
}
