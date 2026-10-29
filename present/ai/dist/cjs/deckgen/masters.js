"use strict";
/**
 * Real slide master + layouts for a deckgen Presentation.
 *
 * Canvas pages keep their authored shapes on the slide. The master holds the
 * theme background, type styles, shared chrome, and placeholder layouts so
 * Master View / "new slide" / layout switching have something real to edit.
 * Solid pages inherit `master.background`; photo canvases keep their own
 * background and hide master chrome (`showMasterSp: false`).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.deckgenMasterId = deckgenMasterId;
exports.deckgenLayoutId = deckgenLayoutId;
exports.ooxmlTypeForLayout = ooxmlTypeForLayout;
exports.buildDeckgenMasters = buildDeckgenMasters;
const core_1 = require("@sliiu/present-core");
const visual_system_js_1 = require("./visual-system.js");
const color_theme_js_1 = require("./color-theme.js");
const ids_js_1 = require("./ids.js");
const W = visual_system_js_1.CANVAS.width;
const H = visual_system_js_1.CANVAS.height;
function familyName(stack) {
    const m = stack.trim().match(/^"([^"]+)"|^'([^']+)'|^([^,]+)/);
    return (m?.[1] ?? m?.[2] ?? m?.[3] ?? stack).trim();
}
function base() {
    return {
        zIndex: 0,
        visible: true,
        locked: false,
        opacity: 1,
        transform: (0, core_1.identityTransform)(),
    };
}
function deckgenMasterId(systemId, themeId) {
    return `dg_${systemId}_${themeId}_master`;
}
function deckgenLayoutId(masterId, layout) {
    const key = layout.replace(/[^a-zA-Z0-9_-]+/g, "_") || "blank";
    return `${masterId}__${key}`;
}
/** OOXML ST_SlideLayoutType for a deckgen layout name. */
function ooxmlTypeForLayout(layout) {
    switch (layout) {
        case "cover":
        case "statement":
        case "quote":
        case "close":
        case "banner":
            return "title";
        case "section":
            return "secHead";
        case "split":
        case "compare":
            return "twoObj";
        case "figure":
        case "gallery":
            return "picTx";
        case "blank":
            return "blank";
        default:
            return "obj";
    }
}
function layoutTitle(id) {
    if (id === "blank")
        return "Blank";
    if (id === "kpi")
        return "KPI";
    return id.replace(/(^|-)([a-z])/g, (_, sep, c) => `${sep ? " " : ""}${c.toUpperCase()}`);
}
function phText(args) {
    return {
        ...base(),
        id: args.id,
        kind: "text",
        name: args.name,
        bbox: args.bbox,
        wrap: true,
        vAlign: "top",
        placeholder: { type: args.type, idx: args.idx },
        paragraphs: [
            {
                align: args.align ?? "start",
                runs: [
                    {
                        text: args.text,
                        color: args.color,
                        fontFamily: args.fontFamily,
                        fontSize: args.fontSize,
                        fontWeight: args.fontWeight,
                    },
                ],
            },
        ],
    };
}
function phPic(id, bbox, idx, fill) {
    return {
        ...base(),
        id,
        kind: "rect",
        name: "Picture Placeholder",
        bbox,
        fill: { kind: "solid", color: fill },
        placeholder: { type: "pic", idx },
    };
}
function chromeRect(id, name, bbox, fill) {
    return {
        ...base(),
        locked: true,
        id,
        kind: "rect",
        name,
        bbox,
        fill,
        userDrawn: true,
    };
}
function masterPlaceholders(sys, ink, muted) {
    const mx = Math.round(W * sys.grid.margin);
    const my = Math.round(H * sys.grid.margin);
    const titleH = Math.max(48, Math.round(sys.typeScale.h1 * 1.35));
    const footerH = 22;
    const display = familyName(sys.fonts.display);
    const body = familyName(sys.fonts.body);
    const titleWeight = (0, visual_system_js_1.typeRole)(sys, "h1", sys.typeScale.h1).fontWeight;
    return [
        phText({
            id: "ph_title",
            name: "Title",
            bbox: { x: mx, y: my, w: W - mx * 2, h: titleH },
            type: "title",
            idx: "0",
            text: "Click to edit Master title style",
            color: ink,
            fontFamily: display,
            fontSize: sys.typeScale.h1,
            fontWeight: titleWeight,
        }),
        phText({
            id: "ph_body",
            name: "Content",
            bbox: { x: mx, y: my + titleH + sys.grid.gutter, w: W - mx * 2, h: H - my * 2 - titleH - sys.grid.gutter - 40 },
            type: "body",
            idx: "1",
            text: "Click to edit Master text styles",
            color: ink,
            fontFamily: body,
            fontSize: sys.typeScale.body,
            fontWeight: 400,
        }),
        phText({
            id: "ph_dt",
            name: "Date Placeholder",
            bbox: { x: mx, y: H - my - footerH, w: 200, h: footerH },
            type: "dt",
            idx: "2",
            text: "Date",
            color: muted,
            fontFamily: body,
            fontSize: sys.typeScale.caption,
            fontWeight: 400,
        }),
        phText({
            id: "ph_ftr",
            name: "Footer Placeholder",
            bbox: { x: W / 2 - 160, y: H - my - footerH, w: 320, h: footerH },
            type: "ftr",
            idx: "3",
            text: "Footer",
            color: muted,
            fontFamily: body,
            fontSize: sys.typeScale.caption,
            fontWeight: 400,
            align: "middle",
        }),
        phText({
            id: "ph_sldnum",
            name: "Slide Number Placeholder",
            bbox: { x: W - mx - 72, y: H - my - footerH, w: 72, h: footerH },
            type: "sldNum",
            idx: "4",
            text: "‹#›",
            color: muted,
            fontFamily: body,
            fontSize: sys.typeScale.caption,
            fontWeight: 400,
            align: "end",
        }),
    ];
}
function masterChrome(sys, accent) {
    if (sys.canvas.tone !== "dark")
        return [];
    return [
        chromeRect("chrome_spine", "Accent bar", { x: 0, y: 0, w: 6, h: H }, { kind: "solid", color: accent }),
    ];
}
function layoutShapes(layout, sys, ink, muted, surface) {
    const mx = Math.round(W * sys.grid.margin);
    const my = Math.round(H * sys.grid.margin);
    const display = familyName(sys.fonts.display);
    const body = familyName(sys.fonts.body);
    const type = ooxmlTypeForLayout(layout);
    const titleH = Math.max(44, Math.round(sys.typeScale.h1 * 1.3));
    const title = (id, ph, idx, bbox, size, role, text) => phText({
        id,
        name: "Title",
        bbox,
        type: ph,
        idx,
        text,
        color: ink,
        fontFamily: display,
        fontSize: size,
        fontWeight: (0, visual_system_js_1.typeRole)(sys, role, size).fontWeight,
    });
    const bodyPh = (id, idx, bbox) => phText({
        id,
        name: "Content",
        bbox,
        type: "body",
        idx,
        text: "Click to add text",
        color: ink,
        fontFamily: body,
        fontSize: sys.typeScale.body,
        fontWeight: 400,
    });
    if (type === "blank")
        return [];
    if (type === "title") {
        const y = layout === "cover" ? Math.round(H * 0.32) : Math.round(H * 0.28);
        return [
            title("ph_ctrTitle", "ctrTitle", "0", { x: mx, y, w: W - mx * 2, h: Math.round(sys.typeScale.display * 1.5) }, sys.typeScale.display, "display", "Click to add title"),
            phText({
                id: "ph_subTitle",
                name: "Subtitle",
                bbox: { x: mx, y: y + Math.round(sys.typeScale.display * 1.5) + 12, w: W - mx * 2, h: 64 },
                type: "subTitle",
                idx: "1",
                text: "Click to add subtitle",
                color: muted,
                fontFamily: body,
                fontSize: sys.typeScale.h2,
                fontWeight: 400,
            }),
        ];
    }
    if (type === "secHead") {
        return [
            title("ph_title", "title", "0", { x: mx, y: Math.round(H * 0.38), w: W - mx * 2, h: titleH + 24 }, sys.typeScale.display, "display", "Section title"),
        ];
    }
    if (type === "twoObj") {
        const top = my + titleH + sys.grid.gutter;
        const colW = Math.round((W - mx * 2 - sys.grid.gutter) / 2);
        const colH = H - top - my - 36;
        return [
            title("ph_title", "title", "0", { x: mx, y: my, w: W - mx * 2, h: titleH }, sys.typeScale.h1, "h1", "Click to add title"),
            bodyPh("ph_body_l", "1", { x: mx, y: top, w: colW, h: colH }),
            bodyPh("ph_body_r", "2", { x: mx + colW + sys.grid.gutter, y: top, w: colW, h: colH }),
        ];
    }
    if (type === "picTx") {
        const top = my + titleH + sys.grid.gutter;
        return [
            title("ph_title", "title", "0", { x: mx, y: my, w: W - mx * 2, h: titleH }, sys.typeScale.h1, "h1", "Click to add title"),
            phPic("ph_pic", { x: mx, y: top, w: W - mx * 2, h: H - top - my - 36 }, "1", surface),
        ];
    }
    return [
        title("ph_title", "title", "0", { x: mx, y: my, w: W - mx * 2, h: titleH }, sys.typeScale.h1, "h1", "Click to add title"),
        bodyPh("ph_body", "1", { x: mx, y: my + titleH + sys.grid.gutter, w: W - mx * 2, h: H - my * 2 - titleH - sys.grid.gutter - 36 }),
    ];
}
function buildLayout(masterId, layout, sys, ink, muted, surface) {
    return {
        id: deckgenLayoutId(masterId, layout),
        name: layoutTitle(layout),
        type: ooxmlTypeForLayout(layout),
        shapes: layoutShapes(layout, sys, ink, muted, surface),
        preserve: true,
        hf: { sldNum: false, ftr: false, dt: false },
    };
}
/**
 * One master covering the locked layout catalog plus any extra canvas layout names.
 */
function buildDeckgenMasters(system, theme, extraLayouts = []) {
    const pal = (0, color_theme_js_1.paletteOf)(theme);
    const masterId = deckgenMasterId(system.id, theme.id);
    const extras = [];
    const seen = new Set(ids_js_1.LAYOUT_IDS);
    seen.add("blank");
    for (const name of extraLayouts) {
        const key = (name || "").trim();
        if (!key || seen.has(key))
            continue;
        seen.add(key);
        extras.push(key);
    }
    const order = [...ids_js_1.LAYOUT_IDS, ...extras, "blank"];
    const layouts = order.map((id) => buildLayout(masterId, id, system, pal.ink, pal.muted, pal.surface));
    const titleW = (0, visual_system_js_1.typeRole)(system, "h1", system.typeScale.h1).fontWeight;
    return [
        {
            id: masterId,
            name: `${system.name} Master`,
            background: { kind: "solid", color: pal.bg },
            shapes: [...masterChrome(system, pal.accent), ...masterPlaceholders(system, pal.ink, pal.muted)],
            layouts,
            preserve: true,
            hf: { sldNum: false, ftr: false, dt: false },
            txStyles: {
                title: [{ rPr: { fontFamily: familyName(system.fonts.display), fontSize: system.typeScale.h1, fontWeight: titleW, color: pal.ink } }],
                body: [{ rPr: { fontFamily: familyName(system.fonts.body), fontSize: system.typeScale.body, fontWeight: 400, color: pal.ink } }],
                other: [{ rPr: { fontFamily: familyName(system.fonts.body), fontSize: system.typeScale.caption, fontWeight: 400, color: pal.muted } }],
            },
        },
    ];
}
