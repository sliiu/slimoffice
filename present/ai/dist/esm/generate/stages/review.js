// 阶段：艺术总监评审的 rubric 组装 + 弱页换 layout 重试。
import { bannedLayoutsForFamily, imageryForFamily } from "../schema.js";
import { getEnabledChecklist } from "../../skills/registry.js";
import { WCAG_BODY_TEXT_CONTRAST, WCAG_LARGE_TEXT_CONTRAST } from "../qa/color.js";
import { renderLayout } from "../compile/layouts.js";
import { buildDecorationShapesShared } from "../../decorations.js";
import { getTheme } from "../../themes.js";
import { decorationRoleForKind, hashKind } from "../compile/compile.js";
import { callSlide } from "./slides.js";
/**
 * 组装艺术总监验收 rubric：把"当前启用 skill 的 checklist 小节"与"code 侧硬约束
 * （版式锁定 / 全屏底图 / WCAG 对比度阈值）"合成一段显式检查项文本。
 * 让二次评审对齐同一套 skill 规则打分，而非通用泛化 prompt。
 */
export function buildArtDirectorRubric(guidance, host) {
    const family = guidance.styleFamily || undefined;
    const lines = [];
    // 1) code 侧硬约束（与生成阶段同源，schema.ts / qa/color.ts）。
    const banned = bannedLayoutsForFamily(family);
    if (banned.length > 0) {
        lines.push(`- Layout discipline: this style family must NOT use these layouts: ${banned.join(", ")}.`);
    }
    const imagery = imageryForFamily(family);
    if (imagery && imagery.fullBleedPhoto === false) {
        lines.push("- Imagery: full-bleed background photos are off-brand for this family; expect bounded graphics / negative space instead.");
    }
    if (imagery?.imageVibe) {
        lines.push(`- Imagery vibe should read as: ${imagery.imageVibe}.`);
    }
    lines.push(`- Readability (WCAG AA): body text contrast >= ${WCAG_BODY_TEXT_CONTRAST}:1, large/title text >= ${WCAG_LARGE_TEXT_CONTRAST}:1 against its background.`);
    // 2) skill 侧 checklist 小节（按 styleFamily 走同一套小节路由）。
    const checklist = getEnabledChecklist({
        stage: "slide",
        ...(host ? { host } : {}),
        ...(family ? { styleFamily: family } : {}),
    });
    for (const c of checklist)
        lines.push(c);
    return lines.join("\n");
}
/** 单调 layout → 更有视觉节奏的替代（用于 art-director 单页重试）。 */
const RETRY_LAYOUT_ALTERNATES = {
    bullets: ["cards", "banner", "image-text", "metrics", "process"],
    content: ["banner", "cards", "quote"],
    "two-column": ["comparison", "cards", "metrics"],
    "image-text": ["banner", "cards", "hero"],
    section: ["hero", "banner"],
    table: ["chart", "metrics", "comparison", "cards"],
    agenda: ["process", "cards"],
    quote: ["hero", "stat"],
    stat: ["metrics", "hero"],
    cards: ["process", "metrics", "image-text"],
    timeline: ["process", "agenda"],
    comparison: ["two-column", "cards"],
    metrics: ["chart", "stat", "cards"],
    chart: ["metrics", "table"],
    process: ["timeline", "cards"],
    banner: ["image-text", "cards"],
};
function pickRetryLayout(current, family, used) {
    const banned = new Set(bannedLayoutsForFamily(family));
    const candidates = (RETRY_LAYOUT_ALTERNATES[current ?? "bullets"] ?? ["cards", "banner", "metrics"]).filter((k) => !banned.has(k) && !used.has(k) && k !== current);
    return candidates[0] ?? "cards";
}
/**
 * 根据 art-director findings 选出最多 3 页，换 layoutHint 后重生成并写回 presentation。
 */
export async function retryWeakSlides(args) {
    const layoutCats = new Set(["density", "whitespace", "hierarchy", "consistency"]);
    if (!args.imageryUnavailable)
        layoutCats.add("imagery");
    const scored = new Map();
    for (const f of args.report.findings) {
        if (!layoutCats.has(f.category))
            continue;
        const weight = f.severity === "high" ? 3 : f.severity === "medium" ? 2 : 1;
        scored.set(f.slideIdx, (scored.get(f.slideIdx) ?? 0) + weight);
    }
    // 低分时也兜底挑连续 bullets 页。
    if (scored.size === 0 && args.report.score < 7) {
        for (let i = 0; i < args.specs.length; i++) {
            const k = args.specs[i]?.kind;
            if (k === "bullets" || k === "content")
                scored.set(i, 1);
        }
    }
    const indices = [...scored.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([i]) => i)
        .filter((i) => i > 0 && i < args.specs.length - 1) // 不动封面 / 结尾
        .slice(0, 3);
    if (indices.length === 0)
        return 0;
    const usedAlts = new Set();
    const theme = args.compileOpts.themeOverride ?? getTheme(args.outline.themeId);
    let done = 0;
    for (const idx of indices) {
        const item = args.outline.slides[idx];
        if (!item)
            continue;
        const current = (args.specs[idx]?.kind ?? item.layoutHint ?? "bullets");
        const alt = pickRetryLayout(current, args.guidance.styleFamily, usedAlts);
        usedAlts.add(alt);
        const patchedOutline = {
            ...args.outline,
            slides: args.outline.slides.map((s, i) => (i === idx ? { ...s, layoutHint: alt } : s)),
        };
        try {
            const spec = await callSlide(args.model, {
                outline: patchedOutline,
                index: idx,
                guidance: args.guidance,
                systemExtra: args.systemExtra,
                signal: args.signal,
                host: args.host,
            });
            args.specs[idx] = spec;
            // 原地替换该页 shapes + background（保留 slide id / notes）。
            const slide = args.pres.slides[idx];
            if (slide) {
                const layout = renderLayout(spec, args.pres.size, theme, {
                    ...(args.compileOpts.designSeed !== undefined ? { seed: hashKind(args.compileOpts.designSeed, spec.kind) } : {}),
                });
                const decorationShapes = buildDecorationShapesShared(theme.decoration ?? "none", {
                    palette: theme.palette,
                    size: args.pres.size,
                    locked: false,
                    idPrefix: `retry_${Date.now().toString(36)}_${idx}`,
                    role: decorationRoleForKind(spec.kind),
                });
                slide.background = layout.background ?? theme.backgroundPaint ?? { kind: "solid", color: theme.palette.bg };
                if (slide.layers[0]) {
                    slide.layers[0].shapes = [...decorationShapes, ...layout.shapes];
                }
                const notes = spec.notes;
                if (notes?.trim())
                    slide.notes = notes.trim();
            }
            done += 1;
        }
        catch (e) {
            if (args.debug)
                console.warn(`[ai] art director retry slide #${idx + 1} failed`, e);
        }
    }
    return done;
}
