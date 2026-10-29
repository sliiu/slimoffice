"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GENERATE_BRIEF_CONSTRAINTS = exports.WEB_EXCLUSIVE_DECK_MIN_SLIDES = exports.WEB_EXCLUSIVE_MIN_PAGES = exports.WEB_EXCLUSIVE_COUNT_KINDS = exports.WEB_EXCLUSIVE_LAYOUTS = exports.NO_BULLET_LAYOUTS = exports.FULL_BLEED_ROLES = void 0;
exports.isFullBleedRole = isFullBleedRole;
exports.isNoBulletLayout = isNoBulletLayout;
exports.isWebExclusiveKind = isWebExclusiveKind;
exports.applyCompileConstraints = applyCompileConstraints;
const ensure_spec_quality_1 = require("../qa/ensure-spec-quality");
exports.FULL_BLEED_ROLES = ["cover", "section", "closing", "hero"];
exports.NO_BULLET_LAYOUTS = [
    "cards",
    "process",
    "comparison",
    "metrics",
    "timeline",
    "chart",
    "agenda",
];
exports.WEB_EXCLUSIVE_LAYOUTS = ["cards", "process", "comparison", "two-column"];
exports.WEB_EXCLUSIVE_COUNT_KINDS = [
    "cards",
    "process",
    "comparison",
    "two-column",
    "twocolumn",
    "metrics",
    "timeline",
    "chart",
];
exports.WEB_EXCLUSIVE_MIN_PAGES = 4;
exports.WEB_EXCLUSIVE_DECK_MIN_SLIDES = 6;
exports.GENERATE_BRIEF_CONSTRAINTS = {
    fullBleedRoles: exports.FULL_BLEED_ROLES,
    noBulletLayouts: exports.NO_BULLET_LAYOUTS,
    webExclusiveLayouts: exports.WEB_EXCLUSIVE_LAYOUTS,
    webExclusiveMinPages: exports.WEB_EXCLUSIVE_MIN_PAGES,
};
const STRUCTURAL = new Set(["cover", "hero", "section", "closing"]);
function isFullBleedRole(kind) {
    return !!kind && exports.FULL_BLEED_ROLES.includes(kind);
}
function isNoBulletLayout(kind) {
    return !!kind && exports.NO_BULLET_LAYOUTS.includes(kind);
}
function isWebExclusiveKind(kind) {
    const n = (kind ?? "").toLowerCase();
    return exports.WEB_EXCLUSIVE_COUNT_KINDS.some((k) => n === k || n.includes(k));
}
function countWebExclusive(slides) {
    return slides.filter((s) => isWebExclusiveKind(s.kind)).length;
}
function ensureWebExclusiveQuota(slides, guidance) {
    if (slides.length < exports.WEB_EXCLUSIVE_DECK_MIN_SLIDES)
        return { slides, fixes: [] };
    const out = slides.slice();
    const fixes = [];
    let count = countWebExclusive(out);
    if (count >= exports.WEB_EXCLUSIVE_MIN_PAGES)
        return { slides: out, fixes };
    let rotate = 0;
    for (let i = 0; i < out.length && count < exports.WEB_EXCLUSIVE_MIN_PAGES; i++) {
        const cur = out[i];
        if (STRUCTURAL.has(cur.kind) || isWebExclusiveKind(cur.kind))
            continue;
        const target = exports.WEB_EXCLUSIVE_LAYOUTS[rotate % exports.WEB_EXCLUSIVE_LAYOUTS.length];
        rotate += 1;
        out[i] = (0, ensure_spec_quality_1.remapSlideSpec)(target, cur, {
            ...(guidance.topic ? { topic: guidance.topic } : {}),
        });
        fixes.push(`slide ${i + 1}: ${cur.kind} → ${out[i].kind} (web-exclusive)`);
        count += 1;
    }
    return { slides: out, fixes };
}
function applyCompileConstraints(spec, guidance = {}) {
    const g = { topic: guidance.topic ?? "", ...guidance };
    const ensured = (0, ensure_spec_quality_1.ensureSlideSpecQuality)(spec.slides, g);
    const web = ensureWebExclusiveQuota(ensured.specs, g);
    return {
        spec: { ...spec, slides: web.slides },
        fixes: [...ensured.fixes, ...web.fixes],
    };
}
