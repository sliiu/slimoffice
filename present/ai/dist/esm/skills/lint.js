// Skill 保存时的非阻断 lint —— 抓"按直觉写但静默不生效"的坑。
//
// 与 parseSkill 的分工：parse 管"格式合法性"（阻断保存）；lint 管"语义有效性"
// （不阻断，UI 保存成功后把 warnings 弹给用户）。
import { STYLE_FAMILY_IDS, OUTLINE_LAYOUT_HINTS } from "../generate/schema.js";
import { contrastRatio, parseHex } from "../generate/qa/color.js";
import { parseSkillSections } from "./sections.js";
import { isBuiltinStyleFamilyId } from "./style-families.js";
const BUILTIN_FAMILIES = new Set(STYLE_FAMILY_IDS);
const KNOWN_LAYOUTS = new Set(OUTLINE_LAYOUT_HINTS);
/**
 * 返回人类可读的 warning 列表（空数组 = 无问题）。
 */
export function lintSkill(spec, ctx = {}) {
    const warnings = [];
    const sections = parseSkillSections(spec.body);
    warnings.push(...lintVisualSystems(spec, ctx));
    const knownFamilies = new Set([
        ...STYLE_FAMILY_IDS,
        ...(ctx.extraStyleFamilies ?? []),
        ...(spec.styleFamilies ?? []).map((f) => f.id),
    ]);
    for (const def of spec.styleFamilies ?? []) {
        if (BUILTIN_FAMILIES.has(def.id)) {
            warnings.push(`styleFamilies declares builtin id "${def.id}" — builtin families cannot be redefined; remove it or pick a new id.`);
        }
    }
    for (const sec of sections) {
        const where = sec.heading ? `section "${sec.heading}"` : "preamble";
        for (const fam of sec.applies ?? []) {
            if (!knownFamilies.has(fam)) {
                warnings.push(`${where}: unknown style family "${fam}" in <!-- applies -->; this section will never be injected when that family is selected. Declare it in frontmatter \`styleFamilies:\` or use a builtin: ${STYLE_FAMILY_IDS.join(", ")}.`);
            }
        }
        for (const lay of sec.layout ?? []) {
            if (!KNOWN_LAYOUTS.has(lay)) {
                warnings.push(`${where}: unknown layout "${lay}" in <!-- layout -->; this section will never be injected on slide passes. Known layouts: ${OUTLINE_LAYOUT_HINTS.join(", ")}.`);
            }
        }
    }
    const affectsGenerate = spec.stage === "generate" || spec.stage === "both";
    if (affectsGenerate && !sections.some((s) => s.isChecklist)) {
        warnings.push('no checklist section found — add a section marked with `<!-- checklist -->` (or a heading containing "checklist") so the art-director review pass can use your acceptance criteria as its rubric.');
    }
    // styleFamilies 声明了但 body 里没有对应 applies 小节 → 可能用户忘了写路由。
    if ((spec.styleFamilies?.length ?? 0) > 0) {
        const declared = new Set((spec.styleFamilies ?? []).map((f) => f.id));
        for (const sec of sections) {
            for (const fam of sec.applies ?? [])
                declared.delete(fam);
        }
        for (const orphan of declared) {
            if (!isBuiltinStyleFamilyId(orphan)) {
                warnings.push(`styleFamilies declares "${orphan}" but no section uses <!-- applies: ${orphan} --> — add a routed section or the family picker entry will have no matching rules.`);
            }
        }
    }
    return warnings;
}
/** Custom visual systems: fonts that will not load, palettes that will not read, systems the prose never names. */
function lintVisualSystems(spec, ctx) {
    const warnings = [];
    const defs = spec.visualSystems ?? [];
    if (!defs.length)
        return warnings;
    if (spec.stage === "chat") {
        warnings.push("visual-system blocks only take effect for stage generate | both — this skill is chat-only, so its systems are never registered.");
    }
    for (const def of defs) {
        for (const family of def.fontFamilies ?? []) {
            if (ctx.isKnownFontFamily && !ctx.isKnownFontFamily(family)) {
                warnings.push(`visual system "${def.id}": font family "${family}" is not a known preset and will not be loaded — the text falls back to the next face in fonts.display / fonts.body. Remove it or name it in the CSS stack only.`);
            }
        }
        if (def.palette) {
            const bg = parseHex(def.palette.bg);
            const ink = parseHex(def.palette.ink);
            const accent = parseHex(def.palette.accent);
            if (bg && ink && contrastRatio(ink, bg) < 4.5) {
                warnings.push(`visual system "${def.id}": palette ink on bg is below 4.5:1 — the theme harmonizer will shift it toward grey.`);
            }
            if (bg && accent && contrastRatio(accent, bg) < 3) {
                warnings.push(`visual system "${def.id}": palette accent on bg is below 3:1 — accent type and rules will be nudged darker / lighter.`);
            }
            const tone = def.canvas?.tone;
            if (bg && tone) {
                const dark = (0.2126 * bg.r + 0.7152 * bg.g + 0.0722 * bg.b) / 255 < 0.5;
                if (dark !== (tone === "dark"))
                    warnings.push(`visual system "${def.id}": canvas.tone is "${tone}" but palette.bg is a ${dark ? "dark" : "light"} colour.`);
            }
        }
        const mentioned = spec.body.replace(/```[\s\S]*?```/g, "").includes(def.id);
        if (!mentioned) {
            warnings.push(`visual system "${def.id}" is registered but the skill text never names it — add a line such as "Use systemId=${def.id} for this look" so the organizer / author actually picks it.`);
        }
    }
    return warnings;
}
