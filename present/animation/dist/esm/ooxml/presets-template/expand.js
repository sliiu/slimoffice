// 把 PresetTemplate.template 深克隆并替换占位符，返回可嵌入 timing 树的 TimeNode。
//
// 占位符约定：
//   - tgtEl.spTgt.spid === "$tgt"            → ctx.tgtSpid
//   - tgtEl.spTgt.txEl 未设置且 ctx.pRg 提供 → 注入 pRg/charRg
//   - cBhvr.from/to/by 中字符串 "$presetSubtype" → ctx.presetSubtype 数值替换
//   - 根 cTn.dur === undefined 且 ctx.durMs   → 设为 ctx.durMs
//
// 不做：
//   - 复杂表达式 evaluate（attr-map.evalExpr 已经在 compile 路径处理）
//   - 方向到 path 的转换（path 模板里直接写好对应字符串变体；exit 等方向变体由 ids 多份模板覆盖）
import { isBehavior, isContainer, isMedia, getChildren, getCTn, } from "../types.js";
import { derivableSubtypes, deriveSubtypeVariant, subtypeKind } from "./derive.js";
export function expandPresetTemplate(template, ctx) {
    const cloned = deepCloneTimeNode(pickSubtypeSource(template, ctx.presetSubtype));
    applyOverrides(cloned, ctx, /*depth*/ 0);
    return cloned;
}
// 命中已提取的变体就用它；没有则从已有变体按方向改写；都不行才用基模板。
function pickSubtypeSource(template, subtype) {
    const subs = template._subtypes;
    if (subtype === undefined || subtype === 0 || !subs)
        return template.template;
    if (subs[subtype])
        return subs[subtype];
    for (const donor of Object.values(subs)) {
        const derived = deriveSubtypeVariant(donor, subtype);
        if (derived)
            return derived;
    }
    return template.template;
}
/** 该模板能展开出的 subtype：已提取的变体 + 可按方向改写出的变体（升序）。 */
export function presetTemplateSubtypes(template) {
    const subs = template._subtypes;
    if (!subs)
        return [];
    const out = new Set();
    for (const [k, donor] of Object.entries(subs)) {
        const n = Number(k);
        if (n !== 0)
            out.add(n);
        for (const s of derivableSubtypes(donor))
            out.add(s);
    }
    return [...out].sort((a, b) => a - b);
}
/** 模板 subtype 的 UI 含义（取第一个能识别方向写法的变体）。 */
export function presetTemplateSubtypeKind(template) {
    for (const donor of Object.values(template._subtypes ?? {})) {
        const kind = subtypeKind(donor);
        if (kind)
            return kind;
    }
    return undefined;
}
function deepCloneTimeNode(value) {
    if (value === null || typeof value !== "object")
        return value;
    if (Array.isArray(value)) {
        return value.map((v) => deepCloneTimeNode(v));
    }
    const out = {};
    for (const [k, v] of Object.entries(value)) {
        out[k] = deepCloneTimeNode(v);
    }
    return out;
}
function applyOverrides(node, ctx, depth) {
    // 根节点 cTn.dur / delay 覆盖（仅当模板没显式设置）。
    if (depth === 0) {
        const cTn = getCTn(node);
        if (cTn.dur === undefined && ctx.durMs !== undefined) {
            cTn.dur = ctx.durMs;
        }
        if (cTn.delay === undefined && ctx.delayMs !== undefined) {
            cTn.delay = ctx.delayMs;
        }
    }
    if (isContainer(node)) {
        for (const c of getChildren(node))
            applyOverrides(c, ctx, depth + 1);
        return;
    }
    if (isBehavior(node)) {
        bindSpTgt(node.cBhvr.tgtEl, ctx);
        replacePlaceholderField(node.cBhvr, "from", ctx);
        replacePlaceholderField(node.cBhvr, "to", ctx);
        replacePlaceholderField(node.cBhvr, "by", ctx);
        return;
    }
    if (isMedia(node)) {
        bindSpTgt(node.cMediaNode.tgtEl, ctx);
    }
}
function bindSpTgt(tgtEl, ctx) {
    if (!tgtEl?.spTgt)
        return;
    if (tgtEl.spTgt.spid === "$tgt") {
        tgtEl.spTgt.spid = ctx.tgtSpid;
    }
    if ((ctx.pRg || ctx.charRg) && !tgtEl.spTgt.txEl) {
        tgtEl.spTgt.txEl = {};
    }
    if (ctx.pRg && tgtEl.spTgt.txEl && !tgtEl.spTgt.txEl.pRg) {
        tgtEl.spTgt.txEl.pRg = { ...ctx.pRg };
    }
    if (ctx.charRg && tgtEl.spTgt.txEl && !tgtEl.spTgt.txEl.charRg) {
        tgtEl.spTgt.txEl.charRg = { ...ctx.charRg };
    }
}
function replacePlaceholderField(obj, field, ctx) {
    const v = obj[field];
    if (typeof v !== "string")
        return;
    if (!v.includes("$"))
        return;
    obj[field] = v.replace(/\$presetSubtype/g, String(ctx.presetSubtype ?? 0));
}
