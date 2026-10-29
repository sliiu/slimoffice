"use strict";
// PresetRegistry：所有 OOXML preset 的子树模板汇集。
//
// 数据来源（阶段 A2）：scripts/extract-preset-templates.mjs 从 samples/ 下 PPTX 中
// 提取的真实 cTn 子树（占位符 "$tgt" 已替换 spid），存于 data/extracted.json。
// 加载时按 (presetClass, presetID[, presetSubtype]) 索引。
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerPresetTemplate = registerPresetTemplate;
exports.findPresetTemplate = findPresetTemplate;
exports.hasPresetTemplate = hasPresetTemplate;
exports.listPresetTemplates = listPresetTemplates;
const data_1 = require("./data");
function buildFromExtracted(map) {
    const out = [];
    // 同一 presetID 的不同 subtype 合并：subtype=0 的作为基模板；其他 subtype
    // 在 expand 时由 PresetExpandCtx.presetSubtype 控制（如果 subtype 模板存在则优先用之）。
    const grouped = new Map();
    for (const [key, tn] of Object.entries(map)) {
        const [idStr, subStr] = key.split(".");
        const id = Number(idStr);
        const sub = subStr !== undefined ? Number(subStr) : 0;
        if (!Number.isFinite(id))
            continue;
        if (!grouped.has(id))
            grouped.set(id, {});
        grouped.get(id)[sub] = tn;
    }
    for (const [id, subMap] of grouped) {
        const subs = Object.keys(subMap).map(Number).sort((a, b) => a - b);
        const base = subMap[subs[0]];
        const supportsSubtype = subs.length > 1 || subs[0] !== 0;
        out.push({
            ids: [id],
            name: `preset-${id}`,
            supportsSubtype,
            template: base,
            // subtype 变体存到模板上（自定义字段，expand 时按需使用；只有一个变体时也保留，
            // 它是改写其它方向的来源）。
            ...(supportsSubtype ? { _subtypes: subMap } : {}),
        });
    }
    return out;
}
const REGISTRY = {
    entr: buildFromExtracted(data_1.EXTRACTED_PRESETS.entr),
    exit: buildFromExtracted(data_1.EXTRACTED_PRESETS.exit),
    emph: buildFromExtracted(data_1.EXTRACTED_PRESETS.emph),
    path: buildFromExtracted(data_1.EXTRACTED_PRESETS.path),
};
function registerPresetTemplate(classKey, template) {
    REGISTRY[classKey].push(template);
}
// 动画库里和已抽样预设同名、但 Animations.pptx 没单独抽出的 ID。
// 播放用那份样本子树，不另编一棵。
const SAMPLED_NAME_ALIAS = {
    "entr:32": 43, // Center Revolve
    "entr:36": 37, // Rise Up
    "entr:44": 47, // Descend
    "exit:32": 43,
    "exit:36": 37, // Sink Down
    "exit:44": 47, // Ascend
    "emph:17": 16, // Brush On Color
};
function findDirectTemplate(presetClass, presetID) {
    const key = classToKey(presetClass);
    if (!key)
        return undefined;
    for (const t of REGISTRY[key]) {
        if (t.ids.includes(presetID))
            return t;
    }
    return undefined;
}
function findPresetTemplate(presetClass, presetID) {
    const direct = findDirectTemplate(presetClass, presetID);
    if (direct)
        return direct;
    const key = classToKey(presetClass);
    if (!key)
        return undefined;
    const alias = SAMPLED_NAME_ALIAS[`${key}:${presetID}`];
    if (alias === undefined)
        return undefined;
    return findDirectTemplate(presetClass, alias);
}
function hasPresetTemplate(presetClass, presetID) {
    return findPresetTemplate(presetClass, presetID) !== undefined;
}
function listPresetTemplates(classKey) {
    return REGISTRY[classKey].slice();
}
function classToKey(c) {
    switch (c) {
        case "entr":
            return "entr";
        case "exit":
            return "exit";
        case "emph":
            return "emph";
        case "path":
            return "path";
        default:
            return undefined;
    }
}
