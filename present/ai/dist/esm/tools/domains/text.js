// AI 文本工具集（段落 / run 级深度编辑）。
//
// 与 domains/shapes-basic.ts 已有的 `replaceShapeText` / `setShapeTextStyle` /
// `setShapeAlignment` 互补：那几个是"把整 shape 改成一个统一样式"或"按行替换文本"，
// 适合简单批量。这里覆盖的是 OOXML 真正的细节：
//   - 段落级 line-height / 段前段后 / 缩进（§21.1.2.2.6 a:pPr）
//   - run 级粗体 / 斜体 / 下划线 / 删除线 / 颜色 / 字距 / 上下标 / caps / highlight /
//     超链接（§21.1.2.3.9 a:rPr）—— 关键是允许同一段落里 per-run 不同样式
//     （"局部加粗 + 中间一段斜体 + 末尾上标"这种 PowerPoint 自然形态）
//   - bodyPr 级 insets / wrap / vAlign / vert / autoFit / numCol（§21.1.2.1.1）
//
// 设计原则：
//   - 命名"setParagraphSpacing / setRichText / setTextBody"和已有"setShapeTextStyle"
//     不冲突，分别表达三个独立层次；
//   - 全部走 rt.apply，自动支持 undo / redo；
//   - schema 严格枚举 PowerPoint UI 暴露的常用值，避免 LLM 凭空猜 OOXML 字段名。
import { z } from "zod";
import { ChangeTextCaseCmd, ClearTextFormattingCmd, SetParagraphCjkCmd, SetParagraphRtlCmd, SetParagraphSpacingCmd, SetRichTextCmd, SetTextBodyCmd, } from "@sliiu/present-editor/commands";
import { defineTool, err } from "../types.js";
const colorRe = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const colorSchema = z.string().regex(colorRe, "must be #rrggbb or #rrggbbaa");
// ---- setRichText 的富文本 schema（per-run / per-paragraph）----
const richRunSchema = z.object({
    text: z.string().describe("Run text. Use this run boundary to switch styles within the same paragraph."),
    fontFamily: z.string().optional(),
    fontSize: z.number().min(6).max(400).optional(),
    fontWeight: z.number().int().min(100).max(900).optional().describe("400=regular, 600=semibold, 700=bold."),
    italic: z.boolean().optional(),
    underline: z
        .union([
        z.boolean(),
        z.enum(["single", "double", "dotted", "dashed", "wavy"]),
    ])
        .optional(),
    strikethrough: z.enum(["none", "single", "double"]).optional(),
    color: colorSchema.optional(),
    letterSpacing: z.number().min(-20).max(40).optional().describe("Extra tracking in px (NEGATIVE = tighter)."),
    baseline: z.number().min(-100).max(100).optional().describe("Vertical baseline shift in percent; positive=superscript, negative=subscript."),
    caps: z.enum(["none", "small", "all"]).optional(),
    highlight: colorSchema.optional().describe("Background highlight color behind the run."),
    hyperlinkUrl: z.string().url().optional().describe("Make this run a clickable hyperlink (URL)."),
});
const richParagraphSchema = z.object({
    align: z.enum(["start", "middle", "end", "justify"]).optional(),
    lineHeight: z.number().min(0.5).max(4).optional(),
    lineHeightPx: z.number().min(4).max(400).optional(),
    spaceBeforePx: z.number().min(0).max(400).optional(),
    spaceAfterPx: z.number().min(0).max(400).optional(),
    indent: z.number().min(-400).max(400).optional(),
    marginLeft: z.number().min(0).max(800).optional(),
    marginRight: z.number().min(0).max(800).optional(),
    level: z.number().int().min(0).max(8).optional().describe("Outline level (0..8). PowerPoint indents bullets by level."),
    bullet: z
        .discriminatedUnion("kind", [
        z.object({ kind: z.literal("none") }),
        z.object({
            kind: z.literal("char"),
            char: z.string().min(1).max(4),
            color: colorSchema.optional(),
            font: z.string().optional(),
            sizePct: z.number().min(25).max(400).optional(),
        }),
        z.object({
            kind: z.literal("number"),
            numType: z.string(),
            startAt: z.number().int().min(1).optional(),
            color: colorSchema.optional(),
            font: z.string().optional(),
        }),
    ])
        .optional(),
    runs: z.array(richRunSchema).min(1).max(60).describe("Inline runs. Each switches style within the same paragraph."),
});
export const textTools = [
    // ============================================================================
    // 1) 段落间距 / 行距 / 缩进
    // ============================================================================
    defineTool({
        name: "setParagraphSpacing",
        description: [
            "Patch paragraph spacing on a text shape (§21.1.2.2.6 pPr). Use to fix dense or airless bullets, tighten quotes, or open up walls of text.",
            "Fields (all optional; pass `null` to clear that field):",
            "  - `lineHeight`        multiplier (1.0 = single, 1.5 = comfortable body, 1.15 = tight headings). Maps to OOXML <a:spcPct>.",
            "  - `lineHeightPx`      absolute pixel line-height. EXCLUSIVE with lineHeight; setting one clears the other.",
            "  - `spaceBeforePx`     space before each paragraph (px). Default 0.",
            "  - `spaceAfterPx`      space after each paragraph (px). 8–14 px works well for bullet lists.",
            "  - `indent`            first-line indent in px. NEGATIVE = hanging (bullet indent).",
            "  - `marginLeft`/`marginRight` paragraph margins in px.",
            "Apply scope: ALL paragraphs of the shape (or all visible cells when the shape is a table group).",
            "Tip: for breathing-room bullet lists, try { lineHeight: 1.4, spaceAfterPx: 10 }.",
        ].join(" "),
        inputSchema: z.object({
            slideIdx: z.number().int().min(0),
            shapeId: z.string(),
            lineHeight: z.union([z.number().min(0.5).max(4), z.null()]).optional(),
            lineHeightPx: z.union([z.number().min(4).max(400), z.null()]).optional(),
            spaceBeforePx: z.union([z.number().min(0).max(400), z.null()]).optional(),
            spaceAfterPx: z.union([z.number().min(0).max(400), z.null()]).optional(),
            indent: z.union([z.number().min(-400).max(400), z.null()]).optional(),
            marginLeft: z.union([z.number().min(0).max(800), z.null()]).optional(),
            marginRight: z.union([z.number().min(0).max(800), z.null()]).optional(),
        }),
        tags: ["mutate", "text"],
        shapeScoped: true,
        execute: async (rt, { slideIdx, shapeId, ...patch }) => {
            const clean = {};
            for (const [k, v] of Object.entries(patch)) {
                if (v === undefined)
                    continue;
                clean[k] = v;
            }
            if (Object.keys(clean).length === 0)
                return err("No spacing fields provided.");
            return rt.apply(new SetParagraphSpacingCmd(slideIdx, shapeId, clean));
        },
    }),
    // ============================================================================
    // 2) 富文本：per-paragraph + per-run 全量替换
    // ============================================================================
    defineTool({
        name: "setRichText",
        description: [
            "Replace a text shape's content with RICH paragraphs — per-run formatting allowed (so a single paragraph can mix bold / italic / colored / hyperlinked runs).",
            "Use when `replaceShapeText` is too coarse (it makes single-run paragraphs).",
            "Each paragraph is an object with `runs: RichRun[]`. Each run carries its OWN fontFamily / size / weight / italic / underline / color / highlight / hyperlink etc.",
            "Tip: To highlight a phrase, split the line into 3 runs: [normal, highlighted, normal].",
            "Apply scope: replaces ALL paragraphs of the target text shape (group→first text child).",
        ].join(" "),
        inputSchema: z.object({
            slideIdx: z.number().int().min(0),
            shapeId: z.string(),
            paragraphs: z.array(richParagraphSchema).min(1).max(40),
        }),
        tags: ["mutate", "text"],
        shapeScoped: true,
        execute: async (rt, { slideIdx, shapeId, paragraphs }) => {
            return rt.apply(new SetRichTextCmd(slideIdx, shapeId, paragraphs));
        },
    }),
    // ============================================================================
    // 3) bodyPr：文本框 insets / wrap / vAlign / vert / autoFit
    // ============================================================================
    defineTool({
        name: "setTextBody",
        description: [
            "Patch a text shape's bodyPr properties (§21.1.2.1.1) — the 'text container' settings (not the inner runs).",
            "Fields (all optional, pass `null` to clear):",
            "  - `vAlign`       vertical anchor inside the box: top / middle / bottom.",
            "  - `wrap`         wrap long lines into multiple visual rows. Default true.",
            "  - `insets`       text padding inside the box: { l, t, r, b } in px. Default ~7 px each.",
            "  - `autoFit`      'none' (overflow), 'normAutofit' (shrink font to fit), 'spAutoFit' (resize shape to fit text).",
            "  - `vert`         vertical text direction: horz (default) / vert / vert270 / eaVert / mongolianVert / wordArtVert / wordArtVertRtl (stacked RTL, WPS row order right-to-left).",
            "  - `numCol`       split text into N columns (1..6). For multi-column layout inside a single text box.",
            "  - `spcCol`       gap between columns in px (only when numCol > 1).",
            "  - `anchorCtr`    center anchor inside available space.",
            "  - `bodyRot`      rotate the text body in degrees (60000 OOXML units handled internally).",
        ].join(" "),
        inputSchema: z.object({
            slideIdx: z.number().int().min(0),
            shapeId: z.string(),
            vAlign: z.union([z.enum(["top", "middle", "bottom"]), z.null()]).optional(),
            wrap: z.union([z.boolean(), z.null()]).optional(),
            insets: z
                .union([
                z.object({
                    l: z.number().min(0).max(200).optional(),
                    t: z.number().min(0).max(200).optional(),
                    r: z.number().min(0).max(200).optional(),
                    b: z.number().min(0).max(200).optional(),
                }),
                z.null(),
            ])
                .optional(),
            autoFit: z.union([z.enum(["none", "normAutofit", "spAutoFit"]), z.null()]).optional(),
            vert: z
                .union([
                z.enum(["horz", "vert", "vert270", "wordArtVert", "wordArtVertRtl", "eaVert", "mongolianVert"]),
                z.null(),
            ])
                .optional(),
            numCol: z.union([z.number().int().min(1).max(6), z.null()]).optional(),
            spcCol: z.union([z.number().min(0).max(120), z.null()]).optional(),
            anchorCtr: z.union([z.boolean(), z.null()]).optional(),
            bodyRot: z.union([z.number().min(-360).max(360), z.null()]).optional(),
        }),
        tags: ["mutate", "text"],
        shapeScoped: true,
        execute: async (rt, { slideIdx, shapeId, ...patch }) => {
            const clean = {};
            for (const [k, v] of Object.entries(patch)) {
                if (v === undefined)
                    continue;
                clean[k] = v;
            }
            if (Object.keys(clean).length === 0)
                return err("No bodyPr fields provided.");
            return rt.apply(new SetTextBodyCmd(slideIdx, shapeId, clean));
        },
    }),
    defineTool({
        name: "setParagraphRtl",
        description: "Set right-to-left (RTL) paragraph direction on every paragraph of a text shape. Use for Arabic / Hebrew. Pass rtl=false to restore LTR.",
        inputSchema: z.object({
            slideIdx: z.number().int().min(0),
            shapeId: z.string(),
            rtl: z.boolean(),
        }),
        tags: ["mutate", "text"],
        shapeScoped: true,
        execute: (rt, { slideIdx, shapeId, rtl }) => rt.apply(new SetParagraphRtlCmd(slideIdx, shapeId, rtl)),
    }),
    defineTool({
        name: "setParagraphCjk",
        description: "Toggle East-Asian typography on every paragraph of a text shape (eaLnBrk + hanging punctuation). Enable for Chinese / Japanese / Korean body text.",
        inputSchema: z.object({
            slideIdx: z.number().int().min(0),
            shapeId: z.string(),
            enabled: z.boolean(),
        }),
        tags: ["mutate", "text"],
        shapeScoped: true,
        execute: (rt, { slideIdx, shapeId, enabled }) => rt.apply(new SetParagraphCjkCmd(slideIdx, shapeId, enabled)),
    }),
    defineTool({
        name: "changeTextCase",
        description: "Change the letter case of all runs in a text shape. Modes: upper / lower / title (each word) / sentence (first letter of each sentence).",
        inputSchema: z.object({
            slideIdx: z.number().int().min(0),
            shapeId: z.string(),
            mode: z.enum(["upper", "lower", "title", "sentence"]),
        }),
        tags: ["mutate", "text"],
        shapeScoped: true,
        execute: (rt, { slideIdx, shapeId, mode }) => rt.apply(new ChangeTextCaseCmd(slideIdx, shapeId, mode)),
    }),
    defineTool({
        name: "clearTextFormatting",
        description: "Strip character formatting (bold / italic / underline / color / highlight / caps / hyperlink / …) from every run in a text shape, keeping the words and paragraph structure. Use when the user says 'clear formatting' / '清除格式'.",
        inputSchema: z.object({
            slideIdx: z.number().int().min(0),
            shapeId: z.string(),
        }),
        tags: ["mutate", "text"],
        shapeScoped: true,
        execute: (rt, { slideIdx, shapeId }) => rt.apply(new ClearTextFormattingCmd(slideIdx, shapeId)),
    }),
];
