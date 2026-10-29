"use strict";
// Skill body 的小节级切分 + 路由注解解析（roadmap L2 / L4）。
//
// 动机：
//   现状 getEnabledSkillFragments 把整篇 skill body 原样注入。做 Swiss 风时，
//   ppt_style_systems 里 editorial / memphis / risograph 的规则也一起塞进 prompt →
//   稀释注意力、浪费 token。本模块把 body 按 `##` / `###` 标题切成小节，每小节可带一行
//   HTML 注释注解，声明它"只对某些 styleFamily / layoutKind 生效"。注入时按上下文过滤，
//   只留命中的 + 无注解（全局）小节。
//
// 注解语法（写在小节内任意 HTML 注释里，通常紧跟标题）：
//   <!-- applies: swiss, data-journalism; layout: hero, section; stage: generate -->
//   <!-- checklist -->
// 规则：
//   - 无 applies/layout/stage 注解的小节 = 全局，永远注入（向后兼容：老 skill 不写注解即原样全注入）。
//   - applies 命中：ctx.styleFamily 在列表里才保留；ctx.styleFamily 为空（auto）时无法路由 → 保留。
//   - layout 命中：ctx.layoutKinds 与列表有交集才保留；无 layout 上下文（outline/theme 阶段）→ 保留。
//   - stage 命中：ctx.stage 在列表里才保留；无 stage 上下文 → 保留。
//   - checklist 小节：既参与常规注入（也是有用引导），又能被 extractChecklistSections 抽出来做验收 rubric。
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseSkillSections = parseSkillSections;
exports.filterSkillBody = filterSkillBody;
exports.extractChecklistSections = extractChecklistSections;
// 切分级别：`##` 与 `###`（family 块在 ppt_style_systems 里是 `###`）。level 4+ 不切。
const HEADING_RE = /^(#{2,3})\s+(.+?)\s*$/;
/** 去掉 fenced code block，避免示例里的 `<!-- applies: ... -->` 被误当路由注解。 */
function stripFencedCodeBlocks(text) {
    return text.replace(/```[\s\S]*?```/g, "");
}
function parseList(inner, key) {
    const m = inner.match(new RegExp(`${key}\\s*:\\s*([^;]+)`, "i"));
    if (!m?.[1])
        return null;
    const list = m[1]
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
    return list.length ? list : null;
}
function parseAnnotation(sectionText, heading) {
    let applies = null;
    let layout = null;
    let stages = null;
    let isChecklist = false;
    const comments = stripFencedCodeBlocks(sectionText).match(/<!--([\s\S]*?)-->/g) ?? [];
    for (const c of comments) {
        const inner = c.replace(/<!--|-->/g, "").trim();
        if (/\bchecklist\b/i.test(inner))
            isChecklist = true;
        applies = parseList(inner, "applies") ?? applies;
        layout = parseList(inner, "layout") ?? layout;
        const rawStages = parseList(inner, "stage");
        if (rawStages) {
            const next = rawStages.filter((s) => s === "generate" || s === "chat");
            if (next.length)
                stages = next;
        }
    }
    if (heading && /checklist|验收|quality\s*check/i.test(heading))
        isChecklist = true;
    return { applies, layout, stages, isChecklist };
}
/** 把 skill body 切成小节（含首个标题前的 preamble）。 */
function parseSkillSections(body) {
    const lines = body.split(/\r?\n/);
    const raw = [];
    let current = null;
    for (const line of lines) {
        const m = line.match(HEADING_RE);
        if (m) {
            if (current)
                raw.push(current);
            current = { heading: m[2] ?? null, buf: [line] };
        }
        else {
            if (!current)
                current = { heading: null, buf: [] };
            current.buf.push(line);
        }
    }
    if (current)
        raw.push(current);
    return raw
        .map((r) => {
        const text = r.buf.join("\n").replace(/\s+$/, "");
        const annot = parseAnnotation(text, r.heading);
        return {
            heading: r.heading,
            text,
            applies: annot.applies,
            layout: annot.layout,
            stages: annot.stages,
            isChecklist: annot.isChecklist,
        };
    })
        .filter((s) => s.text.trim().length > 0);
}
function sectionMatches(sec, ctx) {
    if (sec.applies && sec.applies.length > 0) {
        const fam = (ctx.styleFamily ?? "").trim().toLowerCase();
        if (fam && !sec.applies.includes(fam))
            return false;
    }
    if (sec.layout && sec.layout.length > 0) {
        const kinds = (ctx.layoutKinds ?? []).map((k) => k.trim().toLowerCase()).filter(Boolean);
        if (kinds.length > 0 && !sec.layout.some((l) => kinds.includes(l)))
            return false;
    }
    if (sec.stages && sec.stages.length > 0 && ctx.stage) {
        if (!sec.stages.includes(ctx.stage))
            return false;
    }
    return true;
}
/**
 * 按上下文过滤 skill body：只留命中的 + 全局小节。
 * 无过滤上下文（既无 styleFamily / layoutKinds / stage）→ 原样返回。
 */
function filterSkillBody(body, ctx) {
    const hasFamily = !!(ctx.styleFamily && ctx.styleFamily.trim());
    const hasLayout = !!(ctx.layoutKinds && ctx.layoutKinds.length > 0);
    const hasStage = !!ctx.stage;
    if (!hasFamily && !hasLayout && !hasStage)
        return body;
    const sections = parseSkillSections(body);
    if (sections.length === 0)
        return body;
    const kept = sections.filter((s) => sectionMatches(s, ctx));
    return kept.map((s) => s.text).join("\n\n").trim();
}
/** 抽取 body 里的 checklist 小节文本（供 art-director 验收 rubric）。 */
function extractChecklistSections(body) {
    return parseSkillSections(body)
        .filter((s) => s.isChecklist)
        .map((s) => s.text.trim())
        .filter(Boolean);
}
