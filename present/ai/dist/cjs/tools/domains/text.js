"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.textTools = void 0;
const zod_1 = require("zod");
const commands_1 = require("@sliiu/present-editor/commands");
const types_1 = require("../types");
const colorRe = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const colorSchema = zod_1.z.string().regex(colorRe, "must be #rrggbb or #rrggbbaa");
// ---- setRichText 的富文本 schema（per-run / per-paragraph）----
const richRunSchema = zod_1.z.object({
    text: zod_1.z.string().describe("Run text. Use this run boundary to switch styles within the same paragraph."),
    fontFamily: zod_1.z.string().optional(),
    fontSize: zod_1.z.number().min(6).max(400).optional(),
    fontWeight: zod_1.z.number().int().min(100).max(900).optional().describe("400=regular, 600=semibold, 700=bold."),
    italic: zod_1.z.boolean().optional(),
    underline: zod_1.z
        .union([
        zod_1.z.boolean(),
        zod_1.z.enum(["single", "double", "dotted", "dashed", "wavy"]),
    ])
        .optional(),
    strikethrough: zod_1.z.enum(["none", "single", "double"]).optional(),
    color: colorSchema.optional(),
    letterSpacing: zod_1.z.number().min(-20).max(40).optional().describe("Extra tracking in px (NEGATIVE = tighter)."),
    baseline: zod_1.z.number().min(-100).max(100).optional().describe("Vertical baseline shift in percent; positive=superscript, negative=subscript."),
    caps: zod_1.z.enum(["none", "small", "all"]).optional(),
    highlight: colorSchema.optional().describe("Background highlight color behind the run."),
    hyperlinkUrl: zod_1.z.string().url().optional().describe("Make this run a clickable hyperlink (URL)."),
});
const richParagraphSchema = zod_1.z.object({
    align: zod_1.z.enum(["start", "middle", "end", "justify"]).optional(),
    lineHeight: zod_1.z.number().min(0.5).max(4).optional(),
    lineHeightPx: zod_1.z.number().min(4).max(400).optional(),
    spaceBeforePx: zod_1.z.number().min(0).max(400).optional(),
    spaceAfterPx: zod_1.z.number().min(0).max(400).optional(),
    indent: zod_1.z.number().min(-400).max(400).optional(),
    marginLeft: zod_1.z.number().min(0).max(800).optional(),
    marginRight: zod_1.z.number().min(0).max(800).optional(),
    level: zod_1.z.number().int().min(0).max(8).optional().describe("Outline level (0..8). PowerPoint indents bullets by level."),
    bullet: zod_1.z
        .discriminatedUnion("kind", [
        zod_1.z.object({ kind: zod_1.z.literal("none") }),
        zod_1.z.object({
            kind: zod_1.z.literal("char"),
            char: zod_1.z.string().min(1).max(4),
            color: colorSchema.optional(),
            font: zod_1.z.string().optional(),
            sizePct: zod_1.z.number().min(25).max(400).optional(),
        }),
        zod_1.z.object({
            kind: zod_1.z.literal("number"),
            numType: zod_1.z.string(),
            startAt: zod_1.z.number().int().min(1).optional(),
            color: colorSchema.optional(),
            font: zod_1.z.string().optional(),
        }),
    ])
        .optional(),
    runs: zod_1.z.array(richRunSchema).min(1).max(60).describe("Inline runs. Each switches style within the same paragraph."),
});
exports.textTools = [
    // ============================================================================
    // 1) 段落间距 / 行距 / 缩进
    // ============================================================================
    (0, types_1.defineTool)({
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
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            shapeId: zod_1.z.string(),
            lineHeight: zod_1.z.union([zod_1.z.number().min(0.5).max(4), zod_1.z.null()]).optional(),
            lineHeightPx: zod_1.z.union([zod_1.z.number().min(4).max(400), zod_1.z.null()]).optional(),
            spaceBeforePx: zod_1.z.union([zod_1.z.number().min(0).max(400), zod_1.z.null()]).optional(),
            spaceAfterPx: zod_1.z.union([zod_1.z.number().min(0).max(400), zod_1.z.null()]).optional(),
            indent: zod_1.z.union([zod_1.z.number().min(-400).max(400), zod_1.z.null()]).optional(),
            marginLeft: zod_1.z.union([zod_1.z.number().min(0).max(800), zod_1.z.null()]).optional(),
            marginRight: zod_1.z.union([zod_1.z.number().min(0).max(800), zod_1.z.null()]).optional(),
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
                return (0, types_1.err)("No spacing fields provided.");
            return rt.apply(new commands_1.SetParagraphSpacingCmd(slideIdx, shapeId, clean));
        },
    }),
    // ============================================================================
    // 2) 富文本：per-paragraph + per-run 全量替换
    // ============================================================================
    (0, types_1.defineTool)({
        name: "setRichText",
        description: [
            "Replace a text shape's content with RICH paragraphs — per-run formatting allowed (so a single paragraph can mix bold / italic / colored / hyperlinked runs).",
            "Use when `replaceShapeText` is too coarse (it makes single-run paragraphs).",
            "Each paragraph is an object with `runs: RichRun[]`. Each run carries its OWN fontFamily / size / weight / italic / underline / color / highlight / hyperlink etc.",
            "Tip: To highlight a phrase, split the line into 3 runs: [normal, highlighted, normal].",
            "Apply scope: replaces ALL paragraphs of the target text shape (group→first text child).",
        ].join(" "),
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            shapeId: zod_1.z.string(),
            paragraphs: zod_1.z.array(richParagraphSchema).min(1).max(40),
        }),
        tags: ["mutate", "text"],
        shapeScoped: true,
        execute: async (rt, { slideIdx, shapeId, paragraphs }) => {
            return rt.apply(new commands_1.SetRichTextCmd(slideIdx, shapeId, paragraphs));
        },
    }),
    // ============================================================================
    // 3) bodyPr：文本框 insets / wrap / vAlign / vert / autoFit
    // ============================================================================
    (0, types_1.defineTool)({
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
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            shapeId: zod_1.z.string(),
            vAlign: zod_1.z.union([zod_1.z.enum(["top", "middle", "bottom"]), zod_1.z.null()]).optional(),
            wrap: zod_1.z.union([zod_1.z.boolean(), zod_1.z.null()]).optional(),
            insets: zod_1.z
                .union([
                zod_1.z.object({
                    l: zod_1.z.number().min(0).max(200).optional(),
                    t: zod_1.z.number().min(0).max(200).optional(),
                    r: zod_1.z.number().min(0).max(200).optional(),
                    b: zod_1.z.number().min(0).max(200).optional(),
                }),
                zod_1.z.null(),
            ])
                .optional(),
            autoFit: zod_1.z.union([zod_1.z.enum(["none", "normAutofit", "spAutoFit"]), zod_1.z.null()]).optional(),
            vert: zod_1.z
                .union([
                zod_1.z.enum(["horz", "vert", "vert270", "wordArtVert", "wordArtVertRtl", "eaVert", "mongolianVert"]),
                zod_1.z.null(),
            ])
                .optional(),
            numCol: zod_1.z.union([zod_1.z.number().int().min(1).max(6), zod_1.z.null()]).optional(),
            spcCol: zod_1.z.union([zod_1.z.number().min(0).max(120), zod_1.z.null()]).optional(),
            anchorCtr: zod_1.z.union([zod_1.z.boolean(), zod_1.z.null()]).optional(),
            bodyRot: zod_1.z.union([zod_1.z.number().min(-360).max(360), zod_1.z.null()]).optional(),
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
                return (0, types_1.err)("No bodyPr fields provided.");
            return rt.apply(new commands_1.SetTextBodyCmd(slideIdx, shapeId, clean));
        },
    }),
    (0, types_1.defineTool)({
        name: "setParagraphRtl",
        description: "Set right-to-left (RTL) paragraph direction on every paragraph of a text shape. Use for Arabic / Hebrew. Pass rtl=false to restore LTR.",
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            shapeId: zod_1.z.string(),
            rtl: zod_1.z.boolean(),
        }),
        tags: ["mutate", "text"],
        shapeScoped: true,
        execute: (rt, { slideIdx, shapeId, rtl }) => rt.apply(new commands_1.SetParagraphRtlCmd(slideIdx, shapeId, rtl)),
    }),
    (0, types_1.defineTool)({
        name: "setParagraphCjk",
        description: "Toggle East-Asian typography on every paragraph of a text shape (eaLnBrk + hanging punctuation). Enable for Chinese / Japanese / Korean body text.",
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            shapeId: zod_1.z.string(),
            enabled: zod_1.z.boolean(),
        }),
        tags: ["mutate", "text"],
        shapeScoped: true,
        execute: (rt, { slideIdx, shapeId, enabled }) => rt.apply(new commands_1.SetParagraphCjkCmd(slideIdx, shapeId, enabled)),
    }),
    (0, types_1.defineTool)({
        name: "changeTextCase",
        description: "Change the letter case of all runs in a text shape. Modes: upper / lower / title (each word) / sentence (first letter of each sentence).",
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            shapeId: zod_1.z.string(),
            mode: zod_1.z.enum(["upper", "lower", "title", "sentence"]),
        }),
        tags: ["mutate", "text"],
        shapeScoped: true,
        execute: (rt, { slideIdx, shapeId, mode }) => rt.apply(new commands_1.ChangeTextCaseCmd(slideIdx, shapeId, mode)),
    }),
    (0, types_1.defineTool)({
        name: "clearTextFormatting",
        description: "Strip character formatting (bold / italic / underline / color / highlight / caps / hyperlink / …) from every run in a text shape, keeping the words and paragraph structure. Use when the user says 'clear formatting' / '清除格式'.",
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            shapeId: zod_1.z.string(),
        }),
        tags: ["mutate", "text"],
        shapeScoped: true,
        execute: (rt, { slideIdx, shapeId }) => rt.apply(new commands_1.ClearTextFormattingCmd(slideIdx, shapeId)),
    }),
];
