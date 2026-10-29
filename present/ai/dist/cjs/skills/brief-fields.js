"use strict";
// Generate wizard brief fields — declared per skill via frontmatter `briefFields`.
//
// Enabled skills (stage generate | both) union their briefFields; the UI surfaces
// editable inputs on the options step without hardcoding skill ids.
Object.defineProperty(exports, "__esModule", { value: true });
exports.GENERATE_BRIEF_FIELD_IDS = void 0;
exports.isGenerateBriefFieldId = isGenerateBriefFieldId;
exports.parseBriefFieldsCsv = parseBriefFieldsCsv;
exports.formatBriefFieldsCsv = formatBriefFieldsCsv;
exports.resolveCustomBriefFields = resolveCustomBriefFields;
exports.resolveRequiredBriefFields = resolveRequiredBriefFields;
exports.isBriefFieldFilled = isBriefFieldFilled;
exports.isSkillGatedBriefField = isSkillGatedBriefField;
exports.isBriefFieldVisibleForGenerate = isBriefFieldVisibleForGenerate;
/** Keys aligned with GuidanceInput / generate wizard content fields. */
exports.GENERATE_BRIEF_FIELD_IDS = [
    "topic",
    "audience",
    "scenario",
    "goals",
    "styleFamily",
    "slideCount",
    "language",
    "extraNotes",
];
const FIELD_ID_SET = new Set(exports.GENERATE_BRIEF_FIELD_IDS);
function isGenerateBriefFieldId(s) {
    return FIELD_ID_SET.has(s);
}
/** Parse `briefFields: audience, scenario, goals` from skill frontmatter. */
function parseBriefFieldsCsv(raw) {
    if (!raw?.trim())
        return [];
    const out = [];
    for (const part of raw.split(",")) {
        const id = part.trim();
        if (!id)
            continue;
        if (isGenerateBriefFieldId(id)) {
            if (!out.includes(id))
                out.push(id);
        }
        else {
            console.warn(`[skills] unknown briefFields entry "${id}" — ignored`);
        }
    }
    return out;
}
function formatBriefFieldsCsv(fields) {
    if (!fields?.length)
        return "";
    return fields.join(", ");
}
/**
 * Union free-form briefCustom labels from enabled generate-affecting skills.
 * 同名 label（大小写不敏感）合并 requestedBy；显示用第一次出现的原文。
 */
function resolveCustomBriefFields(skills) {
    const byKey = new Map();
    for (const skill of skills) {
        if (!skill.enabled)
            continue;
        if (skill.stage !== "generate" && skill.stage !== "both")
            continue;
        for (const label of skill.briefCustom ?? []) {
            const key = label.toLowerCase();
            const entry = byKey.get(key) ?? { label, requestedBy: [] };
            if (!entry.requestedBy.includes(skill.name))
                entry.requestedBy.push(skill.name);
            byKey.set(key, entry);
        }
    }
    return [...byKey.values()];
}
/** Union briefFields from enabled skills that affect the generate path. */
function resolveRequiredBriefFields(skills) {
    const byField = new Map();
    for (const skill of skills) {
        if (!skill.enabled)
            continue;
        if (skill.stage !== "generate" && skill.stage !== "both")
            continue;
        for (const field of skill.briefFields ?? []) {
            const list = byField.get(field) ?? [];
            if (!list.includes(skill.name))
                list.push(skill.name);
            byField.set(field, list);
        }
    }
    return exports.GENERATE_BRIEF_FIELD_IDS.filter((f) => byField.has(f)).map((field) => ({
        field,
        requestedBy: byField.get(field),
    }));
}
function isBriefFieldFilled(field, values) {
    const raw = values[field]?.trim() ?? "";
    if (field === "slideCount") {
        const n = parseInt(raw, 10);
        return !isNaN(n) && n > 0;
    }
    // styleFamily 是下拉选择，其空值 = "自动（由主题/场景推断）"，本身就是一个合法且完整的
    // 选择（让 AI 推断风格），不是"未指定"。因此恒视为已填，避免选"自动"时被误报未填写。
    if (field === "styleFamily")
        return true;
    return raw.length > 0;
}
/** True if any skill (enabled or not) declares this field in briefFields. */
function isSkillGatedBriefField(skills, field) {
    return skills.some((s) => (s.stage === "generate" || s.stage === "both") && (s.briefFields ?? []).includes(field));
}
/** Content-step visibility: always on unless skill-gated and no enabled skill requests it. */
function isBriefFieldVisibleForGenerate(skills, field) {
    if (field === "topic")
        return true;
    if (!isSkillGatedBriefField(skills, field))
        return true;
    return resolveRequiredBriefFields(skills).some((r) => r.field === field);
}
