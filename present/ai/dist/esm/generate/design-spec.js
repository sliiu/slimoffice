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
import { z } from "zod";
import { OUTLINE_LAYOUT_HINTS, OUTLINE_THEME_IDS, STYLE_FAMILY_IDS, bannedLayoutsForFamily, imageryForFamily, } from "./schema.js";
import { styleFamilyHint, styleFamilyListLines } from "../skills/registry.js";
import { guidanceHardConstraints } from "./prompts.js";
// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
/** 按当前已知 styleFamily（builtin + enabled user skill 自定义）构建 zod schema。 */
export function buildDesignSpecSchema(allowedFamilyIds) {
    const ids = allowedFamilyIds.length > 0
        ? allowedFamilyIds
        : STYLE_FAMILY_IDS;
    return z.object({
        styleFamily: z.enum(ids),
        themeId: z.enum(OUTLINE_THEME_IDS),
        paletteLock: z.boolean().optional(),
        layoutMenu: z
            .array(z.enum(OUTLINE_LAYOUT_HINTS))
            .min(1)
            .max(12)
            .describe("Recommended layout kinds for this deck — the deck should mostly stick to these."),
        imagePlan: z.object({
            vibe: z.string().optional().describe("Imagery mood keywords (English)."),
            fullBleed: z.boolean().optional().describe("Whether full-bleed background photos fit this deck."),
            ratio: z.string().optional().describe("Preferred image aspect ratio, e.g. 16:9 / 3:2 / 1:1."),
        }),
        doDont: z.array(z.string()).max(12).optional().describe("Short do/don't guidance lines."),
    });
}
/** 默认 schema（仅 builtin 族）—— 测试 / 无 host 时用。 */
export const DesignSpecSchema = buildDesignSpecSchema(STYLE_FAMILY_IDS);
// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------
export function designSpecSystemPrompt(skillFragments, host) {
    const familyList = styleFamilyListLines(host).join("\n");
    return [
        "You are a design director. Before a presentation is generated, you lock in ONE coherent design decision the whole presentation will follow.",
        "Choose a single visual style family and a consistent plan so every slide feels like one presentation (no per-slide drift).",
        "",
        `Style families (pick exactly one):\n${familyList}`,
        'Theme: default to "ai" — a dedicated pass designs a fully custom palette/fonts/layout after this step. Only output a specific built-in preset id if the user\'s brief explicitly names one.',
        `Valid theme ids (for the explicit-request case only): ${OUTLINE_THEME_IDS.join(" | ")}.`,
        `Layout kinds: ${OUTLINE_LAYOUT_HINTS.join(" | ")}.`,
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
export function designSpecUserPrompt(g) {
    return [
        "Design a coherent visual plan for this presentation:",
        "",
        guidanceHardConstraints(g),
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
export function clampDesignSpec(spec, guidance) {
    const effFamily = guidance.styleFamily ? guidance.styleFamily : spec.styleFamily;
    const banned = new Set(bannedLayoutsForFamily(effFamily));
    let layoutMenu = spec.layoutMenu.filter((l) => !banned.has(l));
    if (layoutMenu.length === 0)
        layoutMenu = spec.layoutMenu;
    const imagery = imageryForFamily(effFamily);
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
    else if (userTheme && OUTLINE_THEME_IDS.includes(userTheme)) {
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
export function renderDesignBrief(spec, host) {
    const hint = styleFamilyHint(spec.styleFamily, host);
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
