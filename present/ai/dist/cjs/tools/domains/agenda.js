"use strict";
// AI 目录 / 导航工具 —— 插入带「点击跳转」的目录页。
//
// 目录页由 deckgen 的 agendaList device 编译（同一套 VisualSystem / ColorTheme），每一行
// 都是 shape-level `hyperlink { kind: "slide" }`（OOXML ppaction://hlinksldjump），播放器、
// 导出、编辑器超链接对话框都认。非 deckgen 生成的 deck 也能用：视觉系统退回 editorial，
// 配色从 pres.theme.colors 取 bg / ink / accent。
Object.defineProperty(exports, "__esModule", { value: true });
exports.agendaTools = void 0;
exports.slideTitleText = slideTitleText;
exports.agendaRowsFromDeck = agendaRowsFromDeck;
exports.lookForDeck = lookForDeck;
exports.buildAgendaSlide = buildAgendaSlide;
const zod_1 = require("zod");
const slide_commands_1 = require("../commands/slide-commands");
const types_1 = require("../types");
const pipeline_1 = require("../../deckgen/pipeline");
const visual_system_1 = require("../../deckgen/visual-system");
const ids_1 = require("../../deckgen/ids");
const color_theme_1 = require("../../deckgen/color-theme");
const HEX = /^#([0-9a-fA-F]{6})$/;
/** Visible title of a slide: title placeholder first, else the largest text. */
function slideTitleText(slide) {
    const texts = slide.layers.flatMap((l) => l.shapes).filter((s) => s.kind === "text");
    const read = (t) => t.paragraphs
        .map((p) => p.runs.map((r) => r.text ?? "").join(""))
        .join(" ")
        .trim();
    const ph = texts.find((t) => /title/i.test(t.placeholder?.type ?? "") || /^slot:title/.test(t.name ?? ""));
    if (ph && read(ph))
        return read(ph);
    const sized = texts
        .map((t) => ({ t, size: Math.max(0, ...t.paragraphs.flatMap((p) => p.runs.map((r) => r.fontSize ?? 0))) }))
        .filter((x) => read(x.t) && !/^\d{1,2}$/.test(read(x.t)))
        .sort((a, b) => b.size - a.size);
    return sized[0] ? read(sized[0].t) : undefined;
}
function isSectionSlide(slide) {
    const tag = slide.customData?.tags?.layout;
    if (tag)
        return tag === "section";
    const layoutId = slide.layoutRef?.layoutId ?? "";
    return /section/i.test(layoutId) || /^section/i.test(slide.name ?? "");
}
function isAgendaSlide(slide) {
    const tag = slide.customData?.tags?.layout;
    return tag === "agenda" || /agenda|contents|目录/i.test(slide.name ?? "");
}
/**
 * Default rows: section pages when the deck has ≥ 2, else every content page (not cover, not the
 * close, not an existing agenda). `indexOffset` shifts targets for the slide about to be inserted.
 */
function agendaRowsFromDeck(pres, insertAt) {
    const slides = pres.slides;
    const candidates = slides
        .map((s, i) => ({ s, i }))
        .filter(({ i }) => i > 0 && i < slides.length - 1)
        .filter(({ s }) => !isAgendaSlide(s));
    const sections = candidates.filter(({ s }) => isSectionSlide(s));
    const pick = sections.length >= 2 ? sections : candidates;
    return pick
        .map(({ s, i }) => ({ title: slideTitleText(s) ?? `Page ${i + 1}`, target: i + (i >= insertAt ? 2 : 1) }))
        .slice(0, 8);
}
/** VisualSystem + ColorTheme for a new deckgen page inside this deck (deckgen decks keep theirs). */
function lookForDeck(pres) {
    const meta = pres.meta?.deckgen;
    const systemId = meta?.system && (0, ids_1.isVisualSystemId)(meta.system) ? meta.system : "editorial";
    const colors = (pres.theme?.colors ?? {});
    const hex = (...keys) => keys.map((k) => colors[k]).find((v) => v && HEX.test(v));
    const bg = hex("bg", "bg1", "lt1");
    const ink = hex("ink", "tx1", "dk1");
    const accent = hex("accent", "accent1");
    const palette = bg && ink && accent ? { bg, ink, accent, ...(colors.surface && HEX.test(colors.surface) ? { surface: colors.surface } : {}), ...(colors.muted && HEX.test(colors.muted) ? { muted: colors.muted } : {}) } : undefined;
    const theme = (0, color_theme_1.themeFromAuthoredLook)({
        systemId: systemId,
        ...(meta?.theme && meta.theme !== "custom" ? { themeId: meta.theme } : {}),
        ...(palette ? { palette } : {}),
    });
    return { systemId, theme };
}
/** Compile one agenda canvas into an editor Slide that fits this deck (size, master, background). */
function buildAgendaSlide(pres, opts) {
    const { systemId, theme } = lookForDeck(pres);
    const system = (0, visual_system_1.resolveVisualSystem)(systemId);
    const ts = system.typeScale;
    const mx = visual_system_1.CANVAS.width * system.grid.margin;
    const my = visual_system_1.CANVAS.height * system.grid.margin;
    const eyebrow = opts.cjk ? `共 ${opts.rows.length} 部分` : `${opts.rows.length} SECTIONS`;
    const filled = {
        layout: "agenda",
        variant: "canvas",
        elements: [
            { slot: "eyebrow", kind: "text", name: "slot:eyebrow", bbox: { x: mx, y: my + 16, w: 400, h: ts.caption * 1.6 }, paintRole: "accent", text: eyebrow, fontSize: ts.caption, caps: "all" },
            { slot: "title", kind: "text", name: "slot:title", bbox: { x: mx, y: my + 52, w: visual_system_1.CANVAS.width - 2 * mx, h: ts.h1 * 1.3 }, paintRole: "ink", text: opts.title, fontSize: ts.h1 },
            {
                slot: "agenda",
                kind: "device",
                name: "device:agenda",
                bbox: { x: mx, y: my + 52 + ts.h1 * 1.3 + 32, w: visual_system_1.CANVAS.width - 2 * mx, h: visual_system_1.CANVAS.height - (my + 52 + ts.h1 * 1.3 + 32) - my - 8 },
                paintRole: "surface",
                device: { type: "agendaList", items: opts.rows.map((r) => ({ title: r.title, ...(r.body ? { body: r.body } : {}), target: r.target })) },
            },
        ],
    };
    const compiled = (0, pipeline_1.compileCanvasDeck)({ system, theme, slides: [filled], title: opts.title });
    const slide = compiled.presentation.slides[0];
    const pal = (0, color_theme_1.paletteOf)(theme);
    const out = { ...slide, id: `slide_agenda_${Date.now().toString(36)}`, name: "Agenda" };
    // Keep a master reference only when this deck owns that deckgen master (same system / theme id);
    // its layout set may lack "agenda", so fall back to any layout of that master. Otherwise paint the paper.
    const master = pres.masters?.find((m) => m.id === slide.layoutRef?.masterId);
    const layout = master?.layouts?.find((l) => l.id === slide.layoutRef?.layoutId) ?? master?.layouts?.[0];
    if (master && layout) {
        out.layoutRef = { masterId: master.id, layoutId: layout.id };
    }
    else {
        delete out.layoutRef;
        out.background = { kind: "solid", color: pal.bg };
    }
    // Fit a non-1280×720 deck by uniform scale of every bbox.
    const sx = (pres.size?.width ?? visual_system_1.CANVAS.width) / visual_system_1.CANVAS.width;
    const sy = (pres.size?.height ?? visual_system_1.CANVAS.height) / visual_system_1.CANVAS.height;
    if (sx !== 1 || sy !== 1) {
        const scale = (sh) => {
            sh.bbox = { x: sh.bbox.x * sx, y: sh.bbox.y * sy, w: sh.bbox.w * sx, h: sh.bbox.h * sy };
        };
        out.layers = out.layers.map((l) => ({ ...l, shapes: l.shapes.map((s) => ({ ...s })) }));
        for (const l of out.layers)
            l.shapes.forEach(scale);
    }
    return out;
}
exports.agendaTools = [
    (0, types_1.defineTool)({
        name: "insertAgendaSlide",
        description: [
            "Insert a contents / agenda (目录) slide whose rows are click-to-jump links to their pages (OOXML slide hyperlinks; work in the player and in PowerPoint).",
            "Rows default to the deck's section slides (or every content slide when there are fewer than two sections); pass `items` to control titles and 1-based `target` pages yourself — targets refer to page numbers AFTER insertion.",
            "The page is compiled in the deck's own visual system and palette (deckgen decks keep their look; others get an editorial page on the theme paper).",
            "Use when the user asks for 目录 / agenda / table of contents / navigation page. One agenda per deck; call again to rebuild after reordering slides (delete the old one first).",
        ].join(" "),
        inputSchema: zod_1.z.object({
            insertAt: zod_1.z.number().int().min(0).optional().describe("0-based position; default 1 (right after the cover)."),
            title: zod_1.z.string().min(1).max(40).optional().describe('Page title; default "Contents" / "目录" following the deck language.'),
            items: zod_1.z
                .array(zod_1.z.object({
                title: zod_1.z.string().min(1).max(48),
                body: zod_1.z.string().max(120).optional(),
                target: zod_1.z.number().int().min(1).describe("1-based page this row opens (after insertion)."),
            }))
                .min(2)
                .max(8)
                .optional(),
        }),
        tags: ["mutate", "slide"],
        execute: (rt, input) => {
            const pres = rt.getPres();
            if (pres.slides.length < 2)
                return (0, types_1.err)("Need at least 2 slides to build an agenda.");
            const insertAt = Math.min(input.insertAt ?? 1, pres.slides.length);
            const rows = input.items ?? agendaRowsFromDeck(pres, insertAt);
            if (rows.length < 2)
                return (0, types_1.err)("Could not derive ≥ 2 agenda rows from this deck; pass `items` explicitly.");
            const total = pres.slides.length + 1;
            const bad = rows.filter((r) => r.target < 1 || r.target > total || r.target === insertAt + 1);
            if (bad.length)
                return (0, types_1.err)(`Agenda targets out of range (1..${total}, not the agenda page itself): ${bad.map((b) => b.target).join(", ")}`);
            const cjk = rows.some((r) => /[\u3400-\u9fff]/.test(r.title)) || /[\u3400-\u9fff]/.test(slideTitleText(pres.slides[0]) ?? "");
            const title = input.title ?? (cjk ? "目录" : "Contents");
            const slide = buildAgendaSlide(pres, { title, rows, cjk });
            const res = rt.apply(new slide_commands_1.InsertSlideCmd(insertAt, slide));
            if (!res.ok)
                return res;
            const linked = slide.layers.flatMap((l) => l.shapes).filter((s) => s.hyperlink?.kind === "slide").length;
            return (0, types_1.ok)({ slideIdx: insertAt, rows: rows.map((r) => ({ title: r.title, target: r.target })), linkedShapes: linked });
        },
    }),
];
