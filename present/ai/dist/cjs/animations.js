"use strict";
// AI 端动画系统：把 .shared/ui-ux-pro-max 的"主流审美"沉淀为
//   (A) 一组 entrance effect 名 + auto-animate 角色分类器
//   (B) 若干 "Motion Bundle" —— 把 effect 选择 / 节奏 / 页间过渡打包成"风格预设"
// 最终翻译为 OOXML preset 子树写入 slide.ooxmlTiming + slide.transition。
//
// 设计原则（提炼自 ux-guidelines.csv "Animation" 行）：
//   1. Easing：入场用 ease-out（OOXML preset 自带 easeOutCubic / easeOutQuad）。
//   2. Duration：250..500ms。过长（>500ms）feels sluggish，过短（<150ms）不自然。
//   3. Excessive Motion：每页仅 1–2 个关键元素需要"动得明显"，其余用 fade 或
//      `appear` 一带而过。
//   4. Reduced Motion：尊重用户系统设置 —— 运行时由 player 层判断，此处仅控制
//      "生成是否带动画"。
//   5. Performance：preset 走 transform/opacity，不动 layout 属性（OOXML 子树
//      模板天然如此）。
//
// "Motion Bundle"（Phase A 升级）：现实里"商务 SaaS"和"暗色发布会"的动态语言
// 不应该是同一套。我们维护 4 种主流 bundle —— minimal / cinematic / editorial /
// playful —— 每个 bundle 在统一的 baseline 之上做局部覆盖（角色 → 不同 effect/
// 时长/节奏），同时附带一个 slide-to-slide 过渡（OOXML p:transition），让 deck
// 不再是一张张"硬切"。bundle 选择优先级：调用方显式指定 > 基于 pres.theme 自
// 动推断（dark→cinematic, creative→playful, academic→editorial, ...） >
// "minimal" 兜底。
//
// 我们只暴露 8 个最主流的 entrance effect 名字给 AI，避免选择疲劳与"装饰过载"。
// 装饰性强（Bounce / Spiral / Pinwheel / Credits）一律不在 AI 可选范围内 —
// 用户依然可通过 editor 的动画面板手动添加，但 AI 不会主动生成。
//
// effect 名 → OOXML (presetClass, presetID) 来源于 packages/animation/src/ooxml/
// presets/entrance.ts 中的 ID 对照表（已与 ECMA-376 §19.5.13 entr 比对验证）。
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAINSTREAM_ANIMATION_GUIDELINES = exports.MotionSchemeSpecSchema = exports.MOTION_SCHEME_CONFIGURABLE_ROLES = exports.MOTION_BUNDLES = exports.MOTION_BUNDLE_IDS = exports.MAINSTREAM_EFFECT_LIST = void 0;
exports.resolveEffectPreset = resolveEffectPreset;
exports.applyAnimationsToSlide = applyAnimationsToSlide;
exports.clearSlideAnimations = clearSlideAnimations;
exports.getMotionBundle = getMotionBundle;
exports.isBuiltInMotionBundleId = isBuiltInMotionBundleId;
exports.resolveBundleForPresentation = resolveBundleForPresentation;
exports.autoAnimateSlide = autoAnimateSlide;
exports.applyBundleTransitionToSlide = applyBundleTransitionToSlide;
exports.autoAnimatePresentation = autoAnimatePresentation;
exports.synthesizeBundleFromMotionScheme = synthesizeBundleFromMotionScheme;
const zod_1 = require("zod");
const commands_1 = require("@sliiu/present-editor/commands");
exports.MAINSTREAM_EFFECT_LIST = [
    "appear",
    "fade",
    "fade-up",
    "fade-down",
    "float-up",
    "zoom",
    "zoom-soft",
    "wipe",
    "glide",
];
const PRESET_TABLE = {
    appear: { presetClass: "entr", presetId: 1, defaultDurationMs: 1 }, // 瞬时
    fade: { presetClass: "entr", presetId: 10, defaultDurationMs: 400 },
    "fade-up": { presetClass: "entr", presetId: 42, defaultDurationMs: 450 },
    "fade-down": { presetClass: "entr", presetId: 47, defaultDurationMs: 450 },
    "float-up": { presetClass: "entr", presetId: 37, defaultDurationMs: 500 },
    zoom: { presetClass: "entr", presetId: 23, defaultDurationMs: 450 },
    "zoom-soft": { presetClass: "entr", presetId: 53, defaultDurationMs: 500 },
    wipe: { presetClass: "entr", presetId: 22, defaultDurationMs: 400 },
    glide: { presetClass: "entr", presetId: 54, defaultDurationMs: 500 },
};
function resolveEffectPreset(name) {
    return PRESET_TABLE[name];
}
// ---- 把 effect[] 应用到 slide.ooxmlTiming ----
function toInsertArgs(spec) {
    const preset = PRESET_TABLE[spec.effect];
    const args = {
        targetShapeId: spec.shapeId,
        presetClass: preset.presetClass,
        presetId: preset.presetId,
        trigger: spec.trigger ?? "afterPrevious",
        durationMs: spec.durationMs ?? preset.defaultDurationMs,
    };
    if (spec.delayMs !== undefined)
        args.delayMs = spec.delayMs;
    if (spec.paraRange)
        args.paraRange = spec.paraRange;
    return args;
}
function applyAnimationsToSlide(slide, effects) {
    if (effects.length === 0)
        return;
    const timing = (0, commands_1.ensureTiming)(slide);
    for (const eff of effects) {
        (0, commands_1.insertEffect)(timing, toInsertArgs(eff));
    }
}
function clearSlideAnimations(slide) {
    if (!slide.ooxmlTiming)
        return;
    // 复位为 undefined，让 player / serializer 当作"无动画"处理。
    // 不保留空 timing 框架，避免 OOXML 序列化出多余 <p:timing/>。
    delete slide.ooxmlTiming;
}
// 顺序敏感：先匹配优先级高的（cover/section/closing 等专属命名）。
const ROLE_CLASSIFIERS = [
    // 背景层 / 装饰
    { test: (n) => /background$/i.test(n), role: "background" },
    { test: (n) => /accent$/i.test(n), role: "accent" },
    // Cover / Section / Closing
    { test: (n) => /^cover title$/i.test(n), role: "cover-title" },
    { test: (n) => /^cover subtitle$/i.test(n), role: "cover-subtitle" },
    { test: (n) => /^cover footer$/i.test(n), role: "cover-footer" },
    { test: (n) => /^section number$/i.test(n), role: "section-number" },
    { test: (n) => /^section title$/i.test(n), role: "section-title" },
    { test: (n) => /^section caption$/i.test(n), role: "section-caption" },
    { test: (n) => /^closing title$/i.test(n), role: "closing-title" },
    { test: (n) => /^closing message$/i.test(n), role: "closing-message" },
    { test: (n) => /^closing contact$/i.test(n), role: "closing-contact" },
    // Hero / Banner（v2 版式命名）：hero 语义 ≈ cover，banner 语义 ≈ 内容页
    { test: (n) => /^hero title$/i.test(n), role: "cover-title" },
    { test: (n) => /^hero subtitle$/i.test(n), role: "cover-subtitle" },
    { test: (n) => /^(hero|banner) eyebrow$/i.test(n), role: "eyebrow" },
    { test: (n) => /^kicker$/i.test(n), role: "eyebrow" },
    { test: (n) => /^banner title$/i.test(n), role: "page-title" },
    { test: (n) => /^banner body$/i.test(n), role: "bullets" },
    // Stat / Metrics（大数字先入，标签随后）
    { test: (n) => /^(stat|metric) value$/i.test(n), role: "stat-value" },
    { test: (n) => /^(stat|metric) label$/i.test(n), role: "stat-label" },
    { test: (n) => /^stat context$/i.test(n), role: "body" },
    // 内容页
    { test: (n) => /^page title$/i.test(n), role: "page-title" },
    { test: (n) => /^bullets body$/i.test(n), role: "bullets" },
    { test: (n) => /^column title$/i.test(n), role: "column-title" },
    { test: (n) => /^column body$/i.test(n), role: "column-body" },
    { test: (n) => /^side text$/i.test(n), role: "side-text" },
    { test: (n) => /^body$/i.test(n), role: "body" },
    // Cards / Agenda / Process / Timeline / Comparison（v2 命名 → 复用列语义角色）
    { test: (n) => /^card title$/i.test(n), role: "column-title" },
    { test: (n) => /^card body$/i.test(n), role: "column-body" },
    { test: (n) => /^agenda label$/i.test(n), role: "bullets" },
    { test: (n) => /^agenda caption$/i.test(n), role: "side-text" },
    { test: (n) => /^(agenda|process) number$/i.test(n), role: "step-marker" },
    { test: (n) => /^(process|timeline|compare) (title|label)$/i.test(n), role: "column-title" },
    { test: (n) => /^(process|timeline) detail$/i.test(n), role: "column-body" },
    { test: (n) => /^compare body$/i.test(n), role: "column-body" },
    { test: (n) => /^vs text$/i.test(n), role: "cell" },
    // Quote
    { test: (n) => /^quote mark$/i.test(n), role: "quote-mark" },
    { test: (n) => /^quote text$/i.test(n), role: "quote-text" },
    { test: (n) => /^quote attribution$/i.test(n), role: "quote-attribution" },
    // 图片
    { test: (n) => /^image( placeholder| hint)?$/i.test(n), role: "image" },
    { test: (n) => /^chart$/i.test(n), role: "chart" },
    // 表格
    { test: (n) => /^table header$/i.test(n), role: "table-header" },
    { test: (n) => /^header cell$/i.test(n), role: "table-header-cell" },
    { test: (n) => /^row stripe$/i.test(n), role: "row-stripe" },
    { test: (n) => /^cell$/i.test(n), role: "cell" },
];
// deckgen 画布路径的命名：`slot:<slot>[:<n>]`，device 展开件为 `slot:<device>.<item>.<part>`
// （见 deckgen/devices.ts、canvas-author.ts toFilled）。slot 名由模型自拟（title / kicker /
// folio / kpi-card-2 …），这里按语义词根归类，让叙事顺序仍是 eyebrow → 标题 → 卡片 → 页脚，
// 而不是全部落到 unknown-text 后按 y 排。顺序敏感：device 部件先于页面级词根。
const SLOT_CLASSIFIERS = [
    { test: (n) => /\.kpi\d+\.value$/.test(n), role: "stat-value" },
    { test: (n) => /\.kpi\d+\.label$/.test(n), role: "stat-label" },
    { test: (n) => /\.kpi\d+\.note$/.test(n), role: "body" },
    { test: (n) => /\.(?:step|row)\d+\.num$/.test(n), role: "step-marker" },
    { test: (n) => /\.(?:step|row|tile)\d+\.title$/.test(n), role: "column-title" },
    { test: (n) => /\.(?:step|row|tile)\d+\.body$/.test(n), role: "column-body" },
    { test: (n) => /\.(?:left|right)\.title$/.test(n), role: "column-title" },
    { test: (n) => /\.(?:left|right)\.p\d+$/.test(n), role: "column-body" },
    { test: (n) => /\.mark$/.test(n), role: "quote-mark" },
    { test: (n) => /\.quote$/.test(n), role: "quote-text" },
    { test: (n) => /\.attrib$/.test(n), role: "quote-attribution" },
    { test: (n) => /\.(?:text)$/.test(n), role: "body" },
    // page-level slots
    { test: (n) => /^(?:kicker|eyebrow|overline|tag|label|meta)\b/.test(n), role: "eyebrow" },
    { test: (n) => /^(?:folio|page-?num\w*|pagenum\w*|footer|source|footnote|date|logo)\b/.test(n), role: "cover-footer" },
    { test: (n) => /^(?:display|hero|statement|claim|headline)\b/.test(n), role: "cover-title" },
    { test: (n) => /^(?:sub-?title|deck|lede|standfirst|subhead|intro)\b/.test(n), role: "cover-subtitle" },
    { test: (n) => /^(?:title|heading|h1)\b/.test(n) && !/sub/.test(n), role: "page-title" },
    { test: (n) => /\b(?:kpi|stat|metric|value|number)\b/.test(n), role: "stat-value" },
    { test: (n) => /\b(?:card|tile|col(?:umn)?|step|item|plane|feature)\w*[-_ .]?(?:title|head)/.test(n), role: "column-title" },
    { test: (n) => /\b(?:card|tile|col(?:umn)?|step|item|plane|feature)\w*[-_ .]?(?:body|desc|text|copy)/.test(n), role: "column-body" },
    { test: (n) => /^(?:quote|pull-?quote)\b/.test(n), role: "quote-text" },
    { test: (n) => /^(?:body|copy|para\w*|desc\w*|bullet\w*|point\w*|text|summary|detail\w*|note|caption)\b/.test(n), role: "body" },
];
/** `slot:kpis.kpi0.value:3` → `kpis.kpi0.value`; non-slot names → null. */
function slotOfName(name) {
    const m = /^slot:(.+?)(?::\d+)?$/.exec(name);
    return m ? m[1].toLowerCase() : null;
}
function classifyShape(s) {
    const name = (s.name ?? "").trim();
    if (name) {
        for (const r of ROLE_CLASSIFIERS)
            if (r.test(name))
                return r.role;
        // Slot roles are type roles: a surface named `kpi-card-1` is still a decoration member.
        const slot = s.kind === "text" ? slotOfName(name) : null;
        if (slot) {
            for (const r of SLOT_CLASSIFIERS)
                if (r.test(slot))
                    return r.role;
        }
    }
    // 兜底：parse 出来的 PPT 通常没有我们的稳定命名。按 kind 给一个保守动画。
    if (s.kind === "text")
        return "unknown-text";
    if (s.kind === "image")
        return "unknown-image";
    if (s.kind === "chart")
        return "chart";
    if (s.kind === "group")
        return "unknown-group";
    return null;
}
exports.MOTION_BUNDLE_IDS = [
    "minimal",
    "cinematic",
    "editorial",
    "playful",
];
// ---- BASELINE：默认（≈ minimal bundle 的内涵）—— 任何 bundle 没覆盖的角色都走这套 ----
const BASELINE_ROLES = {
    // 装饰层不入栈（appear 在 PowerPoint 里其实"立即显示"，没必要占一条 effect）
    background: null,
    accent: null,
    // Eyebrow / kicker：标题上方的小引导行，先于标题轻入
    eyebrow: { effect: "fade", gapMs: 60, durationMs: 300 },
    // Stat / Metric：大数字柔和放大，标签淡入
    "stat-value": { effect: "zoom-soft", gapMs: 60 },
    "stat-label": { effect: "fade", gapMs: 80 },
    // 流程/议程的序号圆点：先于步骤标题快速铺开
    "step-marker": { effect: "fade", gapMs: 40, durationMs: 250 },
    // Cover
    "cover-title": { effect: "fade-up" },
    "cover-subtitle": { effect: "fade", gapMs: 100 },
    "cover-footer": { effect: "fade", gapMs: 80 },
    // Section
    "section-number": { effect: "fade-up" },
    "section-title": { effect: "fade-up", gapMs: 80 },
    "section-caption": { effect: "fade", gapMs: 100 },
    // Closing
    "closing-title": { effect: "fade-up" },
    "closing-message": { effect: "fade", gapMs: 120 },
    "closing-contact": { effect: "fade", gapMs: 80 },
    // 内容页
    "page-title": { effect: "fade-up" },
    bullets: { effect: "fade", gapMs: 120 },
    "column-title": { effect: "fade-up", gapMs: 80 },
    "column-body": { effect: "fade", gapMs: 80 },
    "side-text": { effect: "fade", gapMs: 100 },
    body: { effect: "fade", gapMs: 120 },
    // Quote
    "quote-mark": { effect: "fade" },
    "quote-text": { effect: "fade-up", gapMs: 120 },
    "quote-attribution": { effect: "fade", gapMs: 120 },
    // 图片
    image: { effect: "zoom-soft", gapMs: 120 },
    chart: { effect: "wipe", gapMs: 140, durationMs: 500 },
    // 表格
    "table-header": { effect: "wipe" },
    "table-header-cell": { effect: "fade", gapMs: 40 },
    "row-stripe": null,
    cell: { effect: "fade", gapMs: 30 },
    // 兜底
    "unknown-text": { effect: "fade", gapMs: 100 },
    "unknown-image": { effect: "zoom-soft", gapMs: 100 },
    "unknown-group": { effect: "fade", gapMs: 100 },
};
// ---- 4 套主流 bundle ----
//
// 命名 / 调性对应关系参考 ui-ux-pro-max styles.csv：
//   - minimal     ≈ Minimalism & Swiss Style + Flat Design + Hero-Centric (subtle)
//   - cinematic   ≈ Dark Mode + 3D & Hyperrealism + Motion-Driven（发布会 / launch keynote）
//   - editorial   ≈ Minimalism + Brutalism（克制版）+ Storytelling-Driven（杂志感）
//   - playful    ≈ Vibrant & Block-based + Claymorphism + Aurora UI（活泼 / 品牌广告）
exports.MOTION_BUNDLES = {
    minimal: {
        id: "minimal",
        name: "Minimal",
        description: "Restrained fade-up titles + fade bullets; no slide transition. Matches SaaS, business, technical decks.",
        rolesOverride: {},
        paceMultiplier: 1,
        // 不写 slideTransition → 走 cut（最素净）
    },
    cinematic: {
        id: "cinematic",
        name: "Cinematic",
        description: "Slower, more dramatic. Float-up titles, glide bullets, zoom on images. Pairs with dark / keynote / launch themes.",
        rolesOverride: {
            "cover-title": { effect: "float-up", durationMs: 700, gapMs: 0 },
            "cover-subtitle": { effect: "glide", gapMs: 200 },
            "section-number": { effect: "float-up", durationMs: 600 },
            "section-title": { effect: "glide", gapMs: 200 },
            "page-title": { effect: "float-up", durationMs: 600 },
            bullets: { effect: "glide", gapMs: 180, durationMs: 600 },
            body: { effect: "glide", gapMs: 200, durationMs: 600 },
            "quote-text": { effect: "float-up", durationMs: 700, gapMs: 250 },
            image: { effect: "zoom-soft", durationMs: 700, gapMs: 200 },
            chart: { effect: "float-up", durationMs: 650, gapMs: 180 },
            "stat-value": { effect: "zoom-soft", durationMs: 600, gapMs: 80 },
            "closing-title": { effect: "float-up", durationMs: 700 },
        },
        paceMultiplier: 1.2,
        slideTransition: { kind: "fade", duration: 0.6 },
    },
    editorial: {
        id: "editorial",
        name: "Editorial",
        description: "Magazine / serif feel. Snappy fade-up titles, fast fade bullets, wipe table headers. Pairs with academic / minimal-serif themes.",
        rolesOverride: {
            "cover-title": { effect: "fade-up", durationMs: 400, gapMs: 0 },
            "cover-subtitle": { effect: "fade", durationMs: 350, gapMs: 80 },
            "section-title": { effect: "fade-up", durationMs: 400 },
            "page-title": { effect: "fade-up", durationMs: 400 },
            bullets: { effect: "fade", durationMs: 300, gapMs: 70 },
            "quote-text": { effect: "fade-up", durationMs: 500, gapMs: 150 },
            image: { effect: "fade", durationMs: 500, gapMs: 100 },
            chart: { effect: "wipe", durationMs: 450, gapMs: 80 },
        },
        paceMultiplier: 0.85,
        slideTransition: { kind: "fade", duration: 0.4 },
    },
    playful: {
        id: "playful",
        name: "Playful",
        description: "Energetic. Zoom-soft titles, fade-up bullets in quick succession, zoom on images. Pairs with creative / vibrant / brand themes.",
        rolesOverride: {
            "cover-title": { effect: "zoom-soft", durationMs: 500 },
            "cover-subtitle": { effect: "fade-up", durationMs: 350, gapMs: 120 },
            "section-number": { effect: "zoom", durationMs: 450 },
            "section-title": { effect: "fade-up", durationMs: 400, gapMs: 100 },
            "page-title": { effect: "fade-down", durationMs: 400 },
            bullets: { effect: "fade-up", durationMs: 300, gapMs: 60 },
            body: { effect: "fade-up", durationMs: 350, gapMs: 80 },
            "column-title": { effect: "fade-down", gapMs: 60 },
            image: { effect: "zoom", durationMs: 500, gapMs: 100 },
            chart: { effect: "zoom-soft", durationMs: 500, gapMs: 80 },
            "closing-title": { effect: "zoom-soft" },
        },
        paceMultiplier: 0.9,
        // transition-fx 用 `dir` 作 key（不是 `direction`）；同时 parser/serializer
        // 也按 ECMA-376 §19.5.50 的 @dir 写出。值 left/right/up/down 都合法。
        slideTransition: { kind: "push", duration: 0.5, params: { dir: "left" } },
    },
};
function getMotionBundle(id) {
    if (id && exports.MOTION_BUNDLES[id])
        return exports.MOTION_BUNDLES[id];
    return exports.MOTION_BUNDLES.minimal;
}
function isBuiltInMotionBundleId(id) {
    return exports.MOTION_BUNDLE_IDS.includes(id);
}
// ---- bundle ← pres.theme 自动推断 ----
function isLikelyDark(hex) {
    if (!hex)
        return false;
    const m = /^#?([0-9a-fA-F]{6})/.exec(hex);
    if (!m)
        return false;
    const h = m[1];
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    // 用 ITU-R BT.601 近似亮度（不必精确，仅用于分类决策）
    const y = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
    return y < 0.35;
}
/**
 * 根据 presentation 当前主题挑一个 motion bundle。
 *
 * 规则：
 *   1. 内置 5 套主题：business/minimal → minimal；academic → editorial；
 *      creative → playful；dark → cinematic。
 *   2. AI 生成主题（id 以 "ai_" 开头）：根据背景色亮度推断 light/dark；dark 走
 *      cinematic，light 默认走 minimal。
 *   3. 兜底 minimal。
 *
 * 这层是"友好默认"，调用方仍可显式传 bundleId 覆盖。
 */
function resolveBundleForPresentation(pres) {
    const id = pres.theme?.id;
    if (id) {
        if (id === "dark")
            return "cinematic";
        if (id === "academic")
            return "editorial";
        if (id === "creative")
            return "playful";
        if (id === "business" || id === "minimal")
            return "minimal";
        // AI 生成主题（ai_xxx）走亮度推断。
        if (id.startsWith("ai_")) {
            if (isLikelyDark(pres.theme?.colors?.bg1))
                return "cinematic";
            return "minimal";
        }
    }
    // 完全未知（parse 出来的 PPT，可能根本没有 pres.theme.id）→ 兜底
    return "minimal";
}
function resolveRoleHint(role, bundle) {
    if (role === null)
        return null;
    const override = bundle.rolesOverride[role];
    if (override !== undefined)
        return override;
    return BASELINE_ROLES[role];
}
function flattenShapes(slide) {
    const out = [];
    for (const layer of slide.layers) {
        for (const s of layer.shapes)
            out.push(s);
    }
    return out;
}
/**
 * 叙事顺序排名：数值小的先动。shapes 数组顺序是 z-order/构造顺序（面板先建、
 * meta 行可能先于标题 push），**不是**阅读顺序 —— 动画接力必须按叙事层级：
 * eyebrow → 标题 → 副标题/标签 → 正文/列表/卡片 → 图片 → meta/页脚。
 * 同级内再按 (y, x) 排，保证多卡片/多列从左上往右下扫。
 */
const ROLE_NARRATIVE_RANK = {
    eyebrow: 5,
    "quote-mark": 8,
    "section-number": 9,
    "cover-title": 10,
    "section-title": 10,
    "closing-title": 10,
    "page-title": 10,
    "quote-text": 10,
    "stat-value": 10,
    "table-header": 12,
    "table-header-cell": 14,
    "cover-subtitle": 20,
    "section-caption": 20,
    "closing-message": 20,
    "stat-label": 20,
    "step-marker": 22,
    "column-title": 24,
    cell: 26,
    bullets: 30,
    "column-body": 30,
    body: 30,
    "side-text": 30,
    "quote-attribution": 32,
    "unknown-text": 32,
    "unknown-group": 32,
    chart: 36,
    image: 40,
    "unknown-image": 40,
    "cover-footer": 50,
    "closing-contact": 50,
};
/** 单页 effect 总数硬上限：防止超大表格把 timing 树撑爆。 */
const MAX_EFFECTS_PER_SLIDE = 60;
/** 面积占比超过它的填充形状是页面级底纹，不能当单元底板。 */
const SURFACE_MAX_AREA_RATIO = 0.4;
/** 形状四边探出底板不超过这个值，仍算同一单元。 */
const OVERHANG_PX = 24;
/** 形状面积有这么多落在底板里，也算同一单元（探出超过 24px 但大部分还在板上）。 */
const OVERLAP_JOIN = 0.5;
function shapeArea(s) {
    return Math.max(0, s.bbox.w) * Math.max(0, s.bbox.h);
}
function hasVisibleFill(s) {
    const fill = s.fill;
    return !!fill && fill.kind !== "none";
}
/**
 * 能否充当"单元底板"：有可见填充的矩形 / 椭圆，且既不横跨整页也不纵贯整页。
 * 全屏 BG overlay、banner 竖带、页面级色块都会被后两条挡掉。
 */
function isSurfaceCandidate(s, slideW, slideH) {
    if (s.kind !== "rect" && s.kind !== "ellipse")
        return false;
    if (!hasVisibleFill(s))
        return false;
    const { w, h } = s.bbox;
    if (w <= 0 || h <= 0)
        return false;
    if (w >= slideW * 0.95 || h >= slideH * 0.95)
        return false;
    return (w * h) / (slideW * slideH) <= SURFACE_MAX_AREA_RATIO;
}
function bboxContains(outer, inner, tolerance) {
    const a = outer.bbox;
    const b = inner.bbox;
    return (b.x >= a.x - tolerance &&
        b.y >= a.y - tolerance &&
        b.x + b.w <= a.x + a.w + tolerance &&
        b.y + b.h <= a.y + a.h + tolerance);
}
/** 内形状有多少面积落在外形状里。0 = 不相交。 */
function overlapRatio(inner, outer) {
    const a = inner.bbox;
    const b = outer.bbox;
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (w <= 0 || h <= 0)
        return 0;
    return (w * h) / Math.max(1, a.w * a.h);
}
function joinsSurface(outer, inner) {
    return bboxContains(outer, inner, OVERHANG_PX) || overlapRatio(inner, outer) >= OVERLAP_JOIN;
}
function groupIntoUnits(shapes, bundle, slideW, slideH) {
    const entries = [];
    for (const shape of shapes) {
        // 低透明度幽灵底纹（ghost glyph 等）不参与入场叙事，也不该被当作底板。
        if ((shape.opacity ?? 1) < 0.3)
            continue;
        const role = classifyShape(shape);
        entries.push({
            shape,
            hint: resolveRoleHint(role, bundle),
            rank: (role && ROLE_NARRATIVE_RANK[role]) ?? 30,
            role,
        });
    }
    const keyOf = new Map();
    const byId = new Map(entries.map((e) => [e.shape.id, e]));
    for (const e of entries) {
        if (e.shape.animUnit)
            keyOf.set(e, `tag:${e.shape.animUnit}`);
    }
    // 预设路径和它的标签不是「底板包住文字」，但它们是一块。
    for (const e of entries) {
        if (!e.shape.id.endsWith("_label"))
            continue;
        const host = byId.get(e.shape.id.slice(0, -"_label".length));
        if (!host)
            continue;
        const key = keyOf.get(host) ?? keyOf.get(e) ?? `preset:${host.shape.id}`;
        keyOf.set(host, key);
        keyOf.set(e, key);
    }
    // 底板先占住自己的 key，避免嵌套面板把内层卡片吞进外层。
    // 子形状再找「装得下它的最小底板」。
    const surfaces = entries.filter((e) => isSurfaceCandidate(e.shape, slideW, slideH));
    for (const s of surfaces) {
        if (!keyOf.has(s))
            keyOf.set(s, `box:${s.shape.id}`);
    }
    for (const e of entries) {
        if (keyOf.has(e))
            continue;
        let best;
        for (const s of surfaces) {
            if (s === e)
                continue;
            if (!joinsSurface(s.shape, e.shape))
                continue;
            if (!best || shapeArea(s.shape) < shapeArea(best.shape))
                best = s;
        }
        if (best)
            keyOf.set(e, keyOf.get(best));
    }
    const buckets = new Map();
    const order = [];
    for (const e of entries) {
        const key = keyOf.get(e) ?? `solo:${e.shape.id}`;
        let bucket = buckets.get(key);
        if (!bucket) {
            bucket = [];
            buckets.set(key, bucket);
            order.push(key);
        }
        bucket.push(e);
    }
    const units = [];
    const leadless = [];
    for (const key of order) {
        const members = buckets.get(key);
        let lead;
        for (const m of members) {
            if (!m.hint)
                continue;
            if (!lead || m.rank < lead.rank)
                lead = m;
        }
        if (!lead) {
            leadless.push(members);
            continue;
        }
        units.push({ members, lead, rank: lead.rank });
    }
    // 全员装饰的单元：页面级底纹 / 侧栏 / 通栏色带 / 整宽分隔线是"页面家具"，整体跳过（一开始就在）。
    // 但小件装饰 —— 标签旁的图标、步骤间的箭头、卡片外的小色块 —— 静止不动而周围文字都在入场，
    // 看起来就是"有的动有的不动"。小件并入最近的单元一起出现；孤立的自成一拍淡入。
    for (const members of leadless) {
        const box = unionBox(members);
        if (box.w >= slideW * 0.9 || box.h >= slideH * 0.9)
            continue;
        // 只包住一个单元的外框，跟那一块一起入场。包住好几块的共享底，一开始就在。
        const framed = units.filter((u) => boxContainsBox(box, unionBox(u.members)));
        if (framed.length === 1) {
            framed[0].members.push(...members);
            continue;
        }
        if (framed.length > 1)
            continue;
        if ((box.w * box.h) / (slideW * slideH) > DECOR_ATTACH_MAX_AREA)
            continue;
        const host = nearestUnit(units, box, DECOR_ATTACH_MAX_DISTANCE);
        if (host) {
            host.members.push(...members);
            continue;
        }
        const lead = members[0];
        lead.hint = DECOR_FALLBACK_HINT;
        lead.rank = DECOR_FALLBACK_RANK;
        units.push({ members, lead, rank: DECOR_FALLBACK_RANK });
    }
    return absorbMarkers(units);
}
/** 序号、引号这种小标记单独成拍时，贴进旁边那一块，避免数字先飞、标题后到。 */
function absorbMarkers(units) {
    const stay = [];
    const satellites = [];
    for (const unit of units) {
        const role = unit.lead.role;
        if (unit.members.length === 1 && (role === "step-marker" || role === "quote-mark"))
            satellites.push(unit);
        else
            stay.push(unit);
    }
    for (const satellite of satellites) {
        const host = nearestUnit(stay, unionBox(satellite.members), DECOR_ATTACH_MAX_DISTANCE);
        if (!host) {
            stay.push(satellite);
            continue;
        }
        host.members.push(...satellite.members);
        recomputeLead(host);
    }
    return stay;
}
function recomputeLead(unit) {
    let lead;
    for (const m of unit.members) {
        if (!m.hint)
            continue;
        if (!lead || m.rank < lead.rank)
            lead = m;
    }
    if (!lead)
        return;
    unit.lead = lead;
    unit.rank = lead.rank;
}
/**
 * 扩散序列的键。同一设备族（kpis.kpi0 / kpis.kpi1）或同一叙事角色的连续单元
 * 是并列项，每一项等一次点击。
 */
function seriesKey(unit) {
    for (const m of unit.members) {
        const tag = m.shape.animUnit;
        if (!tag)
            continue;
        const match = /^(.*)\.(?:kpi|step|row|tile)\d+$/.exec(tag);
        if (match?.[1])
            return `family:${match[1]}`;
    }
    return `role:${unit.lead.role ?? "decor"}`;
}
/**
 * 不在底板里的多段列表：每一段等一次点击。已经嵌进卡片底板的列表跟卡片一起入场。
 */
function bulletSpans(unit, slideW, slideH) {
    const lead = unit.lead;
    if (lead.role !== "bullets" || lead.shape.kind !== "text")
        return 1;
    const n = lead.shape.paragraphs?.length ?? 0;
    if (n < 2)
        return 1;
    const framed = unit.members.some((m) => m !== lead && isSurfaceCandidate(m.shape, slideW, slideH) && bboxContains(m.shape, lead.shape, OVERHANG_PX));
    return framed ? 1 : n;
}
/** 小件装饰的兜底入场：淡入、短、排在正文之后。 */
const DECOR_FALLBACK_HINT = { effect: "fade", gapMs: 60, durationMs: 300 };
const DECOR_FALLBACK_RANK = 34;
/** 面积占比超过它的无文字组合是页面家具，不入场。 */
const DECOR_ATTACH_MAX_AREA = 0.1;
/** 小件装饰离某单元的边距在此之内就并入该单元（px）。 */
const DECOR_ATTACH_MAX_DISTANCE = 64;
function unionBox(members) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const m of members) {
        const b = m.shape.bbox;
        x0 = Math.min(x0, b.x);
        y0 = Math.min(y0, b.y);
        x1 = Math.max(x1, b.x + b.w);
        y1 = Math.max(y1, b.y + b.h);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
function boxContainsBox(outer, inner, tolerance = OVERHANG_PX) {
    return (inner.x >= outer.x - tolerance &&
        inner.y >= outer.y - tolerance &&
        inner.x + inner.w <= outer.x + outer.w + tolerance &&
        inner.y + inner.h <= outer.y + outer.h + tolerance);
}
/** Edge-to-edge distance between two boxes (0 when they touch or overlap). */
function boxDistance(a, b) {
    const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
    const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
    return Math.hypot(dx, dy);
}
function nearestUnit(units, box, maxDistance) {
    let best;
    let bestDist = Infinity;
    for (const u of units) {
        const d = boxDistance(unionBox(u.members), box);
        if (d <= maxDistance && d < bestDist) {
            bestDist = d;
            best = u;
        }
    }
    return best;
}
const TITLE_BEAT_ROLES = new Set([
    "eyebrow",
    "cover-subtitle",
    "section-number",
    "section-caption",
    "cover-title",
    "section-title",
    "closing-title",
    "page-title",
]);
const FOOTER_BEAT_ROLES = new Set(["cover-footer", "closing-contact"]);
function shapePlain(shape) {
    if (shape.kind === "text") {
        return (shape.paragraphs ?? []).map((p) => p.runs.map((r) => r.text ?? "").join("")).join("\n");
    }
    if (shape.kind === "group")
        return shape.children.map(shapePlain).filter(Boolean).join("\n");
    return "";
}
function unitPlain(unit) {
    return unit.members.map((m) => shapePlain(m.shape)).filter(Boolean).join("\n");
}
function normCue(s) {
    return s.toLowerCase().replace(/[\s|｜:：,，.。、/\\\-—–_]+/g, "");
}
function cueScore(hay, needle) {
    const a = normCue(hay);
    const b = normCue(needle);
    if (!a || !b)
        return 0;
    if (a === b)
        return 1;
    if (a.includes(b) || b.includes(a))
        return 0.92;
    const parts = needle.toLowerCase().split(/[\s|｜:：,，.。、/\\\-—–_]+/).filter((t) => t.length >= 2);
    if (!parts.length)
        return 0;
    const h = hay.toLowerCase();
    let hit = 0;
    for (const t of parts)
        if (h.includes(t))
            hit += 1;
    return hit / parts.length;
}
function shapeSpeaks(shape) {
    if (shape.kind === "image" || shape.kind === "chart")
        return true;
    if (shape.kind === "text")
        return shapePlain(shape).trim().length > 0;
    if (shape.kind === "group")
        return shape.children.some(shapeSpeaks);
    return false;
}
function isBareDecor(unit) {
    return !unit.members.some((m) => shapeSpeaks(m.shape));
}
function isImageUnit(unit) {
    return unit.members.some((m) => m.shape.kind === "image" || m.role === "image" || m.role === "unknown-image")
        && !unit.members.some((m) => m.shape.kind === "text" && shapePlain(m.shape).trim());
}
function isChartUnit(unit) {
    return unit.members.some((m) => m.shape.kind === "chart" || m.role === "chart");
}
function deviceIndex(unit) {
    for (const m of unit.members) {
        const tag = m.shape.animUnit ?? "";
        const match = /(?:kpi|step|row|tile)(\d+)$/.exec(tag);
        if (match)
            return Number(match[1]);
    }
    return undefined;
}
/** 这一页有没有「01 / 02」这种序号槽。有的话，同号的正文跟序号走，不再按要点文本对调。 */
function slideHasIndexSlots(units) {
    return units.some((unit) => unit.members.some((m) => /^slot:index:\d+(?::|$)/i.test(m.shape.name ?? "")));
}
/**
 * 带序号的一块在序列里的位置（0 起）。
 * 步骤 / 议程行看 animUnit；`slot:index:N` 和同号的 `slot:items:N` 算同一列。
 * 普通卡片没有序号，返回 undefined，仍按要点文本排。
 */
function numberedOrdinal(unit, pairItems) {
    if (unit.members.some((m) => m.role === "step-marker")) {
        for (const m of unit.members) {
            const tag = m.shape.animUnit ?? "";
            const dev = /^(?:.*\.)?(?:step|row)(\d+)$/.exec(tag);
            if (dev)
                return Number(dev[1]);
        }
    }
    for (const m of unit.members) {
        const name = m.shape.name ?? "";
        const index = /^slot:index:(\d+)(?::|$)/i.exec(name);
        if (index)
            return Number(index[1]);
        if (!pairItems)
            continue;
        const item = /^slot:items:(\d+)(?::|$)/i.exec(name);
        if (item)
            return Number(item[1]);
    }
    return undefined;
}
/** 段落以 01 / 1. / 1）开头时的序号（0 起）。没有这种前缀则 undefined。 */
function leadingOrdinal(text) {
    const m = /^\s*0*(\d{1,2})(?:[.、)）]\s*|\s+|$)/.exec(text);
    if (!m?.[1])
        return undefined;
    const n = Number(m[1]);
    if (n < 1 || n > 30)
        return undefined;
    return n - 1;
}
function isTitleUnit(unit) {
    if (unit.lead.role != null && TITLE_BEAT_ROLES.has(unit.lead.role))
        return true;
    for (const m of unit.members) {
        const slot = slotOfName(m.shape.name ?? "") ?? "";
        if (/^(?:title|heading|headline|h1|display|hero)\b/.test(slot) && !/sub/.test(slot))
            return true;
    }
    return false;
}
function revealEvent(unit, beat, advance, para) {
    const box = unit.lead.shape.bbox;
    return {
        beat,
        advance,
        lead: unit.lead,
        followers: para ? [] : unitFollowers(unit),
        ...(para ? { para } : {}),
        rank: unit.lead.rank,
        y: box.y,
        x: box.x,
        ...(deviceIndex(unit) != null ? { device: deviceIndex(unit) } : {}),
    };
}
function expandTableUnits(units, bundle) {
    const out = [];
    for (const unit of units) {
        const table = unit.members.find((m) => m.shape.kind === "group" && m.shape.tableMeta)?.shape;
        if (!table || table.kind !== "group" || table.children.length === 0) {
            out.push(unit);
            continue;
        }
        const byRow = new Map();
        for (const child of table.children) {
            const match = /_r(\d+)c\d+$/.exec(child.id);
            const key = match ? Number(match[1]) : Math.round(child.bbox.y);
            const row = byRow.get(key) ?? [];
            row.push(child);
            byRow.set(key, row);
        }
        const rows = [...byRow.entries()].sort((a, b) => a[0] - b[0]);
        rows.forEach(([, cells], index) => {
            const members = cells.map((shape) => {
                const role = classifyShape(shape);
                return {
                    shape,
                    hint: resolveRoleHint(role, bundle),
                    rank: (role && ROLE_NARRATIVE_RANK[role]) ?? 30,
                    role,
                };
            });
            let lead = members.find((m) => m.hint);
            for (const m of members) {
                if (!m.hint)
                    continue;
                if (!lead || m.rank < lead.rank)
                    lead = m;
            }
            if (!lead) {
                lead = members[0];
                lead.hint = DECOR_FALLBACK_HINT;
                lead.rank = DECOR_FALLBACK_RANK;
            }
            out.push({
                members,
                lead,
                rank: lead.rank,
                rowIndex: index,
                ...(index === 0 ? { tableHeader: true } : {}),
            });
        });
    }
    return out;
}
function pointAdvance(cue, beat) {
    if (beat <= 0)
        return "click";
    return cue.pace?.[beat - 1] === "chain" ? "chain" : "click";
}
function textBeat(text, unit, cue, points) {
    const left = cue.leftLabel?.trim();
    const right = cue.rightLabel?.trim();
    if (left && normCue(text) === normCue(left))
        return { beat: 1, advance: pointAdvance(cue, 1) };
    if (right && normCue(text) === normCue(right)) {
        const beat = 1 + (cue.rightFrom ?? 0);
        return { beat, advance: pointAdvance(cue, beat) };
    }
    for (const extra of cue.withTitle ?? []) {
        if (cueScore(text, extra) >= 0.8)
            return { beat: 0, advance: "click" };
    }
    let bestI = -1;
    let best = 0;
    points.forEach((point, i) => {
        const s = cueScore(text, point);
        if (s > best) {
            best = s;
            bestI = i;
        }
    });
    const titleScore = cue.title ? cueScore(text, cue.title) : 0;
    // 标题角色永远第一拍。要点文本再像标题，也不能把标题拖到后面。
    if (isTitleUnit(unit))
        return { beat: 0, advance: "click" };
    if (titleScore >= 0.72 && titleScore >= best)
        return { beat: 0, advance: "click" };
    if (best >= 0.45 && bestI >= 0) {
        const beat = bestI + 1;
        return { beat, advance: pointAdvance(cue, beat) };
    }
    return "unmatched";
}
/**
 * 大纲出场：标题（眉标、副标题、页上主图）第一拍。没编号的卡片按要点书写顺序。
 * 带序号的一列和表格按序号从上到下，序号和对应正文同一拍。
 * 对不上的图和页脚接在后面。装饰不入场。要点的接法听 `pace`。
 */
function emitOutlineReveal(rawUnits, cue, bundle, slideW, slideH, opts) {
    const points = cue.points;
    const units = expandTableUnits(rawUnits, bundle);
    const pairItems = slideHasIndexSlots(units);
    const events = [];
    const images = [];
    const paraGroups = [];
    let placedTitle = false;
    for (const unit of units) {
        if (isBareDecor(unit))
            continue;
        if (FOOTER_BEAT_ROLES.has(unit.lead.role ?? "accent")) {
            events.push(revealEvent(unit, 900, "chain"));
            continue;
        }
        if (isImageUnit(unit)) {
            images.push(unit);
            continue;
        }
        // 表格按行号从上到下。单元格文字对上较早的要点时，不能把中间一行提前。
        if (unit.rowIndex != null) {
            const beat = unit.rowIndex;
            events.push(revealEvent(unit, beat, beat === 0 ? "click" : pointAdvance(cue, beat)));
            continue;
        }
        if (isTitleUnit(unit)) {
            events.push(revealEvent(unit, 0, "click"));
            placedTitle = true;
            continue;
        }
        const ordinal = numberedOrdinal(unit, pairItems);
        if (ordinal != null) {
            const beat = ordinal + 1;
            events.push(revealEvent(unit, beat, pointAdvance(cue, beat)));
            continue;
        }
        if (isChartUnit(unit)) {
            events.push(revealEvent(unit, 1, pointAdvance(cue, 1)));
            continue;
        }
        const spans = bulletSpans(unit, slideW, slideH);
        const paras = unit.lead.shape.kind === "text" ? (unit.lead.shape.paragraphs ?? []) : [];
        if (spans >= 2 && paras.length >= 2) {
            const texts = paras.map((p) => p.runs.map((r) => r.text ?? "").join(""));
            const ordinals = texts.map(leadingOrdinal);
            const byNumber = texts.every((text, i) => !text.trim() || ordinals[i] != null);
            const group = [];
            paras.forEach((p, st) => {
                const text = texts[st] ?? "";
                const assigned = byNumber
                    ? { beat: (ordinals[st] ?? st) + 1, advance: pointAdvance(cue, (ordinals[st] ?? st) + 1) }
                    : textBeat(text, unit, cue, points);
                const ev = revealEvent(unit, assigned === "unmatched" ? -1 : assigned.beat, assigned === "unmatched" ? "click" : assigned.advance, { st, end: st });
                if (assigned === "unmatched")
                    ev.unmatched = true;
                group.push(ev);
            });
            paraGroups.push({ events: group, followers: unitFollowers(unit) });
            events.push(...group);
            continue;
        }
        const assigned = textBeat(unitPlain(unit), unit, cue, points);
        const ev = revealEvent(unit, assigned === "unmatched" ? -1 : assigned.beat, assigned === "unmatched" ? "click" : assigned.advance);
        if (assigned === "unmatched")
            ev.unmatched = true;
        events.push(ev);
    }
    // 画布标题对不上大纲标题时，它会掉进「对不上」里，排到全部要点之后。
    // 没有标题角色时，把靠上的那一块文字留在第一拍。
    if (!placedTitle) {
        const tops = events.filter((e) => e.unmatched && !e.para && e.lead.shape.kind === "text" && e.y < slideH * 0.35);
        tops.sort((a, b) => a.y - b.y || a.x - b.x);
        const top = tops[0];
        if (top) {
            top.beat = 0;
            top.advance = "click";
            top.unmatched = false;
        }
    }
    const owned = new Set(events.filter((e) => !e.unmatched && e.beat >= 1 && e.beat <= points.length).map((e) => e.beat));
    const pending = events.filter((e) => e.unmatched);
    pending.sort((a, b) => {
        const da = a.device ?? 1e9;
        const db = b.device ?? 1e9;
        if (da !== db)
            return da - db;
        if (Math.abs(a.y - b.y) > 8)
            return a.y - b.y;
        return a.x - b.x;
    });
    let seq = 0;
    for (const e of pending) {
        if (e.device != null && e.device < points.length && !owned.has(e.device + 1)) {
            e.beat = e.device + 1;
            e.advance = pointAdvance(cue, e.beat);
            owned.add(e.beat);
        }
        else {
            e.beat = 500 + seq;
            seq += 1;
            e.advance = "click";
        }
        e.unmatched = false;
    }
    const sized = images
        .map((unit) => ({ unit, area: unionBox(unit.members).w * unionBox(unit.members).h }))
        .sort((a, b) => b.area - a.area);
    sized.forEach(({ unit }, i) => {
        events.push(i === 0 ? revealEvent(unit, 0, "click") : revealEvent(unit, 800 + i, "chain"));
    });
    for (const group of paraGroups) {
        group.events.sort((a, b) => a.beat - b.beat || (a.para?.st ?? 0) - (b.para?.st ?? 0));
        if (group.events[0])
            group.events[0].followers = group.followers;
    }
    events.sort((a, b) => a.beat - b.beat || a.rank - b.rank || a.y - b.y || a.x - b.x);
    const effects = [];
    const pace = bundle.paceMultiplier;
    const clickCap = opts.maxEffects;
    let clicks = 0;
    let lastBeat = Number.NaN;
    for (const e of events) {
        const count = 1 + e.followers.length;
        if (effects.length > 0 && effects.length + count > MAX_EFFECTS_PER_SLIDE)
            break;
        const hint = e.lead.hint ?? DECOR_FALLBACK_HINT;
        const effect = hint.effect;
        const durationMs = hint.durationMs !== undefined ? Math.round(hint.durationMs * pace) : undefined;
        const start = e.beat !== lastBeat;
        lastBeat = e.beat;
        const capped = clickCap !== undefined && clicks >= clickCap;
        let trigger = "onClick";
        let delay = 0;
        if (!start || capped) {
            trigger = "withPrevious";
        }
        else if (effects.length > 0 && e.advance === "chain") {
            trigger = "afterPrevious";
            delay = Math.round((hint.gapMs ?? 80) * pace);
        }
        else {
            delay = effects.length === 0 ? Math.round((opts.initialDelayMs ?? 0) * pace) : 0;
            clicks += 1;
        }
        const spec = { shapeId: e.lead.shape.id, effect, trigger, delayMs: delay };
        if (durationMs !== undefined)
            spec.durationMs = durationMs;
        if (e.para)
            spec.paraRange = e.para;
        effects.push(spec);
        for (const m of e.followers) {
            const follow = { shapeId: m.shape.id, effect, trigger: "withPrevious", delayMs: 0 };
            if (durationMs !== undefined)
                follow.durationMs = durationMs;
            effects.push(follow);
        }
    }
    return effects;
}
/** 单元内除 lead 外的成员。同一拍里同时出现，排序只为稳定。 */
function unitFollowers(unit) {
    return unit.members
        .filter((m) => m !== unit.lead)
        .sort((a, b) => {
        if (a.rank !== b.rank)
            return a.rank - b.rank;
        const dy = a.shape.bbox.y - b.shape.bbox.y;
        if (Math.abs(dy) > 8)
            return dy;
        return a.shape.bbox.x - b.shape.bbox.x;
    });
}
/**
 * 基于动画单元 + bundle 为一页计算 effect 列表。
 *
 * 单元内部：全部形状共用 lead 的效果，`withPrevious`、延迟 0，同一次入场。
 * 链路：页内第一拍 `onClick`，其余非并列项 `afterPrevious`（上一拍结束后间隔 gap）。
 * 扩散序列：连续的同一族 / 同一角色单元，以及不在底板里的多段列表，每一项 `onClick`。
 * 排序：叙事层级，同级再按从上到下、从左到右。group 只给组本身一条效果。
 */
function autoAnimateSlide(slide, opts = {}) {
    if (opts.enabled === false)
        return [];
    const clickCap = opts.maxEffects;
    const bundle = opts.bundle ?? getMotionBundle(opts.bundleId);
    const slideW = opts.slideSize?.width ?? 1280;
    const slideH = opts.slideSize?.height ?? 720;
    const units = groupIntoUnits(flattenShapes(slide), bundle, slideW, slideH);
    if (opts.reveal)
        return emitOutlineReveal(units, opts.reveal, bundle, slideW, slideH, opts);
    units.sort((a, b) => {
        if (a.rank !== b.rank)
            return a.rank - b.rank;
        const dy = a.lead.shape.bbox.y - b.lead.shape.bbox.y;
        if (Math.abs(dy) > 8)
            return dy;
        return a.lead.shape.bbox.x - b.lead.shape.bbox.x;
    });
    const keys = units.map(seriesKey);
    const series = new Set();
    for (let i = 0; i < units.length;) {
        let j = i + 1;
        while (j < units.length && keys[j] === keys[i])
            j++;
        if (j - i >= 2)
            for (let k = i; k < j; k++)
                series.add(k);
        i = j;
    }
    const effects = [];
    let clicks = 0;
    const pace = bundle.paceMultiplier;
    const push = (shapeId, effect, trigger, delayMs, durationMs, para) => {
        const spec = { shapeId, effect, trigger, delayMs };
        if (durationMs !== undefined)
            spec.durationMs = durationMs;
        if (para)
            spec.paraRange = para;
        effects.push(spec);
    };
    for (let i = 0; i < units.length; i++) {
        const unit = units[i];
        const followers = unitFollowers(unit);
        const spans = bulletSpans(unit, slideW, slideH);
        const count = spans + followers.length;
        if (effects.length > 0 && effects.length + count > MAX_EFFECTS_PER_SLIDE)
            break;
        const hint = unit.lead.hint;
        const effect = hint.effect;
        const durationMs = hint.durationMs !== undefined ? Math.round(hint.durationMs * pace) : undefined;
        if (spans >= 2) {
            for (let p = 0; p < spans; p++) {
                const capped = clickCap !== undefined && clicks >= clickCap;
                if (!capped)
                    clicks += 1;
                push(unit.lead.shape.id, effect, capped ? "withPrevious" : "onClick", 0, durationMs, { st: p, end: p });
                if (p === 0) {
                    for (const m of followers)
                        push(m.shape.id, effect, "withPrevious", 0, durationMs);
                }
            }
            continue;
        }
        const wantClick = i === 0 || series.has(i);
        const capped = wantClick && clickCap !== undefined && clicks >= clickCap;
        let trigger = "afterPrevious";
        let delay = Math.round((hint.gapMs ?? 80) * pace);
        if (capped) {
            trigger = "withPrevious";
            delay = 0;
        }
        else if (wantClick) {
            trigger = "onClick";
            delay = i === 0 ? Math.round((opts.initialDelayMs ?? 0) * pace) : 0;
            clicks += 1;
        }
        push(unit.lead.shape.id, effect, trigger, delay, durationMs);
        for (const m of followers)
            push(m.shape.id, effect, "withPrevious", 0, durationMs);
    }
    return effects;
}
/**
 * 把 bundle 的 slide-to-slide 过渡（如果有）写入 slide.transition。
 * 没有 transition 的 bundle 会显式清掉旧 transition（保证多次切 bundle 时不残留）。
 */
function applyBundleTransitionToSlide(slide, bundle) {
    if (bundle.slideTransition) {
        slide.transition = {
            ...bundle.slideTransition,
            ...(bundle.slideTransition.params ? { params: { ...bundle.slideTransition.params } } : {}),
        };
    }
    else {
        delete slide.transition;
    }
}
/**
 * 整篇 Presentation 应用 auto-animate（in-place 修改）。
 *
 * 调用方：generate.ts 在 compile 后调用。也可作为 EditCommand 的实现细节。
 */
function autoAnimatePresentation(pres, opts = {}) {
    const bundle = opts.bundle ?? getMotionBundle(opts.bundleId ?? resolveBundleForPresentation(pres));
    const slideSize = opts.slideSize ?? pres.size;
    const optsWithBundle = {
        ...opts,
        bundle,
        ...(slideSize ? { slideSize } : {}),
    };
    const applyTransitions = opts.applySlideTransition !== false;
    const perSlide = [];
    let total = 0;
    for (let index = 0; index < pres.slides.length; index++) {
        const slide = pres.slides[index];
        const reveal = opts.revealForSlide ? opts.revealForSlide(index) : opts.reveal;
        const effects = autoAnimateSlide(slide, { ...optsWithBundle, ...(reveal ? { reveal } : {}) });
        applyAnimationsToSlide(slide, effects);
        if (applyTransitions)
            applyBundleTransitionToSlide(slide, bundle);
        perSlide.push(effects.length);
        total += effects.length;
    }
    return { total, perSlide, bundleId: bundle.id, bundleName: bundle.name };
}
// ============================================================================
// Phase B — AI-generated MotionScheme
//
// LLM 直接产出 MotionSchemeSpec（基于一个内置 bundle 之上做角色覆盖 + 节奏 + 页
// 间过渡），通过 `synthesizeBundleFromMotionScheme` 合成 MotionBundle，再走与
// 内置 bundle 完全相同的应用路径（autoAnimatePresentation / ApplyAutoAnimationsCmd）。
//
// 设计取舍：
//   1. LLM 只能"覆盖"少数最有视觉影响力的角色（cover-title / page-title / bullets
//      / image / quote-text / closing-title 等），其余角色继承 basedOn bundle。
//      理由：弱模型在大 schema 上易漏字段；缩小可配置面也避免"装饰过载"。
//   2. 颜色 / 字体不在这里 —— 那是 GeneratedThemeSpec 的职责。Motion 只管运动。
//   3. 与 theme 联动：调用方（generateAndApplyTheme / generation flow）可以把
//      theme 摘要透传给 motion prompt，使 motion 风格"知道" theme 的调性。
// ============================================================================
const MOTION_SCHEME_TRANSITION_KINDS = [
    "cut",
    "fade",
    "push",
    "cover",
    "uncover",
    "wipe",
    "split",
    "zoom",
    "morph",
    "cube",
    "flip",
    "pageCurl",
    "doors",
    "circle",
    "ripple",
];
const RoleHintSchema = zod_1.z.object({
    effect: zod_1.z.enum(exports.MAINSTREAM_EFFECT_LIST),
    durationMs: zod_1.z.number().int().min(100).max(900).optional(),
    gapMs: zod_1.z.number().int().min(0).max(1000).optional(),
});
/** AI 可配置的角色子集 —— 只挑视觉影响最大的，覆盖大多数主流 deck。 */
exports.MOTION_SCHEME_CONFIGURABLE_ROLES = [
    "cover-title",
    "cover-subtitle",
    "section-title",
    "page-title",
    "bullets",
    "body",
    "quote-text",
    "image",
    "chart",
    "stat-value",
    "closing-title",
];
exports.MotionSchemeSpecSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).describe("Creative scheme name (e.g. 'Aurora Glide', '墨痕'). Language follows user."),
    description: zod_1.z.string().describe("One-line vibe summary in user's language."),
    basedOn: zod_1.z
        .enum(exports.MOTION_BUNDLE_IDS)
        .describe("Start from one of the 4 built-in bundles; rolesOverride patches on top."),
    paceMultiplier: zod_1.z
        .number()
        .min(0.6)
        .max(1.5)
        .describe("Global rhythm tweak. 1.0 = baseline; >1 slower/dramatic; <1 snappier."),
    rolesOverride: zod_1.z
        .object({
        "cover-title": RoleHintSchema.optional(),
        "cover-subtitle": RoleHintSchema.optional(),
        "section-title": RoleHintSchema.optional(),
        "page-title": RoleHintSchema.optional(),
        bullets: RoleHintSchema.optional(),
        body: RoleHintSchema.optional(),
        "quote-text": RoleHintSchema.optional(),
        image: RoleHintSchema.optional(),
        chart: RoleHintSchema.optional(),
        "stat-value": RoleHintSchema.optional(),
        "closing-title": RoleHintSchema.optional(),
    })
        .describe("Per-role override. ONLY include roles you want different from the basedOn bundle. Empty {} = pure basedOn."),
    slideTransition: zod_1.z
        .object({
        kind: zod_1.z
            .enum(MOTION_SCHEME_TRANSITION_KINDS)
            .describe("Slide-to-slide transition kind. Use `cut` for no transition."),
        durationSec: zod_1.z.number().min(0).max(2).describe("Duration in seconds (typical 0.3-0.8)."),
    })
        .describe("Slide-to-slide transition for the whole deck."),
});
/**
 * 把 AI 输出的 MotionSchemeSpec 合成一个 MotionBundle：
 *   - basedOn 提供角色基线；rolesOverride 在其上 patch；
 *   - paceMultiplier 替换 basedOn 的 paceMultiplier；
 *   - slideTransition.kind === "cut" 等价于"无过渡"（写 undefined，让 player 走 cut）。
 *
 * 合成 bundle 的 id 形如 `ai_motion_<stamp>`，与内置 id 不冲突；`isBuiltInMotionBundleId`
 * 可用于区分。
 */
function synthesizeBundleFromMotionScheme(spec) {
    const base = exports.MOTION_BUNDLES[spec.basedOn];
    const rolesOverride = { ...base.rolesOverride };
    for (const key of Object.keys(spec.rolesOverride)) {
        const hint = spec.rolesOverride[key];
        if (hint)
            rolesOverride[key] = hint;
    }
    const bundle = {
        id: `ai_motion_${Date.now().toString(36)}`,
        name: spec.name,
        description: spec.description,
        rolesOverride,
        paceMultiplier: spec.paceMultiplier,
    };
    if (spec.slideTransition.kind !== "cut" && spec.slideTransition.durationSec > 0) {
        bundle.slideTransition = {
            kind: spec.slideTransition.kind,
            duration: spec.slideTransition.durationSec,
        };
    }
    return bundle;
}
/**
 * 给"主流审美"配套的简短指南。注入到 AI prompt 中，让 LLM 在调用 addAnimation
 * tool 时遵循这些原则。
 *
 * 摘自 .shared/ui-ux-pro-max/data/ux-guidelines.csv "Animation" + "Accessibility"
 * 章节，已浓缩为可读 prompt。
 */
exports.MAINSTREAM_ANIMATION_GUIDELINES = [
    "Animation aesthetic (mainstream UI/UX, distilled from ui-ux-pro-max guidelines):",
    "- Restraint: animate at most 2–3 elements per slide; avoid bouncy / spiral / decorative motion.",
    "- Duration: 250–500ms per effect (snappy, not sluggish).",
    "- Easing: ease-out for entrances (presets already use easeOutCubic/easeOutQuad).",
    "- Hierarchy: title first, then body / bullets, then images / supporting visuals.",
    "- Trigger flow: chain consecutive effects with `afterPrevious` so one click reveals the whole slide.",
    "- Preferred effects (in order of how mainstream they feel): fade-up, fade, float-up, zoom-soft, zoom, glide, wipe, fade-down, appear.",
    "- Skip animations entirely on backgrounds and decorative accents.",
    "",
    "Motion bundles (pick one based on the deck's design language; pass `style` to applyMainstreamAnimations):",
    "- `minimal`   → SaaS / business / technical decks. Restrained, no slide transitions.",
    "- `cinematic` → dark / launch keynote / hero-driven decks. Slower, dramatic, fade between slides.",
    "- `editorial` → magazine / academic / serif decks. Snappy, refined, subtle fade transition.",
    "- `playful`   → creative / brand / consumer decks. Energetic, push transition between slides.",
    "When omitted, the bundle is auto-inferred from the current theme (dark → cinematic, academic → editorial, creative → playful, business/minimal → minimal).",
].join("\n");
