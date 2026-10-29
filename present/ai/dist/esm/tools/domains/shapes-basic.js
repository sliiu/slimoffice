// Shape 基础工具：改文字 / 填色 / 文字样式 / 对齐 / 移动 / z-order / 删除。
// 全部 shapeScoped —— 定位既有 shape，受 [TURN SCOPE] 选区守卫约束。
import { z } from "zod";
import { DeleteShapeCmd, DuplicateShapeCmd, ReorderShapeCmd, SetFillCmd, SetShapeBboxCmd, SetTextAlignCmd, SetTextStyleCmd, } from "@sliiu/present-editor/commands";
import { ReplaceTextCmd } from "../commands/slide-commands.js";
import { findShapeDeep } from "../summaries.js";
import { defineTool, err } from "../types.js";
const charRangeSchema = z.object({
    paragraph: z.number().int().min(0).describe("0-based paragraph index inside the text shape."),
    start: z.number().int().min(0).describe("UTF-16 start, inclusive, within that paragraph."),
    end: z.number().int().min(0).describe("UTF-16 end, exclusive, within that paragraph."),
});
function paragraphsForCharStyle(shape) {
    if (shape.kind === "group" && shape.tableMeta)
        return "table";
    if (shape.kind === "text")
        return shape.paragraphs;
    if (shape.kind === "group") {
        const text = shape.children.find((child) => child.kind === "text");
        if (text?.kind === "text")
            return text.paragraphs;
    }
    return null;
}
function rangesForPhrase(paragraphs, phrase) {
    const out = [];
    for (let paragraph = 0; paragraph < paragraphs.length; paragraph++) {
        const text = paragraphs[paragraph].runs.map((run) => run.text).join("");
        let from = 0;
        while (from <= text.length - phrase.length) {
            const at = text.indexOf(phrase, from);
            if (at < 0)
                break;
            out.push({ paragraph, start: at, end: at + phrase.length });
            from = at + phrase.length;
        }
    }
    return out;
}
export const shapeBasicTools = [
    defineTool({
        name: "replaceShapeText",
        description: "Replace all paragraphs of a text shape with new lines. Each item in `paragraphs` becomes one paragraph (style preserved from the first run).",
        inputSchema: z.object({
            slideIdx: z.number().int().min(0),
            shapeId: z.string(),
            paragraphs: z.array(z.string()).min(1).max(40),
        }),
        tags: ["mutate", "shape", "text"],
        shapeScoped: true,
        execute: (rt, { slideIdx, shapeId, paragraphs }) => rt.apply(new ReplaceTextCmd(slideIdx, shapeId, paragraphs)),
    }),
    defineTool({
        name: "setShapeFillColor",
        description: "Set a shape's fill to a solid color (#RRGGBB or #RRGGBBAA). Ripple effect: if text sits on top of this shape (or the shape is a backdrop/chip/callout), re-check both text-vs-shape and shape-vs-slide-background contrast afterwards.",
        inputSchema: z.object({
            slideIdx: z.number().int().min(0),
            shapeId: z.string(),
            color: z.string().regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/),
        }),
        tags: ["mutate", "shape"],
        shapeScoped: true,
        execute: (rt, { slideIdx, shapeId, color }) => {
            const paint = { kind: "solid", color };
            return rt.apply(new SetFillCmd(slideIdx, shapeId, paint));
        },
    }),
    defineTool({
        name: "setShapeTextStyle",
        description: [
            "Update text style of a shape: any subset of fontFamily / fontSize / fontWeight (100..900) / italic / underline (boolean) / color (#RRGGBB).",
            "Omit `phrase` and `ranges` to style every run. To restyle only some words, pass `phrase` (exact substring; every match in the shape) or `ranges` (UTF-16 offsets inside one paragraph: { paragraph, start, end }). The rest of the text stays as it was.",
            "Ripple effect: growing font size may overflow the bbox — enable autoFit via setTextBody or enlarge via moveShape if needed.",
        ].join(" "),
        inputSchema: z.object({
            slideIdx: z.number().int().min(0),
            shapeId: z.string(),
            fontFamily: z.string().optional(),
            fontSize: z.number().min(6).max(200).optional(),
            fontWeight: z.number().int().min(100).max(900).optional(),
            italic: z.boolean().optional(),
            underline: z.boolean().optional(),
            color: z
                .string()
                .regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/)
                .optional(),
            phrase: z.string().min(1).max(200).optional().describe("Exact substring to restyle. Every match in this shape."),
            ranges: z.array(charRangeSchema).min(1).max(40).optional(),
        }),
        tags: ["mutate", "shape", "text"],
        shapeScoped: true,
        execute: (rt, { slideIdx, shapeId, phrase, ranges, ...patch }) => {
            const clean = {};
            for (const [k, v] of Object.entries(patch))
                if (v !== undefined)
                    clean[k] = v;
            if (Object.keys(clean).length === 0)
                return err("No style properties provided.");
            if (phrase && ranges)
                return err("Pass phrase or ranges, not both.");
            let charRanges;
            if (phrase || ranges) {
                const slide = rt.getPres().slides[slideIdx];
                const shape = slide ? findShapeDeep(slide, shapeId) : undefined;
                if (!shape)
                    return err(`Shape ${shapeId} not found on slide ${slideIdx}.`);
                const paragraphs = paragraphsForCharStyle(shape);
                if (paragraphs === "table")
                    return err("Character ranges apply to one text shape. Target a single cell, not the whole table.");
                if (!paragraphs)
                    return err("Character ranges apply to a text shape.");
                charRanges = ranges ?? rangesForPhrase(paragraphs, phrase);
                if (charRanges.length === 0)
                    return err(`Phrase not found: ${phrase}`);
            }
            return rt.apply(new SetTextStyleCmd(slideIdx, shapeId, clean, charRanges));
        },
    }),
    defineTool({
        name: "setShapeAlignment",
        description: "Set the horizontal text alignment of a text shape: start | middle | end | justify.",
        inputSchema: z.object({
            slideIdx: z.number().int().min(0),
            shapeId: z.string(),
            align: z.enum(["start", "middle", "end", "justify"]),
        }),
        tags: ["mutate", "shape", "text"],
        shapeScoped: true,
        execute: (rt, { slideIdx, shapeId, align }) => rt.apply(new SetTextAlignCmd(slideIdx, shapeId, align)),
    }),
    defineTool({
        name: "moveShape",
        description: "Set absolute bbox of a shape (x, y, w, h in slide px). Children are rescaled.",
        inputSchema: z.object({
            slideIdx: z.number().int().min(0),
            shapeId: z.string(),
            x: z.number(),
            y: z.number(),
            w: z.number().min(1),
            h: z.number().min(1),
        }),
        tags: ["mutate", "shape"],
        shapeScoped: true,
        execute: (rt, { slideIdx, shapeId, x, y, w, h }) => rt.apply(new SetShapeBboxCmd(slideIdx, shapeId, { x, y, w, h })),
    }),
    defineTool({
        name: "deleteShape",
        description: "Delete a shape from a slide.",
        inputSchema: z.object({
            slideIdx: z.number().int().min(0),
            shapeId: z.string(),
        }),
        tags: ["mutate", "shape"],
        shapeScoped: true,
        execute: (rt, { slideIdx, shapeId }) => rt.apply(new DeleteShapeCmd(slideIdx, shapeId)),
    }),
    // 改 shape 的 z-order（在所在 layer 内部移动）。
    //
    // 用法：当 AI 加了一张大图却发现它压住了文字（例如不该用 background 时误用 insertImage），
    // 立刻调 reorderShape({direction:"back"}) 把它推到最底，让文字重新可见。
    defineTool({
        name: "reorderShape",
        description: [
            "Move a shape in its layer's z-order. CRITICAL after inserting any image / large rectangle that visually overlaps text:",
            'if it should serve as a backdrop, call this with direction="back" so the existing text stays on top.',
            'Prefer `setSlideBackground` with kind="image" for true full-slide backgrounds — reorder is for in-layer fixes.',
        ].join(" "),
        inputSchema: z.object({
            slideIdx: z.number().int().min(0),
            shapeId: z.string(),
            direction: z
                .enum(["back", "front", "backward", "forward"])
                .describe("back=send to bottom, front=bring to top, backward=move down one, forward=move up one"),
        }),
        tags: ["mutate", "shape"],
        shapeScoped: true,
        execute: (rt, { slideIdx, shapeId, direction }) => rt.apply(new ReorderShapeCmd(slideIdx, shapeId, direction)),
    }),
    defineTool({
        name: "duplicateShape",
        description: "Clone a shape on the same slide (new id, offset 16px down-right by default). Use when the user asks to duplicate / copy / 复制 a shape. The clone is inserted just above the original in z-order. Does not copy animations.",
        inputSchema: z.object({
            slideIdx: z.number().int().min(0),
            shapeId: z.string(),
            dx: z.number().optional().describe("X offset in px. Default 16."),
            dy: z.number().optional().describe("Y offset in px. Default 16."),
        }),
        tags: ["mutate", "shape"],
        shapeScoped: true,
        execute: (rt, { slideIdx, shapeId, dx, dy }) => {
            const slide = rt.getPres().slides[slideIdx];
            if (!slide)
                return err(`slideIdx ${slideIdx} out of range`);
            if (!findShapeDeep(slide, shapeId))
                return err(`shape ${shapeId} not found on slide ${slideIdx}`);
            const newId = `sp_dup_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
            const res = rt.apply(new DuplicateShapeCmd(slideIdx, shapeId, dx ?? 16, dy ?? 16, newId));
            if (!res.ok)
                return res;
            return { ok: true, shapeId: newId };
        },
    }),
];
