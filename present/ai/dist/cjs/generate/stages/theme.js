"use strict";
// 阶段：主题 + motion scheme 生成。
//
// 用户可能只想"换个主题"而保留现有内容（无需重生成大纲 / 各页）；
// 一键生成流程里 themeId="ai" 时自动走这条链路，与 outline 并行启动。
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateTheme = generateTheme;
exports.generateMotionScheme = generateMotionScheme;
exports.themeContextFromSpec = themeContextFromSpec;
exports.generateLayoutStyle = generateLayoutStyle;
exports.generateThemeWithMotion = generateThemeWithMotion;
const client_1 = require("../../llm/client");
const themes_1 = require("../../themes");
const animations_1 = require("../../animations");
const prompts_1 = require("../prompts");
const aliases_1 = require("../aliases");
const types_1 = require("../types");
const abort_1 = require("../abort");
const layout_style_1 = require("../layout-style");
async function generateTheme(guidance, opts = {}) {
    const config = (0, types_1.ensureConfig)(opts.config);
    const { model } = (0, client_1.createLlm)(config.text);
    (0, abort_1.throwIfAborted)(opts.signal);
    opts.onProgress?.({ stage: "outline", progress: 0.1, detailKey: "theme.designing" });
    const system = [(0, prompts_1.themeSystemPrompt)(opts.hostSkillStore, guidance.styleFamily), config.text.systemPrefix.trim()]
        .filter(Boolean)
        .join("\n\n");
    // 方向骰子：每次生成随机抛一个调色板原型作为"非绑定"起点。用户给了 styleHint
    // 时骰子退居其次（prompt 里已声明 styleHint 优先），但仍能打散同 brief 下的
    // run-to-run 收敛 —— 这是"重新生成主题会明显变样"的主要来源。
    const dice = prompts_1.THEME_PALETTE_ARCHETYPES[Math.floor(Math.random() * prompts_1.THEME_PALETTE_ARCHETYPES.length)];
    const prompt = [
        (0, prompts_1.themeUserPrompt)(guidance),
        "",
        `Direction dice for THIS run (non-binding starting point; the Style hint, if present, always wins): archetype "${dice.id}" — ${dice.hint}.`,
    ].join("\n");
    const spec = await (0, aliases_1.generateSpecJson)(model, themes_1.GeneratedThemeSpecSchema, system, prompt, opts.signal, undefined, opts.onLlmUsage);
    // 浏览器侧立即注入 google fonts CSS link（service-side/无 document 时 noop）。
    const theme = (0, themes_1.realizeGeneratedTheme)(spec, opts.debug ? { debug: true } : {});
    opts.onProgress?.({
        stage: "outline",
        progress: 1,
        detailKey: "theme.ready",
        detailParams: { name: spec.name },
    });
    return { spec, theme };
}
async function generateMotionScheme(guidance, opts = {}) {
    const config = (0, types_1.ensureConfig)(opts.config);
    const { model } = (0, client_1.createLlm)(config.text);
    opts.onProgress?.({ stage: "outline", progress: 0.1, detailKey: "motion.designing" });
    const system = [(0, prompts_1.motionSystemPrompt)(), config.text.systemPrefix.trim()].filter(Boolean).join("\n\n");
    const spec = await (0, aliases_1.generateSpecJson)(model, animations_1.MotionSchemeSpecSchema, system, (0, prompts_1.motionUserPrompt)(guidance), opts.signal, 
    // 模型很常把 rolesOverride 写成 null 或者干脆漏掉 —— 都补成 {}。
    // 这是 motion schema 的高频翻车点；放在这层省一次 zod 校验失败 + 重试。
    (v) => {
        if (v && typeof v === "object" && !Array.isArray(v)) {
            const o = v;
            if (o.rolesOverride == null)
                o.rolesOverride = {};
        }
        return v;
    }, opts.onLlmUsage);
    const bundle = (0, animations_1.synthesizeBundleFromMotionScheme)(spec);
    opts.onProgress?.({
        stage: "outline",
        progress: 1,
        detailKey: "motion.ready",
        detailParams: { name: spec.name },
    });
    return { spec, bundle };
}
/**
 * 把 GeneratedThemeSpec 浓缩成 motion 用的 ThemeContext。
 * 不暴露完整 palette（避免 prompt token 浪费），只给最影响 motion 的几项。
 */
function themeContextFromSpec(spec) {
    const accentVibe = `accent1=${spec.palette.accent1}, accent2=${spec.palette.accent2}, bg=${spec.palette.bg}`;
    return {
        name: spec.name,
        description: spec.description,
        mode: spec.mode,
        accentVibe,
        decoration: spec.decoration,
    };
}
/**
 * AI 布局风格生成：LLM 设计一套版式语言（LayoutStyleSpec），layouts.ts 引擎
 * 按 spec 渲染。与主题（颜色/字体）、motion（动效）并列的第三个设计自由度。
 *
 * themeSpec 可选 —— 传入时布局系统会与已定的主题调性联动。
 */
async function generateLayoutStyle(guidance, opts = {}, themeSpec) {
    const config = (0, types_1.ensureConfig)(opts.config);
    const { model } = (0, client_1.createLlm)(config.text);
    const system = [(0, layout_style_1.layoutStyleSystemPrompt)(opts.hostSkillStore, guidance.styleFamily), config.text.systemPrefix.trim()]
        .filter(Boolean)
        .join("\n\n");
    // 方向骰子：与主题原型同心智，打散同 brief 下的构图收敛。
    const dice = layout_style_1.LAYOUT_STYLE_ARCHETYPES[Math.floor(Math.random() * layout_style_1.LAYOUT_STYLE_ARCHETYPES.length)];
    const prompt = [
        (0, layout_style_1.layoutStyleUserPrompt)(guidance, themeSpec),
        "",
        `Direction dice for THIS run (non-binding starting point): archetype "${dice.id}" — ${dice.hint}.`,
    ].join("\n");
    const raw = await (0, aliases_1.generateSpecJson)(model, layout_style_1.LayoutStyleSpecSchema, system, prompt, opts.signal, undefined, opts.onLlmUsage);
    return (0, layout_style_1.clampLayoutStyle)(raw);
}
/**
 * 一次性生成"主题 + 配套 motion scheme + 布局风格"。theme 先行（motion 与
 * layout style 都要 theme 摘要做联动），随后 motion / layoutStyle 并行。
 *
 * 失败模式：
 *   - theme 生成失败 → 整体抛错（无主题就不应该往下走）；
 *   - motion 失败 → 静默回退到根据 theme 推断的内置 bundle；
 *   - layoutStyle 失败 → 返回 null，layouts.ts 回退到种子化构图变体。
 */
async function generateThemeWithMotion(themeGuidance, motionGuidance, opts = {}) {
    const themeResult = await generateTheme(themeGuidance, opts);
    const [motion, layoutStyle] = await Promise.all([
        generateMotionScheme({ ...motionGuidance, themeContext: themeContextFromSpec(themeResult.spec) }, opts).catch((e) => {
            (0, abort_1.rethrowIfAborted)(opts.signal, e);
            if (opts.debug)
                console.warn("[ai] generateMotionScheme failed, will fall back to built-in bundle", e);
            return null;
        }),
        generateLayoutStyle({
            topic: themeGuidance.topic,
            audience: themeGuidance.audience,
            scenario: themeGuidance.scenario,
            styleFamily: themeGuidance.styleFamily,
            styleHint: themeGuidance.styleHint,
        }, opts, themeResult.spec).catch((e) => {
            (0, abort_1.rethrowIfAborted)(opts.signal, e);
            if (opts.debug)
                console.warn("[ai] generateLayoutStyle failed, falling back to seeded variants", e);
            return null;
        }),
    ]);
    return { ...themeResult, motion, layoutStyle };
}
