"use strict";
// 用户 skill 注册的自定义 styleFamily —— 突破 schema.ts 内置 7 族的闭集上限。
//
// frontmatter 写法（逗号分隔，每项 `id:hint`；hint 可省）：
//   styleFamilies: cyberpunk:Neon dark sci-fi, corporate-clean:Minimal corporate
//
// 合并规则：
//   - 只从 **enabled** 且 stage=generate|both 的 user skill 收集（builtin 不通过此机制扩族）；
//   - 同 id 多 skill 声明时后者覆盖 hint（按 listSkills 顺序）；
//   - 不得覆盖内置 STYLE_FAMILY_IDS（parse/lint 阶段 warn）。
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeStyleFamilyId = normalizeStyleFamilyId;
exports.parseStyleFamiliesCsv = parseStyleFamiliesCsv;
exports.formatStyleFamiliesCsv = formatStyleFamiliesCsv;
exports.resolveCustomStyleFamilies = resolveCustomStyleFamilies;
exports.isBuiltinStyleFamilyId = isBuiltinStyleFamilyId;
const schema_1 = require("../generate/schema");
const BUILTIN_SET = new Set(schema_1.STYLE_FAMILY_IDS);
const FAMILY_ID_RE = /^[a-z][a-z0-9_]{0,63}$/;
/** 归一化 family id（kebab → snake，与 skill id 同规则）。 */
function normalizeStyleFamilyId(raw) {
    return raw.trim().toLowerCase().replace(/[-\s]+/g, "_");
}
/**
 * 解析 frontmatter `styleFamilies` csv。
 * 格式：`id:hint, id2` —— 冒号后是 hint；无冒号则 hint=id。
 */
function parseStyleFamiliesCsv(raw) {
    if (!raw?.trim())
        return [];
    const out = [];
    const seen = new Set();
    for (const part of raw.split(",")) {
        const trimmed = part.trim();
        if (!trimmed)
            continue;
        const colon = trimmed.indexOf(":");
        const idRaw = colon > 0 ? trimmed.slice(0, colon).trim() : trimmed;
        const hintRaw = colon > 0 ? trimmed.slice(colon + 1).trim() : trimmed;
        const id = normalizeStyleFamilyId(idRaw);
        if (!id || !FAMILY_ID_RE.test(id))
            continue;
        if (BUILTIN_SET.has(id))
            continue;
        if (seen.has(id))
            continue;
        seen.add(id);
        out.push({ id, hint: hintRaw || id });
    }
    return out;
}
function formatStyleFamiliesCsv(defs) {
    if (!defs?.length)
        return "";
    return defs.map((d) => `${d.id}: ${d.hint}`).join(", ");
}
/** 从 enabled generate-affecting skills 合并自定义族（不含 builtin）。 */
function resolveCustomStyleFamilies(skills) {
    const byId = new Map();
    for (const s of skills) {
        if (!s.enabled)
            continue;
        if (s.stage !== "generate" && s.stage !== "both")
            continue;
        for (const def of s.styleFamilies ?? []) {
            if (BUILTIN_SET.has(def.id))
                continue;
            byId.set(def.id, def);
        }
    }
    return [...byId.values()];
}
/** 内置 + 自定义族 id 全集 —— 见 registry.getKnownStyleFamilyIds（含 enabled 过滤）。 */
function isBuiltinStyleFamilyId(id) {
    return BUILTIN_SET.has(id);
}
