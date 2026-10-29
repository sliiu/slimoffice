"use strict";
// 设计规格预决策 pass（roadmap L3）。
//
// 动机：现状每次单页生成都把整篇 skill 塞给模型，各页各自"再理解一遍" → 页间风格漂移
// （封面暖调、内容页却冷灰；这页全屏图、那页纯色底）。本模块在正式生成前先跑一次轻量 LLM，
// 读 brief + 启用 skill 的设计决策，一次性产出一份**冻结的结构化 DesignSpec**：选定风格族、
// 主题、版式菜单、配图计划、do/don't。随后用 code 侧硬约束 clamp（禁用版式 / 全屏底图开关 /
// 图片比例），再作为"设计简报"注入下游 slide prompt + enrich → 一次决策，全篇一致。
//
// 约束留在代码（schema.ts 的 STYLE_FAMILY_* 表），skill 只提供散文引导 —— 与 L1/L4 同源。
// 自定义 styleFamily 由 user skill frontmatter `styleFamilies` 注册，动态扩 design-spec enum。
Object.defineProperty(exports, "__esModule", { value: true });
exports.DesignSpecSchema = void 0;
exports.buildDesignSpecSchema = buildDesignSpecSchema;
exports.designSpecSystemPrompt = designSpecSystemPrompt;
exports.designSpecUserPrompt = designSpecUserPrompt;
exports.clampDesignSpec = clampDesignSpec;
exports.renderDesignBrief = renderDesignBrief;
const zod_1 = require("zod");
const schema_1 = require("./schema");
const registry_1 = require("../skills/registry");
const prompts_1 = require("./prompts");
// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
/** 按当前已知 styleFamily（builtin + enabled user skill 自定义）构建 zod schema。 */
function buildDesignSpecSchema(allowedFamilyIds) {
    const ids = allowedFamilyIds.length > 0
        ? allowedFamilyIds
        : schema_1.STYLE_FAMILY_IDS;
    return zod_1.z.object({
        styleFamily: zod_1.z.enum(ids),
        themeId: zod_1.z.enum(schema_1.OUTLINE_THEME_IDS),
        paletteLock: zod_1.z.boolean().optional(),
        layoutMenu: zod_1.z
            .array(zod_1.z.enum(schema_1.OUTLINE_LAYOUT_HINTS))
            .min(1)
            .max(12)
            .describe("Recommended layout kinds for this deck — the deck should mostly stick to these."),
        imagePlan: zod_1.z.object({
            vibe: zod_1.z.string().optional().describe("Imagery mood keywords (English)."),
            fullBleed: zod_1.z.boolean().optional().describe("Whether full-bleed background photos fit this deck."),
            ratio: zod_1.z.string().optional().describe("Preferred image aspect ratio, e.g. 16:9 / 3:2 / 1:1."),
        }),
        doDont: zod_1.z.array(zod_1.z.string()).max(12).optional().describe("Short do/don't guidance lines."),
    });
}
/** 默认 schema（仅 builtin 族）—— 测试 / 无 host 时用。 */
exports.DesignSpecSchema = buildDesignSpecSchema(schema_1.STYLE_FAMILY_IDS);
// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------
function designSpecSystemPrompt(skillFragments, host) {
    const familyList = (0, registry_1.styleFamilyListLines)(host).join("\n");
    return [
        "You are a design director. Before a presentation is generated, you lock in ONE coherent design decision the whole presentation will follow.",
        "Choose a single visual style family and a consistent plan so every slide feels like one presentation (no per-slide drift).",
        "",
        `Style families (pick exactly one):\n${familyList}`,
        'Theme: default to "ai" — a dedicated pass designs a fully custom palette/fonts/layout after this step. Only output a specific built-in preset id if the user\'s brief explicitly names one.',
        `Valid theme ids (for the explicit-request case only): ${schema_1.OUTLINE_THEME_IDS.join(" | ")}.`,
        `Layout kinds: ${schema_1.OUTLINE_LAYOUT_HINTS.join(" | ")}.`,
        "",
        ...(skillFragments.length ? [...skillFragments, ""] : []),
        "Return ONLY this JSON (no prose, no fences):",
        "{",
        '  "styleFamily": "<one family id>",',
        '  "themeId": "<one theme id>",',
        '  "paletteLock": true,',
        '  "layoutMenu": ["<layout>", "..."],',
        '  "imagePlan": { "vibe": "<english keywords>", "fullBleed": true|false, "ratio"?: "16:9" },',
        '  "doDont": ["Do ...", "Don\'t ..."]',
        "}",
    ].join("\n");
}
function designSpecUserPrompt(g) {
    return [
        "Design a coherent visual plan for this presentation:",
        "",
        (0, prompts_1.guidanceHardConstraints)(g),
        "",
        `Topic: ${g.topic}`,
        g.styleFamily ? `Requested style family (honor it): ${g.styleFamily}` : "",
        g.themeId ? `Requested theme: ${g.themeId}` : "",
    ]
        .filter((l) => l !== "")
        .join("\n");
}
// ---------------------------------------------------------------------------
// Clamp：用 code 侧硬约束把 LLM 的选择拉回族内（禁用版式 / 全屏底图 / 图片比例）。
// ---------------------------------------------------------------------------
/**
 * 用 code 约束校正一份 DesignSpec：
 *   - 若 guidance 显式指定了 styleFamily，以它为准（用户意图优先于模型选择）；
 *   - 从 layoutMenu 移除该族禁用的版式（bannedLayoutsForFamily）；
 *   - imagePlan.fullBleed / ratio / vibe 与 STYLE_FAMILY_IMAGERY 对齐（族策略优先；自定义族无硬策略）。
 */
function clampDesignSpec(spec, guidance) {
    const effFamily = guidance.styleFamily ? guidance.styleFamily : spec.styleFamily;
    const banned = new Set((0, schema_1.bannedLayoutsForFamily)(effFamily));
    let layoutMenu = spec.layoutMenu.filter((l) => !banned.has(l));
    if (layoutMenu.length === 0)
        layoutMenu = spec.layoutMenu;
    const imagery = (0, schema_1.imageryForFamily)(effFamily);
    const imagePlan = {
        vibe: spec.imagePlan.vibe?.trim() || imagery?.imageVibe || "",
        fullBleed: imagery ? imagery.fullBleedPhoto : spec.imagePlan.fullBleed ?? true,
        ...(spec.imagePlan.ratio
            ? { ratio: spec.imagePlan.ratio }
            : imagery?.preferredImageRatio
                ? { ratio: imagery.preferredImageRatio }
                : {}),
    };
    const userTheme = guidance.themeId;
    let themeId = spec.themeId;
    if (userTheme === "ai")
        themeId = "ai";
    else if (userTheme && schema_1.OUTLINE_THEME_IDS.includes(userTheme)) {
        themeId = userTheme;
    }
    return {
        ...spec,
        styleFamily: effFamily,
        themeId,
        paletteLock: spec.paletteLock ?? true,
        layoutMenu,
        imagePlan,
        doDont: spec.doDont ?? [],
    };
}
// ---------------------------------------------------------------------------
// Render：把冻结的 DesignSpec 渲染成注入下游 prompt 的紧凑"设计简报"。
// ---------------------------------------------------------------------------
function renderDesignBrief(spec, host) {
    const hint = (0, registry_1.styleFamilyHint)(spec.styleFamily, host);
    const lines = [
        "DESIGN SPEC (locked for the whole presentation — follow exactly, keep every slide consistent):",
        `- Style family: ${spec.styleFamily} — ${hint}`,
        `- Theme: ${spec.themeId}${spec.paletteLock ? " (palette locked — do not drift colors)" : ""}`,
        `- Preferred layouts: ${spec.layoutMenu.join(", ")}`,
        `- Imagery: ${spec.imagePlan.vibe || "(theme default)"}; full-bleed backgrounds ${spec.imagePlan.fullBleed ? "allowed" : "avoided (use bounded graphics / negative space)"}${spec.imagePlan.ratio ? `; aspect ~${spec.imagePlan.ratio}` : ""}`,
    ];
    if (spec.doDont && spec.doDont.length) {
        lines.push("- Do / Don't:");
        for (const d of spec.doDont)
            lines.push(`    - ${d}`);
    }
    return lines.join("\n");
}
