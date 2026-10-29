"use strict";
/**
 * Device expanders — ppt-master's "everyday device menu" compiled to code.
 * The author only names the device and its data; geometry, type roles,
 * spacing, radius, and paint roles come from the VisualSystem. Output is
 * plain primitives (text / surface / bar / ellipse / rule / line / icon / shape)
 * so snap, reflect, paint, emit, and the editor treat them like anything else.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.expandDevice = expandDevice;
const visual_system_js_1 = require("./visual-system.js");
function el(ctx, part, kind, bbox, paintRole, extra = {}) {
    const slot = `${ctx.slot}.${part}`;
    return {
        slot,
        kind,
        name: `slot:${slot}`,
        bbox: { x: r(bbox.x), y: r(bbox.y), w: r(Math.max(1, bbox.w)), h: r(Math.max(1, bbox.h)) },
        paintRole,
        ...extra,
    };
}
function r(n) {
    return Math.round(n * 10) / 10;
}
function text(ctx, part, bbox, value, opts) {
    return el(ctx, part, "text", bbox, opts.role ?? "ink", {
        text: value,
        fontSize: opts.size,
        ...(opts.weight != null ? { fontWeight: opts.weight } : {}),
        // The keynote voice keeps labels in sentence case; caps labels belong to the mono / grotesk systems.
        ...(opts.caps && ctx.sys.voice !== "neo-grotesk" ? { caps: opts.caps } : {}),
        ...(opts.align ? { align: opts.align } : {}),
        ...(opts.italic ? { italic: true } : {}),
        ...(opts.mono ? { fontFamily: ctx.sys.fonts.mono } : {}),
        ...(opts.lineHeight != null ? { lineHeight: opts.lineHeight } : {}),
        ...(opts.link ? { link: opts.link } : {}),
    });
}
function surface(ctx, part, bbox, role = "surface", extra = {}) {
    const radius = ctx.sys.canvas.radius;
    return el(ctx, part, "surface", bbox, role, {
        ...(radius > 0 ? { rx: radius } : {}),
        ...(ctx.sys.canvas.shadow ? { shadow: { blur: 18, dx: 0, dy: 8, alpha: 0.12 } } : {}),
        ...extra,
    });
}
/** Text fits `w` at `size`? Rough CJK-aware glyph width. */
/** Average Latin advance in em for a sans at this weight: heavier faces are wider (Inter 600 digits ≈ 0.63em). */
function latinEm(weight = 400) {
    if (weight <= 300)
        return 0.55;
    if (weight < 600)
        return 0.58;
    if (weight < 700)
        return 0.63;
    return 0.66;
}
/**
 * Horizontal room the renderer takes off every text box (OOXML default lIns + rIns, 0.1in each).
 * emit sets no insets on canvas text, so a glyph estimate against the raw bbox width overshoots by
 * this much — "03" in a 1.7em box wrapped to "0 / 3" on the agenda page.
 */
const TEXT_INSET_X = 19.2;
/** Width actually available to glyphs in a `w`-wide text box, with 4 % slack: the estimate is a per-face average, the renderer is exact. */
function textRoom(w) {
    return Math.max(1, (w - TEXT_INSET_X) * 0.96);
}
function fitSize(value, w, max, min, weight = 400) {
    const em = latinEm(weight);
    const units = [...value].reduce((acc, ch) => acc + (/[\u2e80-\u9fff]/.test(ch) ? 1 : em), 0);
    const size = units > 0 ? textRoom(w) / units : max;
    return Math.max(min, Math.min(max, Math.floor(size)));
}
/** Lines `value` needs at `size` inside `w` (same glyph model as fitSize); ≥ 1. */
function lineCount(value, w, size) {
    const units = [...value].reduce((acc, ch) => acc + (/[\u2e80-\u9fff]/.test(ch) ? 1 : 0.58), 0);
    // The renderer wraps at word boundaries and measures the real face; a line the estimate says
    // fits by a hair ("拖入 .pptx" in a 175px column) comes back as two lines with an orphaned "x".
    return Math.max(1, Math.ceil((units * size) / textRoom(w)));
}
/** Box width that holds `digits` numerals at `size` / `weight` on one line, insets included. */
function numeralBoxW(digits, size, weight) {
    return Math.ceil((digits * latinEm(weight) * size) / 0.96 + TEXT_INSET_X);
}
/** Big numerals follow the voice: light on swiss-style grotesk, semibold on the keynote voice, bold elsewhere. */
function numeralWeight(sys) {
    if (sys.voice === "grotesk")
        return 300;
    if (sys.voice === "neo-grotesk")
        return 600;
    return 700;
}
/**
 * Copy that must end inside a card: step down from `size` to caption while it overflows `availH`,
 * then cut at a word boundary with an ellipsis if it still does. A note that ran under the card's
 * bottom edge was the visible failure on kpi cards with a two-line note.
 */
function fitCopy(value, w, availH, size, min, lineHeight = 1.35) {
    const fits = (t, s) => lineCount(t, w, s) * s * lineHeight <= availH;
    let s = size;
    while (s > min && !fits(value, s))
        s -= 1;
    if (fits(value, s))
        return { text: value, size: s };
    const lines = Math.max(1, Math.floor(availH / (s * lineHeight)));
    const unitsBudget = (lines * w) / s;
    const chars = [...value];
    let units = 0;
    let cut = chars.length;
    for (let i = 0; i < chars.length; i++) {
        units += /[\u2e80-\u9fff]/.test(chars[i]) ? 1 : 0.58;
        if (units > unitsBudget - 1) {
            cut = i;
            break;
        }
    }
    if (cut >= chars.length)
        return { text: value, size: s };
    const head = chars.slice(0, cut).join("");
    const atWord = /[\s，。、；：,.;:]/.test(chars[cut] ?? "") ? head : head.replace(/\s\S*$/, "");
    return { text: `${(atWord.length >= Math.min(8, cut / 2) ? atWord : head).replace(/[\s，。、；：,.;:]+$/, "")}…`, size: s };
}
function items(dev, min, max) {
    const list = (dev.items ?? []).filter((it) => it && (it.title || it.value || it.body));
    return list.slice(0, Math.max(min, Math.min(max, list.length)));
}
function pad(sys) {
    return sys.density === "airy" ? 20 : 14;
}
/** Label rows (KPI captions, attributions): caption size, but never below the projection floor. */
function labelSize(sys) {
    return Math.max(sys.typeScale.caption, visual_system_js_1.MIN_READABLE_PX);
}
/** Running copy inside a device (step / tile / row bodies) is body size — the art-director flagged 11px bodies on every live run. */
function copy(sys) {
    return Math.max(sys.typeScale.body, visual_system_js_1.MIN_READABLE_PX);
}
function gap(sys) {
    return sys.grid.gutter;
}
// ---------------------------------------------------------------------------
function kpiRow(ctx, dev, box) {
    const list = items(dev, 1, 4);
    if (!list.length)
        return [];
    const { sys } = ctx;
    const g = gap(sys);
    const p = pad(sys);
    const n = list.length;
    const cellW = (box.w - g * (n - 1)) / n;
    const out = [];
    const boxed = sys.canvas.radius > 0 || sys.canvas.tone === "dark";
    list.forEach((it, i) => {
        const x = box.x + i * (cellW + g);
        const cell = { x, y: box.y, w: cellW, h: box.h };
        if (boxed)
            out.push(surface(ctx, `kpi${i}.card`, cell, "surface"));
        else
            out.push(el(ctx, `kpi${i}.rule`, "rule", { x, y: box.y, w: cellW, h: sys.canvas.ruleWidth }, i === 0 ? "accent" : "line", { hairline: sys.canvas.ruleWidth <= 1 }));
        const innerX = x + (boxed ? p : 0);
        const innerW = cellW - (boxed ? 2 * p : 0);
        const value = (it.value ?? it.title).trim();
        const label = it.value ? it.title : (it.body ?? "");
        const valueSize = fitSize(value, innerW, Math.min(sys.typeScale.display, box.h * 0.42), sys.typeScale.h1, numeralWeight(sys));
        let y = box.y + p;
        const valueEl = text(ctx, `kpi${i}.value`, { x: innerX, y, w: innerW, h: valueSize * 1.1 }, value, { size: valueSize, weight: numeralWeight(sys), role: i === 0 || sys.canvas.glow ? "accent" : "ink", lineHeight: 1 });
        if (sys.canvas.glow)
            valueEl.glow = true;
        out.push(valueEl);
        y += valueSize * 1.1 + 6;
        if (label) {
            const ls = labelSize(sys);
            out.push(text(ctx, `kpi${i}.label`, { x: innerX, y, w: innerW, h: ls * 1.6 }, label, { size: ls, caps: "all", role: "muted", weight: 500 }));
            y += ls * 1.6 + 4;
        }
        if (it.note) {
            const avail = Math.max(sys.typeScale.caption * 1.35, box.y + box.h - p - y);
            const note = fitCopy(it.note, innerW, avail, sys.typeScale.body, sys.typeScale.caption);
            out.push(text(ctx, `kpi${i}.note`, { x: innerX, y, w: innerW, h: avail }, note.text, { size: note.size, role: "ink" }));
        }
    });
    return out;
}
function stepStrip(ctx, dev, box) {
    const list = items(dev, 2, 6);
    if (list.length < 2)
        return [];
    const { sys } = ctx;
    const n = list.length;
    const node = Math.min(44, Math.max(32, box.h * 0.22));
    const colW = box.w / n;
    const cy = box.y + node / 2;
    const out = [];
    // connector behind the nodes
    out.push(el(ctx, "line", "line", { x: box.x + colW / 2, y: cy, w: colW * (n - 1), h: 1 }, "line", {
        x2: box.x + colW / 2 + colW * (n - 1),
        y2: cy,
        hairline: sys.canvas.ruleWidth <= 1,
        dash: sys.voice === "grotesk" ? "solid" : "dash",
        arrow: "end",
    }));
    list.forEach((it, i) => {
        const cx = box.x + colW * i + colW / 2;
        // Every node reads the same; the arrowed track carries direction. Highlighting only the first
        // node was read as "one step done" / "current step" by reviewers.
        out.push(el(ctx, `step${i}.node`, "ellipse", { x: cx - node / 2, y: cy - node / 2, w: node, h: node }, "accent", sys.canvas.glow ? { glow: true } : {}));
        out.push(text(ctx, `step${i}.num`, { x: cx - node / 2, y: cy - node / 2 + node * 0.18, w: node, h: node * 0.7 }, String(i + 1), { size: Math.round(node * 0.42), role: "bg", weight: 600, align: "middle", mono: true, lineHeight: 1 }));
        const tx = box.x + colW * i + 6;
        const tw = colW - 12;
        let y = cy + node / 2 + 12;
        // Narrow columns (a step strip in a split half) wrap a short title and orphan its last
        // character: first step the size down a little (≤15 %) to keep one line, then reserve a second
        // line, and only then clip — the body never starts on top of the title either way.
        const lineH = sys.typeScale.h2 * 1.25;
        let title = fitCopy(it.title, tw, lineH, sys.typeScale.h2, Math.round(sys.typeScale.h2 * 0.85), 1.25);
        if (/…$/.test(title.text))
            title = fitCopy(it.title, tw, 2 * lineH, sys.typeScale.h2, Math.round(sys.typeScale.h2 * 0.85), 1.25);
        const titleH = title.size * 1.25 * Math.min(2, lineCount(title.text, tw, title.size)) + title.size * 0.15;
        out.push(text(ctx, `step${i}.title`, { x: tx, y, w: tw, h: titleH }, title.text, { size: title.size, weight: 600, align: "middle", lineHeight: 1.25 }));
        y += titleH + 4;
        if (it.body) {
            const bs = copy(sys);
            out.push(text(ctx, `step${i}.body`, { x: tx, y, w: tw, h: Math.max(bs * 3, box.y + box.h - y) }, it.body, { size: bs, role: "muted", align: "middle" }));
        }
    });
    return out;
}
function numberedList(ctx, dev, box) {
    const list = items(dev, 1, 6);
    if (!list.length)
        return [];
    const { sys } = ctx;
    const n = list.length;
    const rowH = box.h / n;
    const badge = Math.min(36, Math.max(26, rowH * 0.5));
    const out = [];
    list.forEach((it, i) => {
        const y = box.y + i * rowH;
        if (i > 0)
            out.push(el(ctx, `row${i}.rule`, "rule", { x: box.x, y: y - 0.5, w: box.w, h: sys.canvas.ruleWidth }, "line", { hairline: sys.canvas.ruleWidth <= 1 }));
        const by = y + Math.max(6, (rowH - badge) / 2 - (it.body ? rowH * 0.12 : 0));
        out.push(el(ctx, `row${i}.badge`, sys.canvas.radius > 0 ? "ellipse" : "surface", { x: box.x, y: by, w: badge, h: badge }, "accent"));
        out.push(text(ctx, `row${i}.num`, { x: box.x, y: by + badge * 0.2, w: badge, h: badge * 0.7 }, String(i + 1).padStart(2, "0"), { size: Math.round(badge * 0.4), role: "bg", weight: 600, align: "middle", mono: true, lineHeight: 1 }));
        const tx = box.x + badge + 14;
        const tw = box.w - badge - 14;
        const titleH = sys.typeScale.h2 * 1.35;
        out.push(text(ctx, `row${i}.title`, { x: tx, y: y + 6, w: tw, h: titleH }, it.title, { size: sys.typeScale.h2, weight: 600 }));
        if (it.body) {
            out.push(text(ctx, `row${i}.body`, { x: tx, y: y + 6 + titleH, w: tw, h: Math.max(sys.typeScale.body * 1.5, rowH - titleH - 10) }, it.body, { size: sys.typeScale.body, role: "muted" }));
        }
    });
    return out;
}
function takeawayBand(ctx, dev, box) {
    const value = (dev.text ?? dev.items?.[0]?.title ?? "").trim();
    if (!value)
        return [];
    const { sys } = ctx;
    const p = pad(sys);
    const radius = sys.canvas.radius;
    const out = [el(ctx, "band", "bar", box, "accent", radius > 0 ? { rx: Math.min(radius, box.h / 2) } : {})];
    const size = fitSize(value, box.w - 2 * p - 40, sys.typeScale.h2, sys.typeScale.body, 600);
    out.push(text(ctx, "text", { x: box.x + p, y: box.y + (box.h - size * 1.3) / 2, w: box.w - 2 * p - 40, h: size * 1.3 }, value, { size, role: "bg", weight: 600, lineHeight: 1.25 }));
    out.push(el(ctx, "icon", "icon", { x: box.x + box.w - p - 24, y: box.y + (box.h - 24) / 2, w: 24, h: 24 }, "bg", { icon: "arrow-right" }));
    return out;
}
function quoteBlock(ctx, dev, box) {
    const value = (dev.text ?? dev.items?.[0]?.title ?? "").trim();
    if (!value)
        return [];
    const { sys } = ctx;
    const out = [];
    const markSize = Math.min(sys.typeScale.display * 1.4, box.h * 0.5);
    out.push(text(ctx, "mark", { x: box.x, y: box.y - markSize * 0.15, w: markSize * 0.7, h: markSize }, "\u201C", { size: Math.round(markSize), role: "accent", weight: sys.voice === "serif" ? 700 : 300, lineHeight: 0.9 }));
    const qx = box.x + markSize * 0.55;
    const qw = box.w - markSize * 0.55;
    const long = [...value].length > 60;
    const size = long ? sys.typeScale.h2 : sys.typeScale.h1;
    const attrib = (dev.attribution ?? dev.items?.[0]?.body ?? "").trim();
    const attribH = attrib ? labelSize(sys) * 2 : 0;
    out.push(text(ctx, "quote", { x: qx, y: box.y, w: qw, h: box.h - attribH }, value, { size, weight: sys.voice === "serif" ? 400 : 300, italic: sys.voice === "serif", lineHeight: 1.3 }));
    if (attrib) {
        out.push(el(ctx, "rule", "rule", { x: qx, y: box.y + box.h - attribH - 6, w: Math.min(72, qw), h: sys.canvas.ruleWidth }, "accent", { hairline: sys.canvas.ruleWidth <= 1 }));
        out.push(text(ctx, "attrib", { x: qx, y: box.y + box.h - attribH + 4, w: qw, h: attribH }, attrib, { size: labelSize(sys), role: "muted", caps: "all", weight: 500 }));
    }
    return out;
}
function calloutNote(ctx, dev, box) {
    const value = (dev.text ?? dev.items?.[0]?.title ?? "").trim();
    if (!value)
        return [];
    const { sys } = ctx;
    const p = pad(sys);
    const out = [surface(ctx, "surface", box, "accentSoft", { shadow: undefined })];
    if (sys.canvas.radius === 0)
        out.push(el(ctx, "edge", "bar", { x: box.x, y: box.y, w: 4, h: box.h }, "accent"));
    const icon = 28;
    out.push(el(ctx, "icon", "icon", { x: box.x + p, y: box.y + p, w: icon, h: icon }, "accent", { icon: dev.icon ?? "lightbulb" }));
    out.push(text(ctx, "text", { x: box.x + p + icon + 12, y: box.y + p, w: box.w - 2 * p - icon - 12, h: box.h - 2 * p }, value, { size: sys.typeScale.body, lineHeight: 1.45 }));
    return out;
}
function comparePlanes(ctx, dev, box) {
    const left = dev.left;
    const right = dev.right;
    if (!left?.title && !right?.title)
        return [];
    const { sys } = ctx;
    const g = gap(sys) * 1.5;
    const p = pad(sys);
    const colW = (box.w - g) / 2;
    const out = [];
    const planes = [
        { key: "left", data: left, x: box.x, role: "surface", head: "ink" },
        { key: "right", data: right, x: box.x + colW + g, role: "accentSoft", head: "accent" },
    ];
    // Three points inside a 480px plane used to be spread 130px apart. Rows get a ceiling
    // (two wrapped lines + air); the planes keep the authored box (shrinking them left a void
    // inside whatever panel the author drew behind the device) and the two content blocks are
    // centred on the taller one so the headers stay aligned.
    const bs = sys.typeScale.body;
    const headH = p + sys.typeScale.h2 * 1.4 + 6 + 10;
    const rowFor = (plane) => {
        const pts = plane.data?.points.filter(Boolean).slice(0, 6) ?? [];
        const n = Math.max(1, pts.length);
        const tw = colW - 2 * p;
        const need = Math.max(1, ...pts.map((pt) => Math.min(3, lineCount(`+ ${pt}`, tw, bs)))) * bs * 1.4 + bs * 0.6;
        const spread = (box.h - headH - p) / n;
        return { rowH: Math.max(need, Math.min(spread, bs * 3)), n: pts.length };
    };
    const contentH = Math.max(...planes.filter((pl) => pl.data).map((pl) => headH + rowFor(pl).rowH * rowFor(pl).n + p));
    const offset = Math.max(0, (box.h - contentH) / 2);
    for (const plane of planes) {
        if (!plane.data)
            continue;
        const cell = { x: plane.x, y: box.y, w: colW, h: box.h };
        out.push(surface(ctx, `${plane.key}.plane`, cell, plane.role, { shadow: undefined }));
        let y = box.y + p + offset;
        // The header owns one line above the rule: step the size down (to body) before it wraps onto
        // the rule and the first point.
        const head = fitCopy(plane.data.title, colW - 2 * p, sys.typeScale.h2 * 1.4, sys.typeScale.h2, bs, 1.4);
        out.push(text(ctx, `${plane.key}.title`, { x: plane.x + p, y, w: colW - 2 * p, h: sys.typeScale.h2 * 1.4 }, head.text, { size: head.size, weight: 600, role: plane.head }));
        y += sys.typeScale.h2 * 1.4 + 6;
        out.push(el(ctx, `${plane.key}.rule`, "rule", { x: plane.x + p, y, w: colW - 2 * p, h: sys.canvas.ruleWidth }, plane.head === "accent" ? "accent" : "line", { hairline: sys.canvas.ruleWidth <= 1 }));
        y += 10;
        const points = plane.data.points.filter(Boolean).slice(0, 6);
        const { rowH } = rowFor(plane);
        points.forEach((pt, i) => {
            out.push(text(ctx, `${plane.key}.p${i}`, { x: plane.x + p, y: y + i * rowH, w: colW - 2 * p, h: rowH }, `${plane.head === "accent" ? "+" : "–"} ${pt}`, { size: bs, lineHeight: 1.4 }));
        });
    }
    return out;
}
function iconLabelGrid(ctx, dev, box) {
    const list = items(dev, 1, 6);
    if (!list.length)
        return [];
    const { sys } = ctx;
    const n = list.length;
    const cols = n <= 3 ? n : Math.ceil(n / 2);
    const rows = Math.ceil(n / cols);
    const g = gap(sys);
    const p = pad(sys);
    const cellW = (box.w - g * (cols - 1)) / cols;
    const cellH = (box.h - g * (rows - 1)) / rows;
    const out = [];
    // Body copy is now body-size; keep the icon modest so title + two lines of body fit a 2-row grid.
    const icon = Math.min(36, Math.max(20, cellH * 0.18));
    const bs = copy(sys);
    const titleH = sys.typeScale.h2 * 1.35;
    list.forEach((it, i) => {
        const c = i % cols;
        const rIdx = Math.floor(i / cols);
        const x = box.x + c * (cellW + g);
        const y = box.y + rIdx * (cellH + g);
        const tw = cellW - 2 * p;
        const bodyH = it.body ? Math.min(3, lineCount(it.body, tw, bs)) * bs * 1.5 : 0;
        // A 2×2 grid on a full-width box leaves each card far taller than icon + title + body.
        // Centre the stack inside the card instead of pinning it to the top edge and leaving a void.
        const contentH = icon + 10 + titleH + (it.body ? 4 + bodyH : 0);
        const offset = Math.max(0, (cellH - 2 * p - contentH) / 2);
        out.push(surface(ctx, `tile${i}.card`, { x, y, w: cellW, h: cellH }, "surface"));
        out.push(el(ctx, `tile${i}.icon`, "icon", { x: x + p, y: y + p + offset, w: icon, h: icon }, "accent", { icon: it.icon ?? it.note ?? "sparkles" }));
        let ty = y + p + offset + icon + 10;
        out.push(text(ctx, `tile${i}.title`, { x: x + p, y: ty, w: tw, h: titleH }, it.title, { size: sys.typeScale.h2, weight: 600 }));
        ty += titleH + 4;
        if (it.body) {
            const avail = Math.max(sys.typeScale.caption * 1.5, y + cellH - p - ty);
            const body = fitCopy(it.body, tw, avail, bs, sys.typeScale.caption, 1.5);
            out.push(text(ctx, `tile${i}.body`, { x: x + p, y: ty, w: tw, h: Math.min(avail, Math.max(body.size * 1.5, bodyH)) }, body.text, { size: body.size, role: "muted" }));
        }
    });
    return out;
}
/**
 * Contents page. Rows of numeral + title (+ one-line body) separated by hairlines; every text in
 * a row carries `link` to the row's page so the reader can click straight into a section. Six or
 * more rows split into two columns so the type stays at h2 instead of shrinking to fit.
 */
function agendaList(ctx, dev, box) {
    const list = items(dev, 2, 8);
    if (list.length < 2)
        return [];
    const { sys } = ctx;
    const n = list.length;
    const cols = n >= 6 && box.w >= 640 ? 2 : 1;
    const perCol = Math.ceil(n / cols);
    const g = gap(sys) * 2;
    const colW = (box.w - g * (cols - 1)) / cols;
    const rowH = box.h / perCol;
    const numSize = Math.max(sys.typeScale.h2, Math.min(sys.typeScale.h1, rowH * 0.42));
    const numW = numeralBoxW(2, numSize, numeralWeight(sys));
    const out = [];
    list.forEach((it, i) => {
        const c = Math.floor(i / perCol);
        const rIdx = i % perCol;
        const x = box.x + c * (colW + g);
        const y = box.y + rIdx * rowH;
        const link = it.target && it.target > 0 ? { link: it.target } : {};
        if (rIdx > 0)
            out.push(el(ctx, `row${i}.rule`, "rule", { x, y: y - 0.5, w: colW, h: sys.canvas.ruleWidth }, "line", { hairline: sys.canvas.ruleWidth <= 1 }));
        const tx = x + numW + 8;
        const tw = colW - numW - 8 - 28;
        const lineH = sys.typeScale.h2 * 1.35;
        const bodyLineH = copy(sys) * 1.5;
        let bodyH = it.body ? Math.min(2, lineCount(it.body, tw, copy(sys))) * bodyLineH : 0;
        // A title that does not fit the row on one line at h2 first steps down a little (≤15%), then
        // takes a second line when the row has room for it, and only then is clipped — a wrapped title
        // used to run straight into the body line under it.
        let title = fitCopy(it.title, tw, lineH, sys.typeScale.h2, Math.round(sys.typeScale.h2 * 0.85));
        let titleH = lineH;
        if (/…$/.test(title.text)) {
            const roomForTwo = rowH - 12 >= 2 * lineH + Math.min(bodyH, bodyLineH);
            title = roomForTwo ? fitCopy(it.title, tw, 2 * lineH, sys.typeScale.h2, Math.round(sys.typeScale.h2 * 0.85)) : fitCopy(it.title, tw, lineH, sys.typeScale.h2, copy(sys));
            titleH = lineCount(title.text, tw, title.size) * title.size * 1.35;
        }
        // The body takes what the row leaves under the title — two lines when there is room, else
        // one, cut at a word boundary — so a wrapped body never crosses the hairline into the next row.
        const bodyRoom = titleH > lineH ? bodyLineH : Math.max(bodyLineH, Math.min(bodyH, rowH - 12 - titleH));
        const body = it.body ? fitCopy(it.body, tw, bodyRoom, copy(sys), copy(sys), 1.5) : undefined;
        if (body)
            bodyH = lineCount(body.text, tw, body.size) * bodyLineH;
        const blockH = titleH + bodyH;
        const ty = y + Math.max(6, (rowH - blockH) / 2);
        out.push(text(ctx, `row${i}.num`, { x, y: ty - (numSize - sys.typeScale.h2) * 0.35, w: numW, h: numSize * 1.2 }, String(i + 1).padStart(2, "0"), { size: Math.round(numSize), role: "accent", weight: numeralWeight(sys), mono: sys.voice !== "neo-grotesk", lineHeight: 1, ...link }));
        out.push(text(ctx, `row${i}.title`, { x: tx, y: ty, w: tw, h: titleH }, title.text, { size: title.size, weight: 600, ...link }));
        if (body)
            out.push(text(ctx, `row${i}.body`, { x: tx, y: ty + titleH, w: tw, h: bodyH }, body.text, { size: body.size, role: "muted", ...link }));
        out.push(el(ctx, `row${i}.go`, "icon", { x: x + colW - 20, y: ty + (lineH - 20) / 2, w: 20, h: 20 }, "muted", { icon: "arrow-right", ...link }));
    });
    return out;
}
/** Expand one device element into primitives inside its (already snapped) bbox. */
function expandDevice(devEl, sys) {
    const dev = devEl.device;
    if (!dev)
        return [];
    const ctx = { sys, slot: devEl.slot };
    const box = devEl.bbox;
    switch (dev.type) {
        case "kpiRow":
            return kpiRow(ctx, dev, box);
        case "stepStrip":
            return stepStrip(ctx, dev, box);
        case "numberedList":
            return numberedList(ctx, dev, box);
        case "takeawayBand":
            return takeawayBand(ctx, dev, box);
        case "quoteBlock":
            return quoteBlock(ctx, dev, box);
        case "calloutNote":
            return calloutNote(ctx, dev, box);
        case "comparePlanes":
            return comparePlanes(ctx, dev, box);
        case "iconLabelGrid":
            return iconLabelGrid(ctx, dev, box);
        case "agendaList":
            return agendaList(ctx, dev, box);
    }
    return [];
}
