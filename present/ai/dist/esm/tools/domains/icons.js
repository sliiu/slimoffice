// AI 图标工具 —— 在页面上放置矢量 lucide 图标（stroke-only PathShape，可编辑、可换色、可导出）。
//
// 生成链路的 canvas 作者已经能写 kind:"icon"；对话侧此前只能用 shape / image 凑，这里补齐。
import { z } from "zod";
import { icons } from "lucide";
import { AddShapeCmd, ReplaceImageSrcCmd, decodeIconDescr, encodeIconDescr, lucideIconSvgDataUrl, lucideIconToPngDataUrl, } from "@sliiu/present-editor/commands";
import { defineTool, ok, err } from "../types.js";
import { findShapeDeep } from "../summaries.js";
import { iconPathShape } from "../../deckgen/icons.js";
import { CANVAS_ICON_IDS, isCanvasIconId, normalizeIconId } from "../../deckgen/vocab.js";
const HEX = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
function pascalToKebab(s) {
    return s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}
/** Every lucide id in the shipped build, kebab-case, curated ids first. */
export function allIconIds() {
    const curated = new Set(CANVAS_ICON_IDS);
    const rest = Object.keys(icons).map(pascalToKebab).filter((id) => !curated.has(id)).sort();
    return [...CANVAS_ICON_IDS, ...rest];
}
export function searchIconIds(query, limit = 24) {
    const terms = query.toLowerCase().split(/[\s,/_-]+/).filter(Boolean);
    if (!terms.length)
        return CANVAS_ICON_IDS.slice(0, limit);
    const all = allIconIds();
    const score = (id) => terms.reduce((acc, t) => acc + (id === t ? 3 : id.startsWith(t) ? 2 : id.includes(t) ? 1 : 0), 0);
    return all
        .map((id) => ({ id, s: score(id) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s || a.id.localeCompare(b.id))
        .slice(0, limit)
        .map((x) => x.id);
}
export const iconTools = [
    defineTool({
        name: "searchIcons",
        description: "Find lucide icon ids by keyword (English: 'shield', 'chart', 'rocket', 'team'). Returns ids to pass to insertIcon. Curated deck icons rank first.",
        inputSchema: z.object({ query: z.string().max(80), limit: z.number().int().min(1).max(60).optional() }),
        tags: ["read"],
        execute: (_rt, { query, limit }) => ok({ icons: searchIconIds(query, limit ?? 24) }),
    }),
    defineTool({
        name: "insertIcon",
        description: [
            "Insert a vector lucide icon as an editable stroke path on a slide (kind=path, scalable, recolorable, exports to PPTX as a freeform).",
            "Use beside a label / in a card / as a bullet marker — never as decoration on its own. Size 20–96 px is the usual range; the icon is fitted uniformly in bbox.",
            "To swap a library icon that is already on the slide (image with a ppt-icon description) without moving its box, use replaceIcon instead.",
            "Color defaults to the theme accent; check contrast against whatever fill sits under it (a dark icon on a dark card is invisible).",
        ].join(" "),
        inputSchema: z.object({
            slideIdx: z.number().int().min(0),
            icon: z.string().min(1).describe("lucide id (kebab-case), e.g. 'shield-check', 'bar-chart-3', 'rocket'. Use searchIcons when unsure."),
            bbox: z.object({ x: z.number(), y: z.number(), w: z.number().positive(), h: z.number().positive() }),
            color: z.string().regex(HEX).optional().describe("#rrggbb; default theme accent."),
            strokeWidth: z.number().positive().max(8).optional(),
            name: z.string().max(60).optional(),
        }),
        tags: ["mutate", "shape"],
        execute: (rt, input) => {
            const pres = rt.getPres();
            if (!pres.slides[input.slideIdx])
                return err(`slideIdx ${input.slideIdx} out of range`);
            const id = normalizeIconId(input.icon);
            if (!isCanvasIconId(id)) {
                const near = searchIconIds(id, 8);
                return err(`Unknown icon "${input.icon}".${near.length ? ` Did you mean: ${near.join(", ")}?` : " Use searchIcons to find an id."}`);
            }
            const colors = (pres.theme?.colors ?? {});
            const color = input.color ?? [colors.accent, colors.accent1, colors.ink, colors.tx1, colors.dk1].find((c) => c && HEX.test(c)) ?? "#0F172A";
            const shapeId = `icon_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
            const shape = iconPathShape(id, input.bbox, {
                id: shapeId,
                name: input.name ?? `icon:${id}`,
                color,
                ...(input.strokeWidth ? { strokeWidth: input.strokeWidth } : {}),
            });
            if (!shape)
                return err(`Icon "${id}" has no path data in this lucide build.`);
            const res = rt.apply(new AddShapeCmd(input.slideIdx, 0, shape));
            if (!res.ok)
                return res;
            return ok({ shapeId, icon: id, color });
        },
    }),
    defineTool({
        name: "replaceIcon",
        description: [
            "Replace a library icon in place. The bbox does not move. Only the glyph, color, SVG source, PNG fallback, and ppt-icon description change.",
            "The target must be an image whose description starts with ppt-icon: (the icon library). A path icon from insertIcon is a different shape — delete it and insertIcon again.",
            "Color defaults to the icon's current color. Check contrast against the fill under the icon.",
        ].join(" "),
        inputSchema: z.object({
            slideIdx: z.number().int().min(0),
            shapeId: z.string(),
            icon: z.string().min(1).describe("lucide id (kebab-case). Use searchIcons when unsure."),
            color: z.string().regex(HEX).optional().describe("#rrggbb. Default: the icon's current color."),
        }),
        tags: ["mutate", "shape"],
        shapeScoped: true,
        execute: async (rt, input) => {
            const pres = rt.getPres();
            const slide = pres.slides[input.slideIdx];
            if (!slide)
                return err(`slideIdx ${input.slideIdx} out of range`);
            const shape = findShapeDeep(slide, input.shapeId);
            if (!shape || shape.kind !== "image") {
                return err("replaceIcon only changes a library icon image. Use insertIcon to add a new icon.");
            }
            const current = decodeIconDescr(shape.descr);
            if (!current) {
                return err("This image is not a library icon. replaceIcon keeps the box and swaps the glyph; it does not replace photos.");
            }
            const id = normalizeIconId(input.icon);
            if (!isCanvasIconId(id)) {
                const near = searchIconIds(id, 8);
                return err(`Unknown icon "${input.icon}".${near.length ? ` Did you mean: ${near.join(", ")}?` : " Use searchIcons to find an id."}`);
            }
            const color = input.color ??
                (HEX.test(current.color) ? current.color : "#111827");
            const svgSrc = lucideIconSvgDataUrl(id, { size: 96, color });
            if (!svgSrc)
                return err(`Icon "${id}" has no path data in this lucide build.`);
            const src = typeof document !== "undefined"
                ? await lucideIconToPngDataUrl(document, id, { size: 96, color })
                : svgSrc;
            const descr = encodeIconDescr(id, color);
            const res = rt.apply(new ReplaceImageSrcCmd(input.slideIdx, input.shapeId, src, { w: 96, h: 96 }, { svgSrc, descr }));
            if (!res.ok)
                return res;
            return ok({ shapeId: input.shapeId, icon: id, color });
        },
    }),
];
