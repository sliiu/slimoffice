"use strict";
// AI 图标工具 —— 在页面上放置矢量 lucide 图标（stroke-only PathShape，可编辑、可换色、可导出）。
//
// 生成链路的 canvas 作者已经能写 kind:"icon"；对话侧此前只能用 shape / image 凑，这里补齐。
Object.defineProperty(exports, "__esModule", { value: true });
exports.iconTools = void 0;
exports.allIconIds = allIconIds;
exports.searchIconIds = searchIconIds;
const zod_1 = require("zod");
const lucide_1 = require("lucide");
const commands_1 = require("@sliiu/present-editor/commands");
const types_1 = require("../types");
const summaries_1 = require("../summaries");
const icons_1 = require("../../deckgen/icons");
const vocab_1 = require("../../deckgen/vocab");
const HEX = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
function pascalToKebab(s) {
    return s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}
/** Every lucide id in the shipped build, kebab-case, curated ids first. */
function allIconIds() {
    const curated = new Set(vocab_1.CANVAS_ICON_IDS);
    const rest = Object.keys(lucide_1.icons).map(pascalToKebab).filter((id) => !curated.has(id)).sort();
    return [...vocab_1.CANVAS_ICON_IDS, ...rest];
}
function searchIconIds(query, limit = 24) {
    const terms = query.toLowerCase().split(/[\s,/_-]+/).filter(Boolean);
    if (!terms.length)
        return vocab_1.CANVAS_ICON_IDS.slice(0, limit);
    const all = allIconIds();
    const score = (id) => terms.reduce((acc, t) => acc + (id === t ? 3 : id.startsWith(t) ? 2 : id.includes(t) ? 1 : 0), 0);
    return all
        .map((id) => ({ id, s: score(id) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s || a.id.localeCompare(b.id))
        .slice(0, limit)
        .map((x) => x.id);
}
exports.iconTools = [
    (0, types_1.defineTool)({
        name: "searchIcons",
        description: "Find lucide icon ids by keyword (English: 'shield', 'chart', 'rocket', 'team'). Returns ids to pass to insertIcon. Curated deck icons rank first.",
        inputSchema: zod_1.z.object({ query: zod_1.z.string().max(80), limit: zod_1.z.number().int().min(1).max(60).optional() }),
        tags: ["read"],
        execute: (_rt, { query, limit }) => (0, types_1.ok)({ icons: searchIconIds(query, limit ?? 24) }),
    }),
    (0, types_1.defineTool)({
        name: "insertIcon",
        description: [
            "Insert a vector lucide icon as an editable stroke path on a slide (kind=path, scalable, recolorable, exports to PPTX as a freeform).",
            "Use beside a label / in a card / as a bullet marker — never as decoration on its own. Size 20–96 px is the usual range; the icon is fitted uniformly in bbox.",
            "To swap a library icon that is already on the slide (image with a ppt-icon description) without moving its box, use replaceIcon instead.",
            "Color defaults to the theme accent; check contrast against whatever fill sits under it (a dark icon on a dark card is invisible).",
        ].join(" "),
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            icon: zod_1.z.string().min(1).describe("lucide id (kebab-case), e.g. 'shield-check', 'bar-chart-3', 'rocket'. Use searchIcons when unsure."),
            bbox: zod_1.z.object({ x: zod_1.z.number(), y: zod_1.z.number(), w: zod_1.z.number().positive(), h: zod_1.z.number().positive() }),
            color: zod_1.z.string().regex(HEX).optional().describe("#rrggbb; default theme accent."),
            strokeWidth: zod_1.z.number().positive().max(8).optional(),
            name: zod_1.z.string().max(60).optional(),
        }),
        tags: ["mutate", "shape"],
        execute: (rt, input) => {
            const pres = rt.getPres();
            if (!pres.slides[input.slideIdx])
                return (0, types_1.err)(`slideIdx ${input.slideIdx} out of range`);
            const id = (0, vocab_1.normalizeIconId)(input.icon);
            if (!(0, vocab_1.isCanvasIconId)(id)) {
                const near = searchIconIds(id, 8);
                return (0, types_1.err)(`Unknown icon "${input.icon}".${near.length ? ` Did you mean: ${near.join(", ")}?` : " Use searchIcons to find an id."}`);
            }
            const colors = (pres.theme?.colors ?? {});
            const color = input.color ?? [colors.accent, colors.accent1, colors.ink, colors.tx1, colors.dk1].find((c) => c && HEX.test(c)) ?? "#0F172A";
            const shapeId = `icon_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
            const shape = (0, icons_1.iconPathShape)(id, input.bbox, {
                id: shapeId,
                name: input.name ?? `icon:${id}`,
                color,
                ...(input.strokeWidth ? { strokeWidth: input.strokeWidth } : {}),
            });
            if (!shape)
                return (0, types_1.err)(`Icon "${id}" has no path data in this lucide build.`);
            const res = rt.apply(new commands_1.AddShapeCmd(input.slideIdx, 0, shape));
            if (!res.ok)
                return res;
            return (0, types_1.ok)({ shapeId, icon: id, color });
        },
    }),
    (0, types_1.defineTool)({
        name: "replaceIcon",
        description: [
            "Replace a library icon in place. The bbox does not move. Only the glyph, color, SVG source, PNG fallback, and ppt-icon description change.",
            "The target must be an image whose description starts with ppt-icon: (the icon library). A path icon from insertIcon is a different shape — delete it and insertIcon again.",
            "Color defaults to the icon's current color. Check contrast against the fill under the icon.",
        ].join(" "),
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            shapeId: zod_1.z.string(),
            icon: zod_1.z.string().min(1).describe("lucide id (kebab-case). Use searchIcons when unsure."),
            color: zod_1.z.string().regex(HEX).optional().describe("#rrggbb. Default: the icon's current color."),
        }),
        tags: ["mutate", "shape"],
        shapeScoped: true,
        execute: async (rt, input) => {
            const pres = rt.getPres();
            const slide = pres.slides[input.slideIdx];
            if (!slide)
                return (0, types_1.err)(`slideIdx ${input.slideIdx} out of range`);
            const shape = (0, summaries_1.findShapeDeep)(slide, input.shapeId);
            if (!shape || shape.kind !== "image") {
                return (0, types_1.err)("replaceIcon only changes a library icon image. Use insertIcon to add a new icon.");
            }
            const current = (0, commands_1.decodeIconDescr)(shape.descr);
            if (!current) {
                return (0, types_1.err)("This image is not a library icon. replaceIcon keeps the box and swaps the glyph; it does not replace photos.");
            }
            const id = (0, vocab_1.normalizeIconId)(input.icon);
            if (!(0, vocab_1.isCanvasIconId)(id)) {
                const near = searchIconIds(id, 8);
                return (0, types_1.err)(`Unknown icon "${input.icon}".${near.length ? ` Did you mean: ${near.join(", ")}?` : " Use searchIcons to find an id."}`);
            }
            const color = input.color ??
                (HEX.test(current.color) ? current.color : "#111827");
            const svgSrc = (0, commands_1.lucideIconSvgDataUrl)(id, { size: 96, color });
            if (!svgSrc)
                return (0, types_1.err)(`Icon "${id}" has no path data in this lucide build.`);
            const src = typeof document !== "undefined"
                ? await (0, commands_1.lucideIconToPngDataUrl)(document, id, { size: 96, color })
                : svgSrc;
            const descr = (0, commands_1.encodeIconDescr)(id, color);
            const res = rt.apply(new commands_1.ReplaceImageSrcCmd(input.slideIdx, input.shapeId, src, { w: 96, h: 96 }, { svgSrc, descr }));
            if (!res.ok)
                return res;
            return (0, types_1.ok)({ shapeId: input.shapeId, icon: id, color });
        },
    }),
];
