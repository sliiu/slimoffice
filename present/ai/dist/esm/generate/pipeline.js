// 生成流水线：deckgen（adapter + polish）。
//   有 outline → 按审阅过的页列表排版（不丢大纲去拼 7-beat 模板）
//   无 outline → narrative 模板（一键 API / 测试）
// 配图 / QA / 艺术总监在 adapter 内跑；无 API key 时跳过 LLM pass，仍能 compile。
import { withGenerateWallClock, throwIfAborted } from "./abort.js";
import { generatePresentationViaDeckgen } from "./deckgen-adapter.js";
import { animateTemplateDeck, presentationFromTemplateOutline, repairTemplateDeck, resolveVisualSource } from "./template-fill.js";
export { generateOutline } from "./stages/outline.js";
export { generateTheme, generateMotionScheme, generateThemeWithMotion, generateLayoutStyle, themeContextFromSpec, } from "./stages/theme.js";
export { ensureConfig } from "./types.js";
export { runP0Gates } from "./qa/gates.js";
export { runDesignGates, DESIGN_LAYOUT_CATALOG, DESIGN_GATE_KINDS, } from "./qa/design-gates.js";
export { VISUAL_SYSTEM_IDS, VISUAL_SYSTEMS, resolveVisualSystem, } from "./visual-system.js";
export { abortError, bindGenerateWallClock, classifyGenerateEndError, GENERATE_PAUSE_KIND, GENERATE_TIMEOUT_KIND, GENERATE_WALL_MS, generatePauseError, generateTimeoutError, isAbortError, isGeneratePauseError, isGenerateTimeoutError, shouldCommitGeneratedDeck, startGenerateWallClock, throwIfAborted, withGenerateWallClock, } from "./abort.js";
export { formatGenerateProgress, formatUsageAmounts, hasRealGenerateUsage } from "./format-progress.js";
export { UsageCounter, extractLlmUsage } from "./usage-counter.js";
/** 从已知 outline（用户可能编辑过）继续生成完整 Presentation。 */
export async function generateFromOutline(outlineInput, guidance, opts = {}) {
    return withGenerateWallClock(opts, (bound) => generateFromOutlineBound(outlineInput, guidance, bound));
}
async function generateFromOutlineBound(outlineInput, guidance, opts) {
    throwIfAborted(opts.signal);
    const visual = resolveVisualSource(opts.layoutTemplate, opts.sampleComposition);
    if (visual.fillPlaceholders && opts.layoutTemplate) {
        const pres = presentationFromTemplateOutline(opts.layoutTemplate, outlineInput);
        if (opts.enableQaRepair !== false)
            repairTemplateDeck(pres);
        try {
            animateTemplateDeck(pres, opts, outlineInput);
        }
        catch (e) {
            if (opts.debug)
                console.warn("[ai] template motion failed", e);
        }
        opts.onProgress?.({
            stage: "done",
            progress: 1,
            detailKey: opts.enableAnimations === false ? "animate.skipped" : "animate.ready",
        });
        return pres;
    }
    return generatePresentationViaDeckgen(guidance, outlineInput, {
        ...opts,
        sampleComposition: visual.composition,
    });
}
/** 一键生成（deckgen 四层管线 + polish）。大纲 LLM 由向导单独调用 `generateOutline`。 */
export async function generatePresentation(guidance, opts = {}) {
    return withGenerateWallClock(opts, (bound) => generatePresentationBound(guidance, bound));
}
async function generatePresentationBound(guidance, opts) {
    throwIfAborted(opts.signal);
    return generatePresentationViaDeckgen(guidance, undefined, opts);
}
