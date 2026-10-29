"use strict";
// 生成流水线：deckgen（adapter + polish）。
//   有 outline → 按审阅过的页列表排版（不丢大纲去拼 7-beat 模板）
//   无 outline → narrative 模板（一键 API / 测试）
// 配图 / QA / 艺术总监在 adapter 内跑；无 API key 时跳过 LLM pass，仍能 compile。
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractLlmUsage = exports.UsageCounter = exports.hasRealGenerateUsage = exports.formatUsageAmounts = exports.formatGenerateProgress = exports.withGenerateWallClock = exports.throwIfAborted = exports.startGenerateWallClock = exports.shouldCommitGeneratedDeck = exports.isGenerateTimeoutError = exports.isGeneratePauseError = exports.isAbortError = exports.generateTimeoutError = exports.generatePauseError = exports.GENERATE_WALL_MS = exports.GENERATE_TIMEOUT_KIND = exports.GENERATE_PAUSE_KIND = exports.classifyGenerateEndError = exports.bindGenerateWallClock = exports.abortError = exports.resolveVisualSystem = exports.VISUAL_SYSTEMS = exports.VISUAL_SYSTEM_IDS = exports.DESIGN_GATE_KINDS = exports.DESIGN_LAYOUT_CATALOG = exports.runDesignGates = exports.runP0Gates = exports.ensureConfig = exports.themeContextFromSpec = exports.generateLayoutStyle = exports.generateThemeWithMotion = exports.generateMotionScheme = exports.generateTheme = exports.generateOutline = void 0;
exports.generateFromOutline = generateFromOutline;
exports.generatePresentation = generatePresentation;
const abort_1 = require("./abort");
const deckgen_adapter_1 = require("./deckgen-adapter");
const template_fill_1 = require("./template-fill");
var outline_1 = require("./stages/outline");
Object.defineProperty(exports, "generateOutline", { enumerable: true, get: function () { return outline_1.generateOutline; } });
var theme_1 = require("./stages/theme");
Object.defineProperty(exports, "generateTheme", { enumerable: true, get: function () { return theme_1.generateTheme; } });
Object.defineProperty(exports, "generateMotionScheme", { enumerable: true, get: function () { return theme_1.generateMotionScheme; } });
Object.defineProperty(exports, "generateThemeWithMotion", { enumerable: true, get: function () { return theme_1.generateThemeWithMotion; } });
Object.defineProperty(exports, "generateLayoutStyle", { enumerable: true, get: function () { return theme_1.generateLayoutStyle; } });
Object.defineProperty(exports, "themeContextFromSpec", { enumerable: true, get: function () { return theme_1.themeContextFromSpec; } });
var types_1 = require("./types");
Object.defineProperty(exports, "ensureConfig", { enumerable: true, get: function () { return types_1.ensureConfig; } });
var gates_1 = require("./qa/gates");
Object.defineProperty(exports, "runP0Gates", { enumerable: true, get: function () { return gates_1.runP0Gates; } });
var design_gates_1 = require("./qa/design-gates");
Object.defineProperty(exports, "runDesignGates", { enumerable: true, get: function () { return design_gates_1.runDesignGates; } });
Object.defineProperty(exports, "DESIGN_LAYOUT_CATALOG", { enumerable: true, get: function () { return design_gates_1.DESIGN_LAYOUT_CATALOG; } });
Object.defineProperty(exports, "DESIGN_GATE_KINDS", { enumerable: true, get: function () { return design_gates_1.DESIGN_GATE_KINDS; } });
var visual_system_1 = require("./visual-system");
Object.defineProperty(exports, "VISUAL_SYSTEM_IDS", { enumerable: true, get: function () { return visual_system_1.VISUAL_SYSTEM_IDS; } });
Object.defineProperty(exports, "VISUAL_SYSTEMS", { enumerable: true, get: function () { return visual_system_1.VISUAL_SYSTEMS; } });
Object.defineProperty(exports, "resolveVisualSystem", { enumerable: true, get: function () { return visual_system_1.resolveVisualSystem; } });
var abort_2 = require("./abort");
Object.defineProperty(exports, "abortError", { enumerable: true, get: function () { return abort_2.abortError; } });
Object.defineProperty(exports, "bindGenerateWallClock", { enumerable: true, get: function () { return abort_2.bindGenerateWallClock; } });
Object.defineProperty(exports, "classifyGenerateEndError", { enumerable: true, get: function () { return abort_2.classifyGenerateEndError; } });
Object.defineProperty(exports, "GENERATE_PAUSE_KIND", { enumerable: true, get: function () { return abort_2.GENERATE_PAUSE_KIND; } });
Object.defineProperty(exports, "GENERATE_TIMEOUT_KIND", { enumerable: true, get: function () { return abort_2.GENERATE_TIMEOUT_KIND; } });
Object.defineProperty(exports, "GENERATE_WALL_MS", { enumerable: true, get: function () { return abort_2.GENERATE_WALL_MS; } });
Object.defineProperty(exports, "generatePauseError", { enumerable: true, get: function () { return abort_2.generatePauseError; } });
Object.defineProperty(exports, "generateTimeoutError", { enumerable: true, get: function () { return abort_2.generateTimeoutError; } });
Object.defineProperty(exports, "isAbortError", { enumerable: true, get: function () { return abort_2.isAbortError; } });
Object.defineProperty(exports, "isGeneratePauseError", { enumerable: true, get: function () { return abort_2.isGeneratePauseError; } });
Object.defineProperty(exports, "isGenerateTimeoutError", { enumerable: true, get: function () { return abort_2.isGenerateTimeoutError; } });
Object.defineProperty(exports, "shouldCommitGeneratedDeck", { enumerable: true, get: function () { return abort_2.shouldCommitGeneratedDeck; } });
Object.defineProperty(exports, "startGenerateWallClock", { enumerable: true, get: function () { return abort_2.startGenerateWallClock; } });
Object.defineProperty(exports, "throwIfAborted", { enumerable: true, get: function () { return abort_2.throwIfAborted; } });
Object.defineProperty(exports, "withGenerateWallClock", { enumerable: true, get: function () { return abort_2.withGenerateWallClock; } });
var format_progress_1 = require("./format-progress");
Object.defineProperty(exports, "formatGenerateProgress", { enumerable: true, get: function () { return format_progress_1.formatGenerateProgress; } });
Object.defineProperty(exports, "formatUsageAmounts", { enumerable: true, get: function () { return format_progress_1.formatUsageAmounts; } });
Object.defineProperty(exports, "hasRealGenerateUsage", { enumerable: true, get: function () { return format_progress_1.hasRealGenerateUsage; } });
var usage_counter_1 = require("./usage-counter");
Object.defineProperty(exports, "UsageCounter", { enumerable: true, get: function () { return usage_counter_1.UsageCounter; } });
Object.defineProperty(exports, "extractLlmUsage", { enumerable: true, get: function () { return usage_counter_1.extractLlmUsage; } });
/** 从已知 outline（用户可能编辑过）继续生成完整 Presentation。 */
async function generateFromOutline(outlineInput, guidance, opts = {}) {
    return (0, abort_1.withGenerateWallClock)(opts, (bound) => generateFromOutlineBound(outlineInput, guidance, bound));
}
async function generateFromOutlineBound(outlineInput, guidance, opts) {
    (0, abort_1.throwIfAborted)(opts.signal);
    const visual = (0, template_fill_1.resolveVisualSource)(opts.layoutTemplate, opts.sampleComposition);
    if (visual.fillPlaceholders && opts.layoutTemplate) {
        const pres = (0, template_fill_1.presentationFromTemplateOutline)(opts.layoutTemplate, outlineInput);
        if (opts.enableQaRepair !== false)
            (0, template_fill_1.repairTemplateDeck)(pres);
        try {
            (0, template_fill_1.animateTemplateDeck)(pres, opts, outlineInput);
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
    return (0, deckgen_adapter_1.generatePresentationViaDeckgen)(guidance, outlineInput, {
        ...opts,
        sampleComposition: visual.composition,
    });
}
/** 一键生成（deckgen 四层管线 + polish）。大纲 LLM 由向导单独调用 `generateOutline`。 */
async function generatePresentation(guidance, opts = {}) {
    return (0, abort_1.withGenerateWallClock)(opts, (bound) => generatePresentationBound(guidance, bound));
}
async function generatePresentationBound(guidance, opts) {
    (0, abort_1.throwIfAborted)(opts.signal);
    return (0, deckgen_adapter_1.generatePresentationViaDeckgen)(guidance, undefined, opts);
}
