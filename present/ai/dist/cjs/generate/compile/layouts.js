"use strict";
// Layout 引擎 v2：把 SlideSpec（语义层）翻译成 Shape[]（IR 层）。
//
// ## v2 构图语言（相对 v1 的全面重设计）
//
//   1. **种子化构图变体**：每种 layout 有 2-3 套构图（左对齐编辑部式 / 居中舞台式 /
//      色带分割式…），由 renderLayout 的 seed 决定性选择。同一 deck 内相同 layout
//      共享变体（保持整册一致），不同次生成 seed 不同 → 视觉构图可见地变化。
//   2. **动态型号系统**：display 级大字（封面 / hero / stat）按文字长度 CJK 感知
//      自动缩放（fitFont），敢放大 —— 短标题可以到 1.4× 主题字号，长标题自动收敛，
//      永不溢出。正文行高 1.5+，阅读版心收窄（68%-78%），拒绝"满宽小字墙"。
//   3. **幽灵字底纹**：章节序号 / 议程序号用超大低透明度数字压在内容之下
//      （shape.opacity 0.10-0.16，颜色仍是全值 hex —— QA 对比度修复按 hex 判定，
//      不会误翻色）。
//   4. **克制的强调语言**：kicker（全大写 + letterSpacing 小字）、发丝线（1-2px
//      divider）、accent 短杆 / 顶杆 / 下划杆。accent 只出现在一个焦点上。
//
// ## 不变的硬契约（改这里前先读）
//
//   - spec 接口 / SlideSpec 联合 / LAYOUT_KINDS 与 schema.OUTLINE_LAYOUT_HINTS
//     逐项一致（prompt / zod / compile 共用词表，文件尾部有编译期断言）。
//   - shape.name 是动画角色识别（animations.ts ROLE_CLASSIFIERS）、图片补全
//     （enrich：`Image placeholder` / `Image hint` / `Image`）、QA（`BG overlay`）
//     的依据 —— 命名一律沿用 v1 词表，新增装饰名不得撞上述词。
//   - 全屏底色永远走 LayoutResult.background，绝不 push 全屏 rect 进 shapes
//     （见 .cursor/rules/ppt-design-rules.mdc §2）。
//   - 装饰性文字（幽灵数字等）必须在画布内（QA 出血修复会把出界文字拉回）。
Object.defineProperty(exports, "__esModule", { value: true });
exports.LAYOUT_KINDS = void 0;
exports.buildMotifShapes = buildMotifShapes;
exports.renderLayout = renderLayout;
const core_1 = require("@sliiu/present-core");
const schema_1 = require("../schema");
const color_1 = require("../qa/color");
// ============================================================================
// 基础构件
// ============================================================================
let _idCounter = 0;
function nextId(prefix) {
    _idCounter += 1;
    return `${prefix}_${Date.now().toString(36)}_${_idCounter.toString(36)}`;
}
function solid(color, alpha) {
    return alpha === undefined ? { kind: "solid", color } : { kind: "solid", color, alpha };
}
function linear(angle, stops) {
    return { kind: "linear", angle, stops };
}
function baseFields() {
    return {
        zIndex: 0,
        visible: true,
        locked: false,
        opacity: 1,
        transform: (0, core_1.identityTransform)(),
        name: "Shape",
    };
}
function makeParagraph(text, opts = {}) {
    const run = { text };
    if (opts.fontFamily)
        run.fontFamily = opts.fontFamily;
    if (opts.fontSize !== undefined)
        run.fontSize = opts.fontSize;
    if (opts.fontWeight !== undefined)
        run.fontWeight = opts.fontWeight;
    if (opts.color)
        run.color = opts.color;
    if (opts.italic)
        run.italic = true;
    if (opts.kicker) {
        run.caps = "all";
        run.letterSpacing = opts.letterSpacing ?? 2.5;
    }
    else if (opts.letterSpacing !== undefined) {
        run.letterSpacing = opts.letterSpacing;
    }
    const p = { runs: [run] };
    if (opts.align)
        p.align = opts.align;
    if (opts.lineHeight !== undefined)
        p.lineHeight = opts.lineHeight;
    if (opts.bullet) {
        p.bullet = { kind: "char", char: "•", color: opts.bulletColor ?? opts.color };
        p.marginLeft = 26;
        p.indent = -26;
    }
    return p;
}
function makeText(bbox, paragraphs, opts = {}) {
    const t = {
        ...baseFields(),
        id: nextId("sp_text"),
        kind: "text",
        name: opts.name ?? "Text",
        bbox,
        paragraphs,
        vAlign: opts.vAlign ?? "top",
        wrap: opts.wrap ?? true,
    };
    if (opts.opacity !== undefined)
        t.opacity = opts.opacity;
    return t;
}
function makeRect(bbox, fill, opts = {}) {
    const out = {
        ...baseFields(),
        id: nextId("sp_rect"),
        kind: "rect",
        name: opts.name ?? "Rect",
        bbox,
    };
    if (fill)
        out.fill = fill;
    if (opts.rx !== undefined)
        out.rx = opts.rx;
    if (opts.ry !== undefined)
        out.ry = opts.ry;
    if (opts.opacity !== undefined)
        out.opacity = opts.opacity;
    return out;
}
function makeEllipse(bbox, fill, opts = {}) {
    const out = {
        ...baseFields(),
        id: nextId("sp_ellipse"),
        kind: "ellipse",
        name: opts.name ?? "Ellipse",
        bbox,
    };
    if (fill)
        out.fill = fill;
    if (opts.opacity !== undefined)
        out.opacity = opts.opacity;
    return out;
}
function makeImage(bbox, src, opts = {}) {
    return {
        ...baseFields(),
        id: nextId("sp_img"),
        kind: "image",
        name: opts.name ?? "Image",
        bbox,
        src,
    };
}
/**
 * 给 `shapes` 中从下标 `from` 起的这一段打同一个动画单元标记。
 *
 * auto-animate 据此把它们作为一个整体入场（底板 / 色条 / 标题 / 正文同时浮现），
 * 而不是各自排队 —— 否则观感就是"空卡片先摆好，文字再一个个飞进来"。
 * 单元语义见 packages/ai/src/animations.ts 的 AnimUnit 一节。
 *
 * 用"记录下标 → 批量打标"而不是给每个 make* 调用加参数：版式函数里一个单元往往由
 * 五六次 push 组成，逐个传参既啰嗦又容易漏。
 */
function tagUnit(shapes, from, unit) {
    for (let i = from; i < shapes.length; i++)
        shapes[i].animUnit = unit;
}
/** 同上，但按 name 匹配 —— 用于装饰 push 点分散在多个 variant 分支里的版式。 */
function tagUnitByName(shapes, names, unit) {
    for (const s of shapes) {
        if (names.test((s.name ?? "").trim()))
            s.animUnit = unit;
    }
}
// ============================================================================
// 种子化随机 + 文字度量
// ============================================================================
/** mulberry32 —— 快速确定性 PRNG（seed → [0,1) 序列）。 */
function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function pick(rng, items) {
    return items[Math.floor(rng() * items.length)] ?? items[0];
}
// ---- 亮度感知墨色 ----
// 设计层直接按背景亮度选文字色，而不是固定白字/accent 再让 QA 兜底翻色
// （QA 翻色会破坏层级：subtitle/footer 全变成同一个高对比色）。
/** 主题底色是否为深色（封面/hero 的渐变主导色即 palette.bg）。 */
function isDarkBg(theme) {
    const rgb = (0, color_1.parseHex)(theme.palette.bg);
    return rgb ? (0, color_1.relativeLuminance)(rgb) < 0.45 : false;
}
/**
 * 在 bgHex 上想用 preferred（一般是 accent）——对比度达标就用，否则退回
 * 主题正文色（保证可读且不被 QA 改写）。min：大字 3、小字 4.5。
 */
function inkOn(bgHex, preferred, fallback, min = 3) {
    const bg = (0, color_1.parseHex)(bgHex);
    const fg = (0, color_1.parseHex)(preferred);
    if (!bg || !fg)
        return preferred;
    return (0, color_1.contrastRatio)(fg, bg) >= min ? preferred : fallback;
}
/** 次级文字（caption/detail/label）的muted色：主题 textMuted 不达标时退回正文色。 */
function mutedOn(theme, surfaceHex) {
    return inkOn(surfaceHex, theme.palette.textMuted, theme.palette.text, 4.5);
}
/** 封面 / hero / closing 的墨色组（随主题明暗切换，透明层级用 shape opacity 表达）。 */
function heroInk(theme) {
    if (isDarkBg(theme))
        return { title: "#ffffff", sub: "#ffffff", subOpacity: 0.84, metaOpacity: 0.68 };
    return { title: theme.palette.text, sub: mutedOn(theme, theme.palette.bg), subOpacity: 1, metaOpacity: 0.9 };
}
/**
 * CJK 感知的文字宽度估算（px）：全角字符按 1.0em、半角按 0.56em。
 * 只用于"选字号"这种容差型决策，不追求排版级精度。
 */
function estTextWidth(text, fontSize) {
    let units = 0;
    for (const ch of text) {
        const code = ch.codePointAt(0) ?? 0;
        units += code >= 0x2e80 ? 1.0 : 0.56;
    }
    return units * fontSize;
}
/**
 * display 级字号自适应：从 base 开始收缩，直到 maxLines 行内放得下。
 * 短标题保持大字冲击力，长标题自动收敛。
 */
function fitFont(text, base, maxW, opts = {}) {
    const minScale = opts.minScale ?? 0.62;
    const maxLines = opts.maxLines ?? 2;
    let size = base;
    const floor = base * minScale;
    while (size > floor) {
        const lines = Math.ceil(estTextWidth(text, size) / Math.max(1, maxW));
        if (lines <= maxLines)
            return size;
        size -= 2;
    }
    return floor;
}
/** 实际换行行数（与 fitFont 同一估宽模型）。 */
function estLines(text, fontSize, maxW) {
    return Math.max(1, Math.ceil(estTextWidth(text, fontSize) / Math.max(1, maxW)));
}
/**
 * display 块度量：fitFont 选字号后按**实际行数**（floor 命中时可能超过 maxLines）
 * 计算块高。所有「标题下面还要放东西」的版式必须用它拿实高来堆叠，
 * 严禁再假设 1 行 / 2 行 —— 长中文标题在 floor 字号下经常 2-3 行。
 */
function fitBlock(text, base, maxW, opts = {}) {
    const lh = opts.lineHeight ?? 1.18;
    let size = fitFont(text, base, maxW, opts);
    let lines = estLines(text, size, maxW);
    // 超长文本在 minScale floor 下行数可能失控（4-5 行）：有 maxH 约束时继续
    // 降字号（绝对下限 base×0.4），把块高压回可用空间，保证下游堆叠不越界。
    if (opts.maxH !== undefined) {
        const absFloor = base * 0.4;
        while (lines * size * lh > opts.maxH && size - 2 >= absFloor) {
            size -= 2;
            lines = estLines(text, size, maxW);
        }
    }
    return { size, lines, height: Math.ceil(lines * size * lh) };
}
/** 一段普通文本（副标题 / caption / message）的估算高度。 */
function paraBlockH(text, fontSize, maxW, lineHeight = 1.45) {
    return Math.ceil(estLines(text, fontSize, maxW) * fontSize * lineHeight);
}
/**
 * 列表按可用高度收缩：字号从 base 逐步降到 base×0.82、行高降到 1.35，
 * 直到估算总高放得下（两者都到底仍放不下就接受溢出兜底值 —— QA 只会更差）。
 */
function fitBulletList(bullets, maxW, maxH, base, baseLineHeight, paraGap = 0.35) {
    let size = base;
    let lh = baseLineHeight;
    const total = (s, l) => bullets.reduce((acc, b) => acc + estLines(b, s, maxW) * s * l + s * paraGap, 0);
    while (total(size, lh) > maxH && (size > base * 0.82 || lh > 1.35)) {
        if (size > base * 0.82)
            size -= 1;
        else
            lh = Math.max(1.35, lh - 0.05);
    }
    return { size, lineHeight: lh };
}
// 安全区（theme.metrics.marginX/Y 驱动）。
function safeArea(size, theme) {
    const mx = size.width * theme.metrics.marginX;
    const my = size.height * theme.metrics.marginY;
    return { x: mx, y: my, w: size.width - 2 * mx, h: size.height - 2 * my };
}
function resolveTuning(theme) {
    switch (theme.layout) {
        case "centered":
            return { id: "centered", align: "middle", coverAnchor: "mid", showRule: true, thickTitleRule: false, twoColRatio: 0.5, contentInset: 0, centerBody: true };
        case "editorial":
            return { id: "editorial", align: "start", coverAnchor: "bottom", showRule: false, thickTitleRule: true, twoColRatio: 0.62, contentInset: 0.02 };
        case "terminal":
            return { id: "terminal", align: "start", coverAnchor: "mid", showRule: false, thickTitleRule: false, twoColRatio: 0.5, contentInset: 0, prompt: "$ " };
        case "classic":
        default:
            return { id: "classic", align: "start", coverAnchor: "mid", showRule: true, thickTitleRule: false, twoColRatio: 0.5, contentInset: 0 };
    }
}
function tunedArea(area, tune) {
    if (!tune.contentInset)
        return area;
    const dx = area.w * tune.contentInset;
    return { x: area.x + dx, y: area.y, w: area.w - 2 * dx, h: area.h };
}
function resolveStyleView(style, theme, tune) {
    if (!style) {
        return {
            fromAi: false,
            marginX: theme.metrics.marginX,
            marginY: theme.metrics.marginY,
            gutter: 24,
            displayScale: 1,
            titleAlign: tune.align,
            titleWeight: 800,
            bodyLineHeight: Math.max(theme.metrics.bulletLineHeight, 1.5),
            bodyMeasure: null,
            coverAnchor: null,
            sectionStyle: null,
            heroAnchor: null,
            titleAccent: null,
            panelStyle: "soft",
            panelRadius: 14,
            dividerStyle: "hairline",
            ghostGlyphs: true,
            firstBulletEmphasis: true,
            edgeBand: "none",
            pageNumber: false,
        };
    }
    return {
        fromAi: true,
        marginX: style.grid.marginX,
        marginY: style.grid.marginY,
        gutter: style.grid.gutter,
        displayScale: style.typography.displayScale,
        titleAlign: style.typography.titleAlign,
        titleWeight: style.typography.titleWeight,
        bodyLineHeight: style.typography.bodyLineHeight,
        bodyMeasure: style.typography.bodyMeasure,
        coverAnchor: style.composition.coverAnchor,
        sectionStyle: style.composition.sectionStyle,
        heroAnchor: style.composition.heroAnchor,
        titleAccent: style.composition.titleAccent,
        panelStyle: style.composition.panelStyle,
        panelRadius: style.composition.panelRadius,
        dividerStyle: style.composition.dividerStyle,
        ghostGlyphs: style.composition.ghostGlyphs,
        firstBulletEmphasis: style.composition.firstBulletEmphasis,
        edgeBand: style.motifs.edgeBand,
        pageNumber: style.motifs.pageNumber,
    };
}
/** 面板质感：soft=圆角软卡，flat=方角实卡，open=无底（配 accent 顶线）。 */
function panelSurface(ctx, box, accent, name) {
    const { theme } = ctx;
    const sv = ctx.sv;
    if (sv.panelStyle === "open") {
        return [
            makeRect({ x: box.x, y: box.y, w: box.w, h: 3 }, solid(accent), { rx: 1, ry: 1, name: `${name} accent` }),
        ];
    }
    const radius = sv.panelStyle === "flat" ? Math.min(4, sv.panelRadius) : sv.panelRadius;
    return [makeRect(box, solid(theme.palette.bgAlt), { rx: radius, ry: radius, name })];
}
// ============================================================================
// 公共积木
// ============================================================================
/** 幽灵大字（序号 / 引号）：全值色 + shape 级低透明度；QA 按 hex 判色不会误翻。 */
function ghostGlyph(ctx, glyph, box, opts = {}) {
    return makeText(box, [
        makeParagraph(glyph, {
            fontFamily: ctx.theme.fonts.title,
            fontSize: Math.min(box.h * 0.92, box.w * 1.6),
            fontWeight: 800,
            color: ctx.theme.palette.accent1,
            align: opts.align ?? "end",
            lineHeight: 1,
        }),
    ], { name: opts.name ?? "Ghost index", vAlign: "middle", wrap: false, opacity: 0.13 });
}
/** kicker 小字（全大写 + letterSpacing + accent）。 */
function kickerText(ctx, text, box, opts = {}) {
    const surface = opts.on ?? ctx.theme.palette.bg;
    const preferred = opts.color ?? ctx.theme.palette.accent1;
    return makeText(box, [
        makeParagraph(text, {
            fontFamily: ctx.theme.fonts.body,
            fontSize: ctx.theme.fontSizes.small,
            fontWeight: 700,
            color: inkOn(surface, preferred, ctx.theme.palette.text, 4.5),
            align: opts.align ?? "start",
            kicker: true,
        }),
    ], { name: opts.name ?? "Kicker", vAlign: "middle" });
}
/** 发丝线。 */
function hairline(ctx, box, opts = {}) {
    return makeRect(box, solid(opts.color ?? ctx.theme.palette.divider), {
        name: opts.name ?? "Title rule",
        ...(opts.opacity !== undefined ? { opacity: opts.opacity } : {}),
    });
}
/**
 * 封面 / 章节 / 结束页的电影感渐变底。enrich 抓到图时会用 ImagePaint 覆盖。
 * v2：变体化角度 + accent2 微混入，避免所有 deck 封面都一个走向。
 */
function cinematicBackground(ctx, role) {
    const { theme, rng } = ctx;
    if (role === "section") {
        if (theme.backgroundPaint)
            return theme.backgroundPaint;
        return linear(pick(rng, [110, 135, 160]), [
            { offset: 0, color: theme.palette.bgAlt },
            { offset: 1, color: theme.palette.bg },
        ]);
    }
    if (role === "hero") {
        return linear(pick(rng, [130, 145, 200]), [
            { offset: 0, color: theme.palette.accent1 },
            { offset: 0.38, color: theme.palette.bg },
            { offset: 0.85, color: theme.palette.bg },
            { offset: 1, color: theme.palette.accent2, alpha: 0.35 },
        ]);
    }
    // cover / closing：accent 起势 → 深底收束，保证亮字落在暗区可读。
    const angle = role === "closing" ? pick(rng, [200, 215, 240]) : pick(rng, [125, 145, 160]);
    return linear(angle, [
        { offset: 0, color: theme.palette.accent1 },
        { offset: 0.42, color: theme.palette.bg },
        { offset: 1, color: theme.palette.bg },
    ]);
}
// ---- 内容页标题块 v2 ----
// 产出 kicker/报头/提示符等家族装饰 + "Page title"，返回正文起始 y。
function buildPageTitle(ctx, title) {
    const { theme, tune, area, sv } = ctx;
    const shapes = [];
    let titleY = area.y;
    // 标题装饰：AI 风格显式指定（sv.titleAccent）优先；否则按主题家族 tuning。
    const accentMode = sv.titleAccent ?? (tune.thickTitleRule ? "masthead" : tune.prompt ? "prompt" : tune.id === "classic" ? "dot" : "underline");
    if (accentMode === "masthead") {
        shapes.push(makeRect({ x: area.x, y: area.y, w: area.w, h: 5 }, solid(theme.palette.accent1), { name: "Masthead rule" }));
        titleY = area.y + 5 + 14;
    }
    let titleX = area.x;
    let titleW = area.w;
    if (accentMode === "dot")
        titleW = area.w - 24;
    // 用最终渲染宽度度量，块高按实际行数（长中文标题 floor 后常 2 行）。
    const block = fitBlock(title, theme.fontSizes.pageTitle, titleW * 0.98, { maxLines: 2, minScale: 0.72, lineHeight: 1.28 });
    const fitted = block.size;
    const titleH = block.height + fitted * 0.12;
    if (accentMode === "dot") {
        // accent 方点 + 标题（点比条更轻，focus 交给标题本身）。
        shapes.push(makeRect({ x: area.x, y: titleY + fitted * 0.28, w: 10, h: 10 }, solid(theme.palette.accent1), { name: "Accent bar" }));
        titleX = area.x + 24;
    }
    const align = tune.align === "middle" ? "middle" : "start";
    let titlePara;
    if (accentMode === "prompt") {
        const p = tune.prompt ?? "$ ";
        titlePara = {
            runs: [
                { text: p, fontFamily: theme.fonts.mono ?? theme.fonts.title, fontSize: fitted, fontWeight: 700, color: theme.palette.accent1 },
                { text: title, fontFamily: theme.fonts.title, fontSize: fitted, fontWeight: sv.titleWeight, color: theme.palette.text },
            ],
            align,
        };
    }
    else {
        titlePara = makeParagraph(title, {
            fontFamily: theme.fonts.title,
            fontSize: fitted,
            fontWeight: sv.titleWeight,
            color: theme.palette.text,
            align,
        });
    }
    shapes.push(makeText({ x: titleX, y: titleY, w: titleW, h: titleH }, [titlePara], { name: "Page title" }));
    let bodyY = titleY + titleH + theme.metrics.titleBodyGap;
    if (accentMode === "underline") {
        // 短 accent 下划杆（不整宽灰线）—— 标题重心更聚焦。
        const ruleY = titleY + titleH + 4;
        const ruleW = tune.align === "middle" ? area.w * 0.12 : Math.min(72, area.w * 0.1);
        const ruleX = tune.align === "middle" ? area.x + (area.w - ruleW) / 2 : titleX;
        shapes.push(makeRect({ x: ruleX, y: ruleY, w: ruleW, h: 3 }, solid(ctx.theme.palette.accent1), { name: "Title rule" }));
        bodyY = ruleY + 3 + theme.metrics.titleBodyGap;
    }
    // 报头线 / accent 方点 / 下划杆都是标题的一部分，跟标题同一拍入场。
    tagUnit(shapes, 0, "title");
    return { shapes, bodyY };
}
function layoutCover(spec, ctx) {
    const { size, theme, tune, area } = ctx;
    const shapes = [];
    const variant = ctx.sv.coverAnchor
        ? { "bottom-left": "editorial", center: "stage", "band-right": "band" }[ctx.sv.coverAnchor]
        : tune.coverAnchor === "bottom"
            ? "editorial"
            : tune.align === "middle"
                ? "stage"
                : pick(ctx.rng, ["editorial", "stage", "band"]);
    const meta = [spec.author, spec.date].filter(Boolean).join("  ·  ");
    const ink = heroInk(theme);
    const dark = isDarkBg(theme);
    const titleMaxW = area.w * (variant === "band" ? 0.78 : 0.92);
    const block = fitBlock(spec.title, theme.fontSizes.coverTitle * 1.25 * ctx.sv.displayScale, titleMaxW, {
        maxLines: 2,
        minScale: 0.55,
        lineHeight: 1.15,
        maxH: size.height * 0.52,
    });
    const display = block.size;
    if (variant === "editorial") {
        // 顶部 meta 行（作者·日期上移做报头）＋底沉大标题＋accent 下划杆。
        if (meta) {
            shapes.push(makeText({ x: area.x, y: area.y, w: area.w, h: theme.fontSizes.small * 1.8 }, [
                makeParagraph(meta, {
                    fontFamily: theme.fonts.body,
                    fontSize: theme.fontSizes.small,
                    color: ink.sub,
                    kicker: true,
                    letterSpacing: 2,
                }),
            ], { name: "Cover footer", opacity: ink.metaOpacity }));
            shapes.push(hairline(ctx, { x: area.x, y: area.y + theme.fontSizes.small * 2.1, w: area.w, h: 1 }, { color: dark ? "#ffffff" : theme.palette.divider, opacity: dark ? 0.25 : 1, name: "Masthead rule" }));
        }
        // 底沉标题块：全部按实测高度自底向上堆叠，标题 floor 后 2-3 行也不越界。
        const titleH = block.height;
        const subH = spec.subtitle ? paraBlockH(spec.subtitle, theme.fontSizes.coverSubtitle, area.w * 0.85) : 0;
        const bottom = size.height * 0.9;
        const titleY = Math.max(area.y + theme.fontSizes.small * 3, bottom - subH - (subH ? 10 : 0) - titleH);
        shapes.push(makeRect({ x: area.x, y: titleY - 16, w: 64, h: 5 }, solid(theme.palette.accent2), { name: "Cover accent" }));
        shapes.push(makeText({ x: area.x, y: titleY, w: area.w, h: titleH }, [makeParagraph(spec.title, { fontFamily: theme.fonts.title, fontSize: display, fontWeight: 800, color: ink.title, lineHeight: 1.12 })], { name: "Cover title", vAlign: "bottom" }));
        if (spec.subtitle) {
            shapes.push(makeText({ x: area.x, y: titleY + titleH + 10, w: area.w * 0.85, h: subH }, [makeParagraph(spec.subtitle, { fontFamily: theme.fonts.body, fontSize: theme.fontSizes.coverSubtitle, color: ink.sub, lineHeight: 1.4 })], { name: "Cover subtitle", opacity: ink.subOpacity }));
        }
    }
    else if (variant === "stage") {
        // 居中舞台：按实测块高整体垂直居中（略偏上），杆-标题-副标题依次实高堆叠。
        const subH = spec.subtitle ? paraBlockH(spec.subtitle, theme.fontSizes.coverSubtitle, size.width * 0.72) : 0;
        const total = block.height + (subH ? subH + 18 : 0);
        const top = Math.max(area.y + 40, (size.height - total) * 0.44);
        const ruleW = 46;
        shapes.push(hairline(ctx, { x: size.width / 2 - ruleW - 14, y: top - 34, w: ruleW, h: 2 }, { color: theme.palette.accent2, name: "Cover accent" }));
        shapes.push(hairline(ctx, { x: size.width / 2 + 14, y: top - 34, w: ruleW, h: 2 }, { color: theme.palette.accent2, name: "Masthead rule" }));
        shapes.push(makeText({ x: size.width * 0.06, y: top, w: size.width * 0.88, h: block.height }, [makeParagraph(spec.title, { fontFamily: theme.fonts.title, fontSize: display, fontWeight: 800, color: ink.title, align: "middle", lineHeight: 1.15 })], { name: "Cover title" }));
        if (spec.subtitle) {
            shapes.push(makeText({ x: size.width * 0.14, y: top + block.height + 18, w: size.width * 0.72, h: subH }, [makeParagraph(spec.subtitle, { fontFamily: theme.fonts.body, fontSize: theme.fontSizes.coverSubtitle, color: ink.sub, align: "middle", lineHeight: 1.4 })], { name: "Cover subtitle", opacity: ink.subOpacity }));
        }
        if (meta) {
            shapes.push(makeText({ x: 0, y: size.height - area.y - theme.fontSizes.small * 1.6, w: size.width, h: theme.fontSizes.small * 1.6 }, [makeParagraph(meta, { fontFamily: theme.fonts.body, fontSize: theme.fontSizes.small, color: ink.sub, align: "middle" })], { name: "Cover footer", opacity: ink.metaOpacity }));
        }
    }
    else {
        // band：右缘竖色带 + 左侧中部标题块。
        shapes.push(makeRect({ x: size.width - 14, y: 0, w: 14, h: size.height }, linear(90, [
            { offset: 0, color: theme.palette.accent1 },
            { offset: 1, color: theme.palette.accent2 },
        ]), { name: "Cover accent" }));
        const subH = spec.subtitle ? paraBlockH(spec.subtitle, theme.fontSizes.coverSubtitle, area.w * 0.7) : 0;
        const titleY = Math.min(size.height * 0.36, size.height * 0.88 - subH - (subH ? 12 : 0) - block.height);
        shapes.push(makeText({ x: area.x, y: titleY, w: area.w * 0.8, h: block.height }, [makeParagraph(spec.title, { fontFamily: theme.fonts.title, fontSize: display, fontWeight: 800, color: ink.title, lineHeight: 1.12 })], { name: "Cover title" }));
        if (spec.subtitle) {
            shapes.push(makeText({ x: area.x, y: titleY + block.height + 12, w: area.w * 0.7, h: subH }, [makeParagraph(spec.subtitle, { fontFamily: theme.fonts.body, fontSize: theme.fontSizes.coverSubtitle, color: ink.sub, lineHeight: 1.4 })], { name: "Cover subtitle", opacity: ink.subOpacity }));
        }
        if (meta) {
            shapes.push(makeText({ x: area.x, y: size.height - area.y * 0.7 - theme.fontSizes.small, w: area.w, h: theme.fontSizes.small * 1.6 }, [makeParagraph(meta, { fontFamily: theme.fonts.body, fontSize: theme.fontSizes.small, color: ink.sub })], { name: "Cover footer", opacity: ink.metaOpacity }));
        }
    }
    // accent 杆是标题的一部分（各 variant push 点分散，按名字并单元）。
    tagUnitByName(shapes, /^(cover accent|cover title)$/i, "cover-title");
    return { background: cinematicBackground(ctx, "cover"), shapes };
}
function layoutSection(spec, ctx) {
    const { size, theme, tune, area } = ctx;
    const shapes = [];
    const variant = ctx.sv.sectionStyle
        ? ctx.sv.sectionStyle === "chip-number"
            ? "center"
            : "ghost"
        : tune.align === "middle"
            ? "center"
            : pick(ctx.rng, ["ghost", "center"]);
    if (variant === "ghost") {
        if (spec.number && ctx.sv.ghostGlyphs && ctx.sv.sectionStyle !== "masthead-left") {
            // 幽灵大序号：右半区、低透明度、压在内容之下（先 push → z 更低）。
            shapes.push(ghostGlyph(ctx, spec.number, { x: size.width * 0.5, y: size.height * 0.08, w: size.width * 0.44, h: size.height * 0.84 }, { name: "Section number" }));
        }
        const block = fitBlock(spec.title, theme.fontSizes.sectionTitle * 1.1 * ctx.sv.displayScale, area.w * 0.72, { maxLines: 2, minScale: 0.66, lineHeight: 1.18, maxH: area.h * 0.55 });
        const capH = spec.caption ? paraBlockH(spec.caption, theme.fontSizes.body, area.w * 0.6, 1.5) : 0;
        // 标题偏好落在 42% 高度；块太高时上移，保证 caption 也在画布内。
        const titleY = Math.max(area.y + 28, Math.min(area.y + area.h * 0.42, area.y + area.h - block.height - (capH ? capH + 14 : 0) - 8));
        shapes.push(makeRect({ x: area.x, y: titleY - 20, w: 56, h: 5 }, solid(theme.palette.accent1), { name: "Masthead rule" }));
        shapes.push(makeText({ x: area.x, y: titleY, w: area.w * 0.72, h: block.height }, [makeParagraph(spec.title, { fontFamily: theme.fonts.title, fontSize: block.size, fontWeight: 800, color: theme.palette.text, lineHeight: 1.15 })], { name: "Section title" }));
        if (spec.caption) {
            shapes.push(makeText({ x: area.x, y: titleY + block.height + 14, w: area.w * 0.6, h: capH }, [makeParagraph(spec.caption, { fontFamily: theme.fonts.body, fontSize: theme.fontSizes.body, color: mutedOn(theme, theme.palette.bgAlt), lineHeight: 1.5 })], { name: "Section caption" }));
        }
    }
    else {
        // 居中：序号小章（圆片）+ 标题 + caption，全部实高堆叠。
        const block = fitBlock(spec.title, theme.fontSizes.sectionTitle * 1.1 * ctx.sv.displayScale, size.width * 0.84, { maxLines: 2, minScale: 0.66, lineHeight: 1.18, maxH: size.height * 0.5 });
        const capH = spec.caption ? paraBlockH(spec.caption, theme.fontSizes.body, size.width * 0.68, 1.5) : 0;
        const chip = spec.number ? 52 : 0;
        const total = (chip ? chip + 22 : 0) + block.height + (capH ? capH + 16 : 0);
        let cy = Math.max(area.y + 20, (size.height - total) * 0.42);
        if (spec.number) {
            shapes.push(makeEllipse({ x: size.width / 2 - chip / 2, y: cy, w: chip, h: chip }, solid(theme.palette.accent1), { name: "Section chip" }));
            shapes.push(makeText({ x: size.width / 2 - chip / 2, y: cy, w: chip, h: chip }, [makeParagraph(spec.number, { fontFamily: theme.fonts.title, fontSize: 22, fontWeight: 800, color: inkOn(theme.palette.accent1, "#ffffff", "#0f172a"), align: "middle" })], { name: "Section number", vAlign: "middle", wrap: false }));
            cy += chip + 22;
        }
        shapes.push(makeText({ x: size.width * 0.08, y: cy, w: size.width * 0.84, h: block.height }, [makeParagraph(spec.title, { fontFamily: theme.fonts.title, fontSize: block.size, fontWeight: 800, color: theme.palette.text, align: "middle", lineHeight: 1.15 })], { name: "Section title" }));
        if (spec.caption) {
            shapes.push(makeText({ x: size.width * 0.16, y: cy + block.height + 16, w: size.width * 0.68, h: capH }, [makeParagraph(spec.caption, { fontFamily: theme.fonts.body, fontSize: theme.fontSizes.body, color: mutedOn(theme, theme.palette.bgAlt), align: "middle", lineHeight: 1.5 })], { name: "Section caption" }));
        }
    }
    return { background: cinematicBackground(ctx, "section"), shapes };
}
function layoutBullets(spec, ctx) {
    const { theme, tune } = ctx;
    const area = tunedArea(ctx.area, tune);
    const c = { ...ctx, area };
    const title = buildPageTitle(c, spec.title);
    const shapes = [...title.shapes];
    const bodyH = area.h - (title.bodyY - area.y);
    const sv = ctx.sv;
    const variant = sv.fromAi
        ? sv.dividerStyle === "accent"
            ? "edge"
            : "measure"
        : tune.centerBody
            ? "measure"
            : pick(ctx.rng, ["measure", "edge"]);
    const centered = !!tune.centerBody;
    const measure = sv.bodyMeasure ?? (centered ? 0.7 : spec.bullets.length <= 4 ? 0.76 : 0.88);
    const w = area.w * measure;
    const x = centered ? area.x + (area.w - w) / 2 : variant === "edge" ? area.x + 22 : area.x;
    if (variant === "edge" && !centered) {
        const ruleColor = sv.dividerStyle === "accent" ? theme.palette.accent1 : undefined;
        shapes.push(hairline(ctx, { x: area.x + 4, y: title.bodyY + 4, w: 2, h: bodyH - 12 }, { name: "Body rule", ...(ruleColor ? { color: ruleColor } : {}) }));
    }
    const bodyW = variant === "edge" ? w - 22 : w;
    // 条目多 / 行高大 / 版心窄时按可用高度收缩字号与行高。
    const fit = fitBulletList(spec.bullets, bodyW - 26, bodyH, theme.fontSizes.body, sv.bodyLineHeight);
    const paragraphs = spec.bullets.map((line, i) => makeParagraph(line, {
        fontFamily: theme.fonts.body,
        fontSize: fit.size,
        // 首条强调：≥4 条时第一条加粗，制造入口层级（可被 AI 风格关闭）。
        ...(sv.firstBulletEmphasis && spec.bullets.length >= 4 && i === 0
            ? { color: theme.palette.text, fontWeight: 700, bulletColor: theme.palette.accent1 }
            : { color: theme.palette.text }),
        bullet: !centered,
        lineHeight: fit.lineHeight,
        ...(centered ? { align: "middle" } : {}),
    }));
    shapes.push(makeText({ x, y: title.bodyY, w: bodyW, h: bodyH }, paragraphs, { name: "Bullets body" }));
    tagUnitByName(shapes, /^(body rule|bullets body)$/i, "bullets");
    return { shapes };
}
function layoutTwoColumn(spec, ctx) {
    const { theme, tune } = ctx;
    const area = tunedArea(ctx.area, tune);
    const c = { ...ctx, area };
    const titleBuilt = buildPageTitle(c, spec.title);
    const shapes = [...titleBuilt.shapes];
    const bodyY = titleBuilt.bodyY;
    const bodyH = area.h - (bodyY - area.y);
    const variant = ctx.sv.fromAi
        ? ctx.sv.panelStyle === "open"
            ? "hairline"
            : "panel"
        : pick(ctx.rng, ["hairline", "panel"]);
    const gutter = variant === "panel" ? Math.min(ctx.sv.gutter, 28) : Math.max(ctx.sv.gutter, 32);
    const leftColW = (area.w - gutter) * tune.twoColRatio;
    const rightColW = area.w - gutter - leftColW;
    const buildCol = (x, colW, colTitle, bullets, accent, unit) => {
        const out = [];
        let cy = bodyY;
        let tx = x;
        let tw = colW;
        if (variant === "panel") {
            const radius = ctx.sv.panelStyle === "flat" ? Math.min(4, ctx.sv.panelRadius) : ctx.sv.panelRadius;
            out.push(makeRect({ x, y: bodyY, w: colW, h: bodyH }, solid(theme.palette.bgAlt), { rx: radius, ry: radius, name: "Column panel" }));
            out.push(makeRect({ x, y: bodyY, w: colW, h: 4 }, solid(accent), { rx: 2, ry: 2, name: "Column accent" }));
            tx = x + 18;
            tw = colW - 36;
            cy = bodyY + 18;
        }
        if (colTitle) {
            const surface = variant === "panel" ? theme.palette.bgAlt : theme.palette.bg;
            out.push(makeText({ x: tx, y: cy, w: tw, h: theme.fontSizes.body * 1.9 }, [makeParagraph(colTitle, { fontFamily: theme.fonts.title, fontSize: theme.fontSizes.body + 5, fontWeight: 700, color: inkOn(surface, accent, theme.palette.text) })], { name: "Column title" }));
            cy += theme.fontSizes.body * 1.9 + 6;
            if (variant === "hairline") {
                out.push(hairline(ctx, { x: tx, y: cy - 2, w: tw * 0.4, h: 2 }, { color: accent, name: "Column accent" }));
                cy += 8;
            }
        }
        const availH = bodyY + bodyH - cy - (variant === "panel" ? 14 : 0);
        // 窄栏 + 大行高时长句会竖向爆栏：按可用高度收缩字号/行高。
        const fit = fitBulletList(bullets, tw - 26, availH, theme.fontSizes.body, ctx.sv.bodyLineHeight);
        const ps = bullets.map((b) => makeParagraph(b, {
            fontFamily: theme.fonts.body,
            fontSize: fit.size,
            color: theme.palette.text,
            bullet: true,
            lineHeight: fit.lineHeight,
        }));
        out.push(makeText({ x: tx, y: cy, w: tw, h: availH }, ps, { name: "Column body" }));
        tagUnit(out, 0, unit);
        return out;
    };
    shapes.push(...buildCol(area.x, leftColW, spec.leftTitle, spec.leftBullets, theme.palette.accent1, "column:0"));
    if (variant === "hairline" && ctx.sv.dividerStyle !== "none") {
        const dividerColor = ctx.sv.dividerStyle === "accent" ? theme.palette.accent1 : undefined;
        const divider = hairline(ctx, { x: area.x + leftColW + gutter / 2, y: bodyY + 4, w: ctx.sv.dividerStyle === "accent" ? 2 : 1, h: bodyH - 12 }, { name: "Column divider", ...(dividerColor ? { color: dividerColor } : {}) });
        // 分隔线跟左栏一起出现：它是左栏的收边，单独留到最后浮现会很突兀。
        divider.animUnit = "column:0";
        shapes.push(divider);
    }
    shapes.push(...buildCol(area.x + leftColW + gutter, rightColW, spec.rightTitle, spec.rightBullets, theme.palette.accent2, "column:1"));
    return { shapes };
}
function layoutQuote(spec, ctx) {
    const { theme, tune, area } = ctx;
    const shapes = [];
    const variant = ctx.sv.fromAi
        ? ctx.sv.ghostGlyphs && tune.align !== "middle"
            ? "ghost"
            : "center"
        : tune.align === "middle"
            ? "center"
            : pick(ctx.rng, ["ghost", "center"]);
    const qSize = fitFont(spec.quote, theme.fontSizes.quote * 1.1 * Math.min(ctx.sv.displayScale, 1.25), area.w * 0.8 * 3, { maxLines: 4, minScale: 0.6 });
    if (variant === "ghost") {
        shapes.push(makeText({ x: area.x - 6, y: area.y, w: area.w * 0.4, h: area.h * 0.5 }, [makeParagraph("\u201C", { fontFamily: theme.fonts.title, fontSize: 220, fontWeight: 900, color: inkOn(theme.palette.bgAlt, theme.palette.accent1, theme.palette.text), lineHeight: 1 })], { name: "Quote mark", vAlign: "top", wrap: false, opacity: 0.16 }));
        shapes.push(makeText({ x: area.x + area.w * 0.06, y: area.y + area.h * 0.26, w: area.w * 0.82, h: area.h * 0.5 }, [makeParagraph(spec.quote, { fontFamily: theme.fonts.title, fontSize: qSize, color: theme.palette.text, italic: true, lineHeight: 1.42 })], { name: "Quote text" }));
        if (spec.attribution) {
            const ay = area.y + area.h * 0.84;
            shapes.push(hairline(ctx, { x: area.x + area.w * 0.06, y: ay + theme.fontSizes.body * 0.55, w: 30, h: 2 }, { color: theme.palette.accent1, name: "Quote rule" }));
            shapes.push(makeText({ x: area.x + area.w * 0.06 + 42, y: ay, w: area.w * 0.7, h: theme.fontSizes.body * 1.7 }, [makeParagraph(spec.attribution, { fontFamily: theme.fonts.body, fontSize: theme.fontSizes.body, fontWeight: 600, color: mutedOn(theme, theme.palette.bgAlt) })], { name: "Quote attribution" }));
        }
    }
    else {
        shapes.push(makeText({ x: 0, y: area.y + area.h * 0.06, w: ctx.size.width, h: 90 }, [makeParagraph("\u201C", { fontFamily: theme.fonts.title, fontSize: 110, fontWeight: 900, color: inkOn(theme.palette.bgAlt, theme.palette.accent1, theme.palette.text), align: "middle", lineHeight: 1 })], { name: "Quote mark", wrap: false }));
        shapes.push(makeText({ x: area.x + area.w * 0.1, y: area.y + area.h * 0.3, w: area.w * 0.8, h: area.h * 0.46 }, [makeParagraph(spec.quote, { fontFamily: theme.fonts.title, fontSize: qSize, color: theme.palette.text, italic: true, align: "middle", lineHeight: 1.42 })], { name: "Quote text" }));
        if (spec.attribution) {
            shapes.push(makeText({ x: area.x, y: area.y + area.h * 0.85, w: area.w, h: theme.fontSizes.body * 1.7 }, [makeParagraph("— " + spec.attribution, { fontFamily: theme.fonts.body, fontSize: theme.fontSizes.body, color: mutedOn(theme, theme.palette.bgAlt), align: "middle" })], { name: "Quote attribution" }));
        }
    }
    return { background: solid(theme.palette.bgAlt), shapes };
}
function layoutImageText(spec, ctx) {
    const { size, theme, tune, area } = ctx;
    const shapes = [];
    const variant = pick(ctx.rng, ["bleed", "frame"]);
    const imageOnLeft = (spec.imagePosition ?? "right") === "left";
    // 图区几何：bleed = 图贴满该侧到画布边；frame = 安全区内 + accent 错位框。
    const imgW = variant === "bleed" ? size.width * 0.44 : area.w * 0.42;
    const imgX = variant === "bleed" ? (imageOnLeft ? 0 : size.width - imgW) : imageOnLeft ? area.x : area.x + area.w - imgW;
    const imgY = variant === "bleed" ? 0 : area.y + theme.fontSizes.pageTitle * 1.35 + theme.metrics.titleBodyGap;
    const imgH = variant === "bleed" ? size.height : area.h - (imgY - area.y);
    // 文字区：标题 + bullets 落在图的另一侧。
    const textX = imageOnLeft ? imgX + imgW + (variant === "bleed" ? size.width * 0.05 : 32) : area.x;
    const textW = imageOnLeft ? area.x + area.w - textX : imgX - 32 - area.x;
    const tCtx = { ...ctx, area: { x: textX, y: area.y, w: textW, h: area.h } };
    const title = buildPageTitle(tCtx, spec.title);
    shapes.push(...title.shapes);
    const imageFrom = shapes.length;
    if (variant === "frame") {
        // accent 错位框：图后方偏移 10px 的描边框感色块。
        shapes.push(makeRect({ x: imgX + (imageOnLeft ? -10 : 10), y: imgY + 10, w: imgW, h: imgH }, solid(theme.palette.accent1), {
            name: "Image frame",
            opacity: 0.35,
            rx: 6,
            ry: 6,
        }));
    }
    if (spec.imageSrc) {
        shapes.push(makeImage({ x: imgX, y: imgY, w: imgW, h: imgH }, spec.imageSrc, { name: "Image" }));
    }
    else {
        // 契约：占位 rect 名 "Image placeholder"、hint 文字名 "Image hint"（enrich 靠名字替换）。
        shapes.push(makeRect({ x: imgX, y: imgY, w: imgW, h: imgH }, solid(theme.palette.bgAlt), {
            name: "Image placeholder",
            ...(variant === "frame" ? { rx: 6, ry: 6 } : {}),
        }));
        if (spec.imageQuery) {
            shapes.push(makeText({ x: imgX + 14, y: imgY + imgH / 2 - 22, w: imgW - 28, h: 44 }, [makeParagraph(`\u{1F5BC} ${spec.imageQuery}`, { fontFamily: theme.fonts.body, fontSize: theme.fontSizes.small, color: mutedOn(theme, theme.palette.bgAlt), align: "middle" })], { name: "Image hint", vAlign: "middle" }));
        }
    }
    // 错位框 / 占位底 / 提示文字都属于"这张图"，一起入场。
    tagUnit(shapes, imageFrom, "image");
    const ps = spec.bullets.map((b) => makeParagraph(b, {
        fontFamily: theme.fonts.body,
        fontSize: theme.fontSizes.body,
        color: theme.palette.text,
        bullet: true,
        lineHeight: Math.max(theme.metrics.bulletLineHeight, 1.5),
    }));
    shapes.push(makeText({ x: textX, y: title.bodyY, w: textW, h: area.y + area.h - title.bodyY }, ps, { name: "Side text" }));
    return { shapes };
}
function layoutTable(spec, ctx) {
    const { theme, tune } = ctx;
    const area = tunedArea(ctx.area, tune);
    const c = { ...ctx, area };
    const title = buildPageTitle(c, spec.title);
    const shapes = [...title.shapes];
    const variant = ctx.sv.fromAi ? (ctx.sv.panelStyle === "open" ? "hairline" : "zebra") : pick(ctx.rng, ["hairline", "zebra"]);
    const bodyY = title.bodyY;
    const cols = Math.max(1, spec.headers.length);
    const colW = area.w / cols;
    const rowH = Math.min(44, (area.h - (bodyY - area.y) - 40) / Math.max(1, spec.rows.length + 1));
    // 表头：accent 底 band + 白字（hairline 变体只画 2px accent 顶线 + 粗体表头）。
    const headerFrom = shapes.length;
    if (variant === "zebra") {
        shapes.push(makeRect({ x: area.x, y: bodyY, w: area.w, h: rowH }, solid(theme.palette.accent1), { name: "Table header", rx: 6, ry: 6 }));
    }
    else {
        shapes.push(makeRect({ x: area.x, y: bodyY + rowH - 2, w: area.w, h: 2 }, solid(theme.palette.accent1), { name: "Table header" }));
    }
    spec.headers.forEach((h, i) => {
        shapes.push(makeText({ x: area.x + i * colW + 12, y: bodyY, w: colW - 24, h: rowH }, [
            makeParagraph(h, {
                fontFamily: theme.fonts.title,
                fontSize: theme.fontSizes.body,
                fontWeight: 700,
                color: variant === "zebra" ? inkOn(theme.palette.accent1, "#ffffff", "#0f172a", 4.5) : theme.palette.text,
            }),
        ], { name: "Header cell", vAlign: "middle" }));
    });
    tagUnit(shapes, headerFrom, "table-header");
    spec.rows.forEach((row, r) => {
        const y = bodyY + rowH * (r + 1);
        const rowFrom = shapes.length;
        if (variant === "zebra" && r % 2 === 0) {
            shapes.push(makeRect({ x: area.x, y, w: area.w, h: rowH }, solid(theme.palette.bgAlt), { name: "Row stripe" }));
        }
        if (variant === "hairline") {
            shapes.push(hairline(ctx, { x: area.x, y: y + rowH - 1, w: area.w, h: 1 }, { name: "Row stripe", opacity: 0.6 }));
        }
        row.slice(0, cols).forEach((cell, i) => {
            shapes.push(makeText({ x: area.x + i * colW + 12, y, w: colW - 24, h: rowH }, [makeParagraph(cell, { fontFamily: theme.fonts.body, fontSize: theme.fontSizes.body - 1, color: theme.palette.text })], { name: "Cell", vAlign: "middle" }));
        });
        tagUnit(shapes, rowFrom, `table-row:${r}`);
    });
    return { shapes };
}
function layoutClosing(spec, ctx) {
    const { size, theme, tune, area } = ctx;
    const shapes = [];
    const variant = ctx.sv.coverAnchor
        ? ctx.sv.coverAnchor === "center"
            ? "stage"
            : "editorial"
        : tune.coverAnchor === "bottom"
            ? "editorial"
            : pick(ctx.rng, ["stage", "editorial"]);
    const ink = heroInk(theme);
    const dark = isDarkBg(theme);
    const block = fitBlock(spec.title, theme.fontSizes.coverTitle * 1.1 * ctx.sv.displayScale, area.w * 0.85, { maxLines: 2, minScale: 0.6, lineHeight: 1.2, maxH: size.height * 0.42 });
    const display = block.size;
    if (variant === "stage") {
        const msgH = spec.message ? paraBlockH(spec.message, theme.fontSizes.coverSubtitle, size.width * 0.68, 1.5) : 0;
        const cy = Math.max(area.y + 30, Math.min(size.height * 0.36, size.height * 0.68 - block.height - msgH));
        shapes.push(makeText({ x: size.width * 0.08, y: cy, w: size.width * 0.84, h: block.height }, [makeParagraph(spec.title, { fontFamily: theme.fonts.title, fontSize: display, fontWeight: 800, color: ink.title, align: "middle", lineHeight: 1.2 })], { name: "Closing title" }));
        const msgBottom = cy + block.height + (spec.message ? 18 + msgH : 0);
        if (spec.message) {
            shapes.push(makeText({ x: size.width * 0.16, y: cy + block.height + 18, w: size.width * 0.68, h: msgH }, [makeParagraph(spec.message, { fontFamily: theme.fonts.body, fontSize: theme.fontSizes.coverSubtitle, color: ink.sub, align: "middle", lineHeight: 1.5 })], { name: "Closing message", opacity: ink.subOpacity }));
        }
        if (spec.contact) {
            // 联系方式落成居中"章"：圆角胶囊 + 文字（在 message 之下，不追固定百分比）。
            const chipW = Math.min(area.w * 0.6, estTextWidth(spec.contact, theme.fontSizes.body) + 72);
            const chipH = theme.fontSizes.body * 2.4;
            const chipX = (size.width - chipW) / 2;
            const chipY = Math.min(size.height * 0.88 - chipH, Math.max(size.height * 0.74, msgBottom + 22));
            shapes.push(makeRect({ x: chipX, y: chipY, w: chipW, h: chipH }, dark ? solid("#ffffff", 0.14) : solid(theme.palette.bgAlt), { rx: chipH / 2, ry: chipH / 2, name: "Contact chip" }));
            shapes.push(makeText({ x: chipX, y: chipY, w: chipW, h: chipH }, [makeParagraph(spec.contact, { fontFamily: theme.fonts.body, fontSize: theme.fontSizes.body, fontWeight: 600, color: ink.title, align: "middle" })], { name: "Closing contact", vAlign: "middle" }));
        }
    }
    else {
        // 底部 contact 行固定；标题 + message 按实高自 contact 上缘向上反推，绝不压线。
        const contactH = spec.contact ? theme.fontSizes.small * 1.8 : 0;
        const contactY = size.height - area.y - contactH;
        const msgH = spec.message ? paraBlockH(spec.message, theme.fontSizes.body + 2, area.w * 0.72, 1.5) : 0;
        const stackBottom = spec.contact ? contactY - 22 : size.height * 0.88;
        const titleY = Math.max(area.y + 40, Math.min(size.height * 0.58, stackBottom - msgH - (msgH ? 14 : 0) - block.height));
        shapes.push(makeRect({ x: area.x, y: titleY - 16, w: 64, h: 5 }, solid(theme.palette.accent2), { name: "Closing accent" }));
        shapes.push(makeText({ x: area.x, y: titleY, w: area.w * 0.85, h: block.height }, [makeParagraph(spec.title, { fontFamily: theme.fonts.title, fontSize: display, fontWeight: 800, color: ink.title, lineHeight: 1.2 })], { name: "Closing title" }));
        if (spec.message) {
            shapes.push(makeText({ x: area.x, y: titleY + block.height + 14, w: area.w * 0.72, h: msgH }, [makeParagraph(spec.message, { fontFamily: theme.fonts.body, fontSize: theme.fontSizes.body + 2, color: ink.sub, lineHeight: 1.5 })], { name: "Closing message", opacity: ink.subOpacity }));
        }
        if (spec.contact) {
            shapes.push(makeText({ x: area.x, y: contactY, w: area.w, h: contactH }, [makeParagraph(spec.contact, { fontFamily: theme.fonts.body, fontSize: theme.fontSizes.small, color: ink.sub, kicker: true, letterSpacing: 1.5 })], { name: "Closing contact", opacity: ink.metaOpacity }));
        }
    }
    tagUnitByName(shapes, /^(closing accent|closing title)$/i, "closing-title");
    return { background: cinematicBackground(ctx, "closing"), shapes };
}
function layoutContent(spec, ctx) {
    const { theme, tune } = ctx;
    const area = tunedArea(ctx.area, tune);
    const c = { ...ctx, area };
    const title = buildPageTitle(c, spec.title);
    const shapes = [...title.shapes];
    const bodyH = area.h - (title.bodyY - area.y);
    const centered = !!tune.centerBody;
    const variant = centered ? "center" : pick(ctx.rng, ["lede", "center"]);
    if (variant === "lede" && !centered) {
        // 左缘 accent 粗杆 + 窄版心 + 偏大正文（读起来像杂志导语）。
        const measure = ctx.sv.bodyMeasure ?? 0.68;
        shapes.push(makeRect({ x: area.x, y: title.bodyY + 4, w: 4, h: Math.min(bodyH - 12, theme.fontSizes.body * 7) }, solid(theme.palette.accent1), { name: "Body accent" }));
        const fitL = fitBulletList([spec.body], area.w * measure, bodyH, theme.fontSizes.body + 2, ctx.sv.bodyLineHeight, 0);
        shapes.push(makeText({ x: area.x + 26, y: title.bodyY, w: area.w * measure, h: bodyH }, [makeParagraph(spec.body, { fontFamily: theme.fonts.body, fontSize: fitL.size, color: theme.palette.text, lineHeight: fitL.lineHeight })], { name: "Body" }));
    }
    else {
        const w = area.w * (ctx.sv.bodyMeasure ?? (centered ? 0.66 : 0.72));
        const x = area.x + (area.w - w) / 2;
        const fitC = fitBulletList([spec.body], w, bodyH, theme.fontSizes.body + 1, ctx.sv.bodyLineHeight, 0);
        shapes.push(makeText({ x, y: title.bodyY, w, h: bodyH }, [makeParagraph(spec.body, { fontFamily: theme.fonts.body, fontSize: fitC.size, color: theme.palette.text, lineHeight: fitC.lineHeight, ...(centered ? { align: "middle" } : {}) })], { name: "Body" }));
    }
    return { shapes };
}
function layoutHero(spec, ctx) {
    const { size, theme, tune, area } = ctx;
    const shapes = [];
    const variant = ctx.sv.heroAnchor
        ? ctx.sv.heroAnchor === "center"
            ? "stage"
            : "anchor"
        : tune.align === "middle"
            ? "stage"
            : pick(ctx.rng, ["anchor", "stage"]);
    const ink = heroInk(theme);
    const dark = isDarkBg(theme);
    const block = fitBlock(spec.title, theme.fontSizes.coverTitle * 1.35 * ctx.sv.displayScale, area.w * 0.9, { maxLines: 2, minScale: 0.52, lineHeight: 1.12, maxH: size.height * 0.5 });
    const display = block.size;
    if (variant === "anchor") {
        // 从底部锚点反推标题块位置：按实际行数计算块高（floor 命中时可能 >2 行），
        // 保证 displayScale 拉满（1.5-1.6）时整个块仍落在画布内。
        const titleH = block.height;
        const subH = spec.subtitle ? paraBlockH(spec.subtitle, theme.fontSizes.coverSubtitle, area.w * 0.7) : 0;
        const blockBottom = size.height * 0.86;
        const y = Math.max(area.y + theme.fontSizes.small * 3, blockBottom - subH - (subH ? 12 : 0) - titleH);
        if (spec.eyebrow) {
            const chipH = theme.fontSizes.small * 2.1;
            const chipW = estTextWidth(spec.eyebrow, theme.fontSizes.small) * 1.4 + 44;
            shapes.push(makeRect({ x: area.x, y: y - chipH - 14, w: chipW, h: chipH }, dark ? solid("#ffffff", 0.12) : solid(theme.palette.bgAlt), { rx: chipH / 2, ry: chipH / 2, name: "Hero chip" }));
            shapes.push(makeText({ x: area.x + 20, y: y - chipH - 14, w: chipW - 40, h: chipH }, [makeParagraph(spec.eyebrow, { fontFamily: theme.fonts.body, fontSize: theme.fontSizes.small, fontWeight: 700, color: ink.title, kicker: true })], { name: "Hero eyebrow", vAlign: "middle", wrap: false }));
        }
        shapes.push(makeText({ x: area.x, y, w: area.w * 0.92, h: titleH }, [makeParagraph(spec.title, { fontFamily: theme.fonts.title, fontSize: display, fontWeight: 800, color: ink.title, lineHeight: 1.1 })], { name: "Hero title" }));
        if (spec.subtitle) {
            shapes.push(makeText({ x: area.x, y: y + titleH + 12, w: area.w * 0.7, h: subH }, [makeParagraph(spec.subtitle, { fontFamily: theme.fonts.body, fontSize: theme.fontSizes.coverSubtitle, color: ink.sub, lineHeight: 1.4 })], { name: "Hero subtitle", opacity: ink.subOpacity }));
        }
    }
    else {
        // 居中舞台：eyebrow + 标题 + 副标题按实高整体垂直居中（略偏上）。
        const subH = spec.subtitle ? paraBlockH(spec.subtitle, theme.fontSizes.coverSubtitle, size.width * 0.7) : 0;
        const total = block.height + (subH ? subH + 14 : 0);
        const cy = Math.max(area.y + theme.fontSizes.small * 3.4, (size.height - total) * 0.46);
        if (spec.eyebrow) {
            shapes.push(kickerText(ctx, spec.eyebrow, { x: 0, y: cy - theme.fontSizes.small * 3, w: size.width, h: theme.fontSizes.small * 2 }, { name: "Hero eyebrow", align: "middle", color: dark ? theme.palette.accent2 : theme.palette.text }));
        }
        shapes.push(makeText({ x: size.width * 0.05, y: cy, w: size.width * 0.9, h: block.height }, [makeParagraph(spec.title, { fontFamily: theme.fonts.title, fontSize: display, fontWeight: 800, color: ink.title, align: "middle", lineHeight: 1.12 })], { name: "Hero title" }));
        if (spec.subtitle) {
            shapes.push(makeText({ x: size.width * 0.15, y: cy + block.height + 14, w: size.width * 0.7, h: subH }, [makeParagraph(spec.subtitle, { fontFamily: theme.fonts.body, fontSize: theme.fontSizes.coverSubtitle, color: ink.sub, align: "middle", lineHeight: 1.4 })], { name: "Hero subtitle", opacity: ink.subOpacity }));
        }
    }
    return { background: cinematicBackground(ctx, "hero"), shapes };
}
function layoutStat(spec, ctx) {
    const { size, theme, tune, area } = ctx;
    const shapes = [];
    const variant = ctx.sv.heroAnchor
        ? ctx.sv.heroAnchor === "center"
            ? "monument"
            : "left"
        : tune.align === "middle"
            ? "monument"
            : pick(ctx.rng, ["left", "monument"]);
    const valueSize = fitFont(spec.value, size.height * 0.34 * ctx.sv.displayScale, area.w * (variant === "left" ? 0.62 : 0.86), { maxLines: 1, minScale: 0.4 });
    if (variant === "left") {
        const vy = area.y + area.h * 0.22;
        shapes.push(makeText({ x: area.x, y: vy, w: area.w * 0.66, h: valueSize * 1.15 }, [makeParagraph(spec.value, { fontFamily: theme.fonts.title, fontSize: valueSize, fontWeight: 800, color: inkOn(theme.palette.bg, theme.palette.accent1, theme.palette.text), lineHeight: 1 })], { name: "Stat value", wrap: false }));
        shapes.push(makeRect({ x: area.x + 4, y: vy + valueSize * 1.2 + 6, w: 96, h: 5 }, solid(theme.palette.accent2), { name: "Stat accent" }));
        shapes.push(makeText({ x: area.x, y: vy + valueSize * 1.2 + 26, w: area.w * 0.7, h: theme.fontSizes.body * 2.2 }, [makeParagraph(spec.label, { fontFamily: theme.fonts.body, fontSize: theme.fontSizes.body + 4, fontWeight: 700, color: theme.palette.text, kicker: true, letterSpacing: 1.5 })], { name: "Stat label" }));
        if (spec.context) {
            shapes.push(makeText({ x: area.x, y: vy + valueSize * 1.2 + 26 + theme.fontSizes.body * 2.6, w: area.w * 0.62, h: theme.fontSizes.body * 2.4 }, [makeParagraph(spec.context, { fontFamily: theme.fonts.body, fontSize: theme.fontSizes.small + 1, color: mutedOn(theme, theme.palette.bg), lineHeight: 1.5 })], { name: "Stat context" }));
        }
    }
    else {
        const cy = area.y + area.h * 0.2;
        shapes.push(makeText({ x: 0, y: cy, w: size.width, h: valueSize * 1.15 }, [makeParagraph(spec.value, { fontFamily: theme.fonts.title, fontSize: valueSize, fontWeight: 800, color: inkOn(theme.palette.bg, theme.palette.accent1, theme.palette.text), align: "middle", lineHeight: 1 })], { name: "Stat value", wrap: false }));
        shapes.push(makeText({ x: size.width * 0.14, y: cy + valueSize * 1.25, w: size.width * 0.72, h: theme.fontSizes.body * 2.2 }, [makeParagraph(spec.label, { fontFamily: theme.fonts.body, fontSize: theme.fontSizes.body + 3, fontWeight: 700, color: theme.palette.text, align: "middle", kicker: true, letterSpacing: 1.5 })], { name: "Stat label" }));
        if (spec.context) {
            shapes.push(makeText({ x: size.width * 0.2, y: cy + valueSize * 1.25 + theme.fontSizes.body * 2.8, w: size.width * 0.6, h: theme.fontSizes.body * 2.4 }, [makeParagraph(spec.context, { fontFamily: theme.fonts.body, fontSize: theme.fontSizes.small + 1, color: mutedOn(theme, theme.palette.bg), align: "middle", lineHeight: 1.5 })], { name: "Stat context" }));
        }
    }
    tagUnitByName(shapes, /^(stat accent|stat value)$/i, "stat-value");
    return { shapes };
}
function layoutCards(spec, ctx) {
    const { theme, tune } = ctx;
    const area = tunedArea(ctx.area, tune);
    const c = { ...ctx, area };
    const title = buildPageTitle(c, spec.title);
    const shapes = [...title.shapes];
    const variant = ctx.sv.fromAi ? (ctx.sv.ghostGlyphs ? "numbered" : "topbar") : pick(ctx.rng, ["topbar", "numbered"]);
    const n = Math.max(1, Math.min(4, spec.cards.length));
    const twoRows = n === 4;
    const cols = twoRows ? 2 : n;
    const rows = twoRows ? 2 : 1;
    const gap = Math.min(ctx.sv.gutter, 24);
    const availH = area.h - (title.bodyY - area.y);
    const cardW = (area.w - gap * (cols - 1)) / cols;
    const cardH = (availH - gap * (rows - 1)) / rows;
    const accents = [theme.palette.accent1, theme.palette.accent2, theme.palette.accent3, theme.palette.accent4];
    spec.cards.slice(0, 4).forEach((card, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = area.x + col * (cardW + gap);
        const y = title.bodyY + row * (cardH + gap);
        const accent = accents[i % accents.length];
        const unitFrom = shapes.length;
        shapes.push(...panelSurface(ctx, { x, y, w: cardW, h: cardH }, accent, "Card surface"));
        let ty = y + 18;
        if (variant === "topbar") {
            shapes.push(makeRect({ x: x + 18, y: y + 16, w: 36, h: 4 }, solid(accent), { rx: 2, ry: 2, name: "Card accent" }));
            ty = y + 16 + 4 + 12;
        }
        else {
            // 序号卡：左上角大序号。
            shapes.push(makeText({ x: x + 18, y: y + 12, w: cardW - 36, h: theme.fontSizes.pageTitle * 1.2 }, [makeParagraph(String(i + 1).padStart(2, "0"), { fontFamily: theme.fonts.title, fontSize: theme.fontSizes.pageTitle, fontWeight: 800, color: inkOn(theme.palette.bgAlt, accent, theme.palette.text), lineHeight: 1 })], { name: "Card accent", wrap: false, opacity: 0.75 }));
            ty = y + 12 + theme.fontSizes.pageTitle * 1.2 + 4;
        }
        const cardTitleSize = fitFont(card.title, theme.fontSizes.body + 4, cardW - 36, { maxLines: 1, minScale: 0.8 });
        shapes.push(makeText({ x: x + 18, y: ty, w: cardW - 36, h: cardTitleSize * 1.5 }, [makeParagraph(card.title, { fontFamily: theme.fonts.title, fontSize: cardTitleSize, fontWeight: 700, color: theme.palette.text })], { name: "Card title" }));
        shapes.push(makeText({ x: x + 18, y: ty + cardTitleSize * 1.5 + 6, w: cardW - 36, h: y + cardH - (ty + cardTitleSize * 1.5 + 6) - 14 }, [makeParagraph(card.body, { fontFamily: theme.fonts.body, fontSize: theme.fontSizes.small + 1, color: mutedOn(theme, theme.palette.bgAlt), lineHeight: 1.45 })], { name: "Card body" }));
        tagUnit(shapes, unitFrom, `card:${i}`);
    });
    return { shapes };
}
function layoutTimeline(spec, ctx) {
    const { theme, tune } = ctx;
    const area = tunedArea(ctx.area, tune);
    const c = { ...ctx, area };
    const title = buildPageTitle(c, spec.title);
    const shapes = [...title.shapes];
    const variant = pick(ctx.rng, ["flat", "alternate"]);
    const steps = spec.steps.slice(0, 6);
    const n = Math.max(1, steps.length);
    const railY = title.bodyY + (area.h - (title.bodyY - area.y)) * (variant === "alternate" ? 0.5 : 0.42);
    const rail = makeRect({ x: area.x, y: railY - 1, w: area.w, h: 2 }, solid(theme.palette.divider), { name: "Timeline rail" });
    // 轨道并进第一个节点那一拍：先铺一条空轨再往上钉节点，节奏是断的。
    rail.animUnit = "timeline:0";
    shapes.push(rail);
    const stepW = area.w / n;
    steps.forEach((step, i) => {
        const unitFrom = shapes.length;
        const cx = area.x + stepW * i + stepW / 2;
        // 节点：外圈 bg 环 + 内实心 accent 圆。
        shapes.push(makeEllipse({ x: cx - 11, y: railY - 11, w: 22, h: 22 }, solid(theme.palette.bg), { name: "Timeline node ring" }));
        shapes.push(makeEllipse({ x: cx - 7, y: railY - 7, w: 14, h: 14 }, solid(i === 0 ? theme.palette.accent1 : theme.palette.accent2), { name: "Timeline node" }));
        const above = variant === "alternate" ? i % 2 === 0 : true;
        const labelY = above ? railY - 22 - theme.fontSizes.body * 1.9 : railY + 22;
        const detailY = above ? railY + 22 : railY - 22 - theme.fontSizes.small * 3;
        shapes.push(makeText({ x: cx - stepW / 2 + 8, y: labelY, w: stepW - 16, h: theme.fontSizes.body * 1.9 }, [makeParagraph(step.label, { fontFamily: theme.fonts.title, fontSize: theme.fontSizes.body + 1, fontWeight: 700, color: theme.palette.text, align: "middle" })], { name: "Timeline label", vAlign: above ? "bottom" : "top" }));
        if (step.detail) {
            shapes.push(makeText({ x: cx - stepW / 2 + 8, y: detailY, w: stepW - 16, h: theme.fontSizes.small * 3.4 }, [makeParagraph(step.detail, { fontFamily: theme.fonts.body, fontSize: theme.fontSizes.small, color: mutedOn(theme, theme.palette.bg), align: "middle", lineHeight: 1.4 })], { name: "Timeline detail", vAlign: above ? "top" : "bottom" }));
        }
        tagUnit(shapes, unitFrom, `timeline:${i}`);
    });
    return { shapes };
}
function layoutComparison(spec, ctx) {
    const { theme, tune } = ctx;
    const area = tunedArea(ctx.area, tune);
    const c = { ...ctx, area };
    const title = buildPageTitle(c, spec.title);
    const shapes = [...title.shapes];
    const bodyY = title.bodyY;
    const bodyH = area.h - (bodyY - area.y);
    const gutter = 48;
    const panelW = (area.w - gutter) / 2;
    const buildPanel = (x, label, bullets, accent, unit) => {
        const unitFrom = shapes.length;
        shapes.push(...panelSurface(ctx, { x, y: bodyY, w: panelW, h: bodyH }, accent, "Compare panel"));
        if (ctx.sv.panelStyle !== "open") {
            shapes.push(makeRect({ x, y: bodyY, w: panelW, h: 5 }, solid(accent), { rx: 2, ry: 2, name: "Compare accent" }));
        }
        shapes.push(makeText({ x: x + 20, y: bodyY + 16, w: panelW - 40, h: theme.fontSizes.body * 2 }, [makeParagraph(label, { fontFamily: theme.fonts.title, fontSize: theme.fontSizes.body + 4, fontWeight: 800, color: inkOn(theme.palette.bgAlt, accent, theme.palette.text) })], { name: "Compare label" }));
        const ps = bullets.map((b) => makeParagraph(b, {
            fontFamily: theme.fonts.body,
            fontSize: theme.fontSizes.body,
            color: theme.palette.text,
            lineHeight: ctx.sv.bodyLineHeight,
        }));
        shapes.push(makeText({ x: x + 20, y: bodyY + 16 + theme.fontSizes.body * 2.3, w: panelW - 40, h: bodyH - theme.fontSizes.body * 2.3 - 30 }, ps, { name: "Compare body" }));
        tagUnit(shapes, unitFrom, unit);
    };
    buildPanel(area.x, spec.leftLabel, spec.leftBullets, theme.palette.accent1, "compare:0");
    buildPanel(area.x + panelW + gutter, spec.rightLabel, spec.rightBullets, theme.palette.accent2, "compare:1");
    // 中央 VS 徽章。
    const vsFrom = shapes.length;
    const vsSize = 46;
    const vsX = area.x + panelW + gutter / 2 - vsSize / 2;
    const vsY = bodyY + bodyH / 2 - vsSize / 2;
    shapes.push(makeEllipse({ x: vsX - 4, y: vsY - 4, w: vsSize + 8, h: vsSize + 8 }, solid(theme.palette.bg), { name: "VS ring" }));
    shapes.push(makeRect({ x: vsX, y: vsY, w: vsSize, h: vsSize }, solid(theme.palette.text), { rx: vsSize / 2, ry: vsSize / 2, name: "VS badge" }));
    shapes.push(makeText({ x: vsX, y: vsY, w: vsSize, h: vsSize }, [makeParagraph("VS", { fontFamily: theme.fonts.title, fontSize: 16, fontWeight: 800, color: theme.palette.bg, align: "middle" })], { name: "VS text", vAlign: "middle", wrap: false }));
    tagUnit(shapes, vsFrom, "compare:vs");
    return { shapes };
}
function layoutAgenda(spec, ctx) {
    const { theme, tune } = ctx;
    const area = tunedArea(ctx.area, tune);
    const c = { ...ctx, area };
    const title = buildPageTitle(c, spec.title);
    const shapes = [...title.shapes];
    const items = spec.items.slice(0, 8);
    const twoCol = items.length > 5;
    const cols = twoCol ? 2 : 1;
    const colGap = 40;
    const colW = twoCol ? (area.w - colGap) / 2 : area.w;
    const perCol = Math.ceil(items.length / cols);
    const availH = area.h - (title.bodyY - area.y);
    const rowH = Math.min(twoCol ? 76 : 68, availH / perCol);
    items.forEach((item, i) => {
        const unitFrom = shapes.length;
        const col = twoCol ? Math.floor(i / perCol) : 0;
        const row = twoCol ? i % perCol : i;
        const x = area.x + col * (colW + colGap);
        const y = title.bodyY + row * rowH;
        const num = item.number ?? String(i + 1).padStart(2, "0");
        // 大序号（accent、常规透明度 —— 比幽灵字实，但字重轻于 label）。
        shapes.push(makeText({ x, y: y + 6, w: 64, h: rowH - 12 }, [makeParagraph(num, { fontFamily: theme.fonts.title, fontSize: theme.fontSizes.pageTitle + 4, fontWeight: 800, color: inkOn(theme.palette.bg, theme.palette.accent1, theme.palette.text), lineHeight: 1 })], { name: "Agenda number", vAlign: "middle", wrap: false, opacity: 0.85 }));
        shapes.push(makeText({ x: x + 78, y: y + 6, w: colW - 78, h: item.caption ? rowH * 0.52 : rowH - 12 }, [makeParagraph(item.label, { fontFamily: theme.fonts.title, fontSize: theme.fontSizes.body + 3, fontWeight: 700, color: theme.palette.text })], { name: "Agenda label", vAlign: item.caption ? "bottom" : "middle" }));
        if (item.caption) {
            shapes.push(makeText({ x: x + 78, y: y + rowH * 0.52 + 4, w: colW - 78, h: rowH * 0.4 }, [makeParagraph(item.caption, { fontFamily: theme.fonts.body, fontSize: theme.fontSizes.small, color: mutedOn(theme, theme.palette.bg) })], { name: "Agenda caption" }));
        }
        if (row < perCol - 1 && ctx.sv.dividerStyle !== "none") {
            const accentRule = ctx.sv.dividerStyle === "accent";
            shapes.push(hairline(ctx, { x: x + 78, y: y + rowH - 1, w: accentRule ? 42 : colW - 78, h: accentRule ? 2 : 1 }, { name: "Agenda rule", opacity: 0.7, ...(accentRule ? { color: theme.palette.accent1 } : {}) }));
        }
        tagUnit(shapes, unitFrom, `agenda:${i}`);
    });
    return { shapes };
}
function layoutMetrics(spec, ctx) {
    const { theme, tune } = ctx;
    const area = tunedArea(ctx.area, tune);
    const c = { ...ctx, area };
    const title = buildPageTitle(c, spec.title);
    const shapes = [...title.shapes];
    const variant = ctx.sv.fromAi ? (ctx.sv.panelStyle === "open" ? "open" : "cards") : pick(ctx.rng, ["open", "cards"]);
    const metrics = spec.metrics.slice(0, 4);
    const n = Math.max(1, metrics.length);
    const gap = variant === "cards" ? 18 : 0;
    const cellW = (area.w - gap * (n - 1)) / n;
    const bodyY = title.bodyY;
    const cellH = Math.min(area.h - (bodyY - area.y), 190);
    const accents = [theme.palette.accent1, theme.palette.accent2, theme.palette.accent3, theme.palette.accent4];
    metrics.forEach((m, i) => {
        const unitFrom = shapes.length;
        const x = area.x + i * (cellW + gap);
        const accent = accents[i % accents.length];
        let tx = x;
        let tw = cellW;
        if (variant === "cards") {
            const radius = ctx.sv.panelStyle === "flat" ? Math.min(4, ctx.sv.panelRadius) : ctx.sv.panelRadius;
            shapes.push(makeRect({ x, y: bodyY, w: cellW, h: cellH }, solid(theme.palette.bgAlt), { rx: radius, ry: radius, name: "Metric surface" }));
            tx = x + 14;
            tw = cellW - 28;
        }
        else if (i > 0 && ctx.sv.dividerStyle !== "none") {
            shapes.push(hairline(ctx, { x: x - gap / 2, y: bodyY + 12, w: 1, h: cellH - 24 }, { name: "Metric divider", ...(ctx.sv.dividerStyle === "accent" ? { color: theme.palette.accent1 } : {}) }));
        }
        const vSize = fitFont(m.value, 54, tw - 8, { maxLines: 1, minScale: 0.5 });
        shapes.push(makeText({ x: tx, y: bodyY + (variant === "cards" ? 22 : 10), w: tw, h: vSize * 1.2 }, [makeParagraph(m.value, { fontFamily: theme.fonts.title, fontSize: vSize, fontWeight: 800, color: inkOn(variant === "cards" ? theme.palette.bgAlt : theme.palette.bg, accent, theme.palette.text), align: "middle", lineHeight: 1 })], { name: "Metric value", wrap: false }));
        shapes.push(makeText({ x: tx, y: bodyY + (variant === "cards" ? 22 : 10) + vSize * 1.3, w: tw, h: theme.fontSizes.small * 3 }, [makeParagraph(m.label, { fontFamily: theme.fonts.body, fontSize: theme.fontSizes.small, fontWeight: 600, color: mutedOn(theme, variant === "cards" ? theme.palette.bgAlt : theme.palette.bg), align: "middle", kicker: true, letterSpacing: 1.2, lineHeight: 1.35 })], { name: "Metric label" }));
        tagUnit(shapes, unitFrom, `metric:${i}`);
    });
    return { shapes };
}
function makeChart(bbox, chart, name = "Chart") {
    return {
        ...baseFields(),
        id: nextId("sp_chart"),
        kind: "chart",
        name,
        bbox,
        chart: JSON.parse(JSON.stringify(chart)),
    };
}
function layoutChart(spec, ctx) {
    const { theme, tune } = ctx;
    const area = tunedArea(ctx.area, tune);
    const c = { ...ctx, area };
    const title = buildPageTitle(c, spec.title);
    const shapes = [...title.shapes];
    const type = spec.chartType ?? "column";
    const pie = type === "pie" || type === "doughnut";
    const categories = spec.categories.slice(0, 12);
    const seriesIn = spec.series.slice(0, pie ? 1 : 6);
    const accents = [theme.palette.accent1, theme.palette.accent2, theme.palette.accent3, theme.palette.accent4];
    const series = seriesIn.map((s, i) => ({
        name: s.name,
        values: categories.map((_, j) => {
            const v = s.values[j];
            return typeof v === "number" && Number.isFinite(v) ? v : 0;
        }),
        color: accents[i % accents.length],
    }));
    const colors = accents.slice(0, Math.max(series.length, categories.length));
    const chart = pie
        ? {
            type,
            categories,
            series,
            legend: true,
            showValues: true,
            colors,
            varyColors: true,
            ...(type === "doughnut" ? { holeRatio: 0.52 } : {}),
        }
        : type === "line"
            ? { type: "line", categories, series, legend: series.length > 1, colors, markers: true }
            : type === "area"
                ? { type: "area", categories, series, legend: series.length > 1, colors }
                : { type, categories, series, legend: series.length > 1, showValues: true, colors };
    const from = shapes.length;
    shapes.push(makeChart({ x: area.x, y: title.bodyY, w: area.w, h: Math.max(120, area.y + area.h - title.bodyY) }, chart));
    tagUnit(shapes, from, "chart");
    return { shapes };
}
function layoutProcess(spec, ctx) {
    const { theme, tune } = ctx;
    const area = tunedArea(ctx.area, tune);
    const c = { ...ctx, area };
    const title = buildPageTitle(c, spec.title);
    const shapes = [...title.shapes];
    const steps = spec.steps.slice(0, 5);
    const n = Math.max(1, steps.length);
    const gap = 22;
    const stepW = (area.w - gap * (n - 1)) / n;
    const bodyY = title.bodyY;
    const circle = 44;
    steps.forEach((step, i) => {
        const unitFrom = shapes.length;
        const x = area.x + i * (stepW + gap);
        const cxCenter = x + stepW / 2;
        // 连接线（圆之间）。
        if (i < n - 1) {
            shapes.push(makeRect({ x: cxCenter + circle / 2 + 8, y: bodyY + circle / 2 - 1, w: stepW + gap - circle - 16, h: 2 }, solid(theme.palette.divider), { name: "Process connector" }));
        }
        shapes.push(makeEllipse({ x: cxCenter - circle / 2, y: bodyY, w: circle, h: circle }, solid(i === 0 ? theme.palette.accent1 : theme.palette.bgAlt), { name: "Process circle" }));
        shapes.push(makeText({ x: cxCenter - circle / 2, y: bodyY, w: circle, h: circle }, [makeParagraph(String(i + 1), { fontFamily: theme.fonts.title, fontSize: 18, fontWeight: 800, color: i === 0 ? inkOn(theme.palette.accent1, "#ffffff", "#0f172a", 4.5) : inkOn(theme.palette.bgAlt, theme.palette.accent1, theme.palette.text, 4.5), align: "middle" })], { name: "Process number", vAlign: "middle", wrap: false }));
        shapes.push(makeText({ x, y: bodyY + circle + 14, w: stepW, h: theme.fontSizes.body * 2 }, [makeParagraph(step.title, { fontFamily: theme.fonts.title, fontSize: theme.fontSizes.body + 1, fontWeight: 700, color: theme.palette.text, align: "middle" })], { name: "Process title" }));
        if (step.detail) {
            shapes.push(makeText({ x: x + 4, y: bodyY + circle + 14 + theme.fontSizes.body * 2.2, w: stepW - 8, h: theme.fontSizes.small * 4.2 }, [makeParagraph(step.detail, { fontFamily: theme.fonts.body, fontSize: theme.fontSizes.small, color: mutedOn(theme, theme.palette.bg), align: "middle", lineHeight: 1.4 })], { name: "Process detail" }));
        }
        tagUnit(shapes, unitFrom, `process:${i}`);
    });
    return { shapes };
}
function layoutBanner(spec, ctx) {
    const { size, theme, tune, area } = ctx;
    const shapes = [];
    const variant = ctx.sv.fromAi ? (ctx.sv.edgeBand === "top" ? "top" : "side") : pick(ctx.rng, ["side", "top"]);
    const bandPaint = linear(variant === "side" ? 90 : 0, [
        { offset: 0, color: theme.palette.accent1 },
        { offset: 1, color: theme.palette.accent2 },
    ]);
    if (variant === "side") {
        const bandW = Math.max(10, size.width * 0.012);
        shapes.push(makeRect({ x: 0, y: 0, w: bandW, h: size.height }, bandPaint, { name: "Banner band" }));
        let y = area.y + area.h * 0.12;
        if (spec.eyebrow) {
            shapes.push(kickerText(ctx, spec.eyebrow, { x: area.x, y, w: area.w, h: theme.fontSizes.small * 2 }, { name: "Banner eyebrow" }));
            y += theme.fontSizes.small * 2 + 10;
        }
        const titleBlock = fitBlock(spec.title, theme.fontSizes.sectionTitle, area.w * 0.85, {
            maxLines: 2,
            minScale: 0.66,
            lineHeight: 1.15,
        });
        shapes.push(makeText({ x: area.x, y, w: area.w * 0.9, h: titleBlock.height }, [makeParagraph(spec.title, { fontFamily: theme.fonts.title, fontSize: titleBlock.size, fontWeight: 800, color: theme.palette.text, lineHeight: 1.15 })], { name: "Banner title" }));
        y += titleBlock.height + theme.metrics.titleBodyGap * 1.4;
        const ps = spec.bullets.map((b) => makeParagraph(b, {
            fontFamily: theme.fonts.body,
            fontSize: theme.fontSizes.body,
            color: theme.palette.text,
            bullet: true,
            lineHeight: Math.max(theme.metrics.bulletLineHeight, 1.5),
        }));
        shapes.push(makeText({ x: area.x, y, w: area.w * 0.78, h: area.y + area.h - y }, ps, { name: "Banner body" }));
    }
    else {
        // 顶报头带 + 下方左标题右正文双栏。
        shapes.push(makeRect({ x: 0, y: 0, w: size.width, h: 10 }, bandPaint, { name: "Banner band" }));
        let y = area.y + 8;
        if (spec.eyebrow) {
            shapes.push(kickerText(ctx, spec.eyebrow, { x: area.x, y, w: area.w, h: theme.fontSizes.small * 2 }, { name: "Banner eyebrow" }));
            y += theme.fontSizes.small * 2 + 8;
        }
        const display = fitFont(spec.title, theme.fontSizes.sectionTitle, area.w * 0.44 * 2.2, { maxLines: 3, minScale: 0.6 });
        shapes.push(makeText({ x: area.x, y, w: area.w * 0.42, h: area.h * 0.6 }, [makeParagraph(spec.title, { fontFamily: theme.fonts.title, fontSize: display, fontWeight: 800, color: theme.palette.text, lineHeight: 1.18 })], { name: "Banner title" }));
        const ps = spec.bullets.map((b) => makeParagraph(b, {
            fontFamily: theme.fonts.body,
            fontSize: theme.fontSizes.body,
            color: theme.palette.text,
            bullet: true,
            lineHeight: Math.max(theme.metrics.bulletLineHeight, 1.5),
        }));
        shapes.push(makeText({ x: area.x + area.w * 0.5, y, w: area.w * 0.5, h: area.y + area.h - y }, ps, { name: "Banner body" }));
    }
    return { shapes };
}
exports.LAYOUT_KINDS = [
    "cover",
    "section",
    "bullets",
    "two-column",
    "quote",
    "image-text",
    "table",
    "closing",
    "content",
    "hero",
    "stat",
    "cards",
    "timeline",
    "comparison",
    "agenda",
    "metrics",
    "chart",
    "process",
    "banner",
];
const _layoutVocabOk = true;
void _layoutVocabOk;
if (exports.LAYOUT_KINDS.length !== schema_1.OUTLINE_LAYOUT_HINTS.length ||
    exports.LAYOUT_KINDS.some((k, i) => k !== schema_1.OUTLINE_LAYOUT_HINTS[i])) {
    throw new Error(`[ai] LAYOUT_KINDS drifted from OUTLINE_LAYOUT_HINTS.\nlayouts: ${exports.LAYOUT_KINDS.join(",")}\nschema:  ${schema_1.OUTLINE_LAYOUT_HINTS.join(",")}`);
}
/**
 * 全 deck 复用的装饰母题（AI 布局风格的 motifs 段）：缘带 + 页码。
 * 由 compile.ts 对内容页调用（cover/section/hero/closing 有自己的整页构图，跳过），
 * 产出的 shape 放在装饰层之后、内容之前（z 低于内容）。
 */
function buildMotifShapes(style, size, theme, pageIndex, kind) {
    if (!style)
        return [];
    const fullBleed = kind === "cover" || kind === "section" || kind === "hero" || kind === "closing";
    const out = [];
    const band = style.motifs.edgeBand;
    // banner 版式自带缘带，避免双带。
    if (band !== "none" && !fullBleed && kind !== "banner") {
        const paint = linear(band === "top" ? 0 : 90, [
            { offset: 0, color: theme.palette.accent1 },
            { offset: 1, color: theme.palette.accent2 },
        ]);
        const t = 6;
        const box = band === "top"
            ? { x: 0, y: 0, w: size.width, h: t }
            : band === "left"
                ? { x: 0, y: 0, w: t, h: size.height }
                : { x: size.width - t, y: 0, w: t, h: size.height };
        out.push(makeRect(box, paint, { name: "Edge band" }));
    }
    if (style.motifs.pageNumber && !fullBleed) {
        const fs = Math.max(10, theme.fontSizes.small - 2);
        out.push(makeText({ x: size.width - size.width * style.grid.marginX - 60, y: size.height - fs * 2.2, w: 60, h: fs * 1.8 }, [
            makeParagraph(String(pageIndex + 1).padStart(2, "0"), {
                fontFamily: theme.fonts.mono ?? theme.fonts.body,
                fontSize: fs,
                fontWeight: 600,
                color: mutedOn(theme, theme.palette.bg),
                align: "end",
            }),
        ], { name: "Page number", wrap: false, opacity: 0.8 }));
    }
    return out;
}
/**
 * 单一分发入口：根据 spec.kind 选择 layout。
 *
 * 返回 LayoutResult ——
 *   - shapes：放进 slide.layers[0].shapes 的真实内容；
 *   - background（可选）：覆盖 slide.background，作为 slide 级底色。
 *     由调用方（compile.ts / CreateSlideFromSpecCmd）写回；enrichment pass
 *     后若拉到 bgImage 会被 ImagePaint 进一步覆盖。
 */
function renderLayout(spec, size, theme, opts = {}) {
    const seed = opts.seed ?? Math.floor(Math.random() * 0x7fffffff);
    const tune = resolveTuning(theme);
    const sv = resolveStyleView(opts.style, theme, tune);
    // AI 风格接管标题对齐（家族 tuning 让位）。
    if (sv.fromAi) {
        tune.align = sv.titleAlign;
        if (sv.titleAlign === "middle")
            tune.centerBody = true;
        if (sv.titleAccent === "prompt")
            tune.prompt = tune.prompt ?? "$ ";
    }
    const mx = size.width * sv.marginX;
    const my = size.height * sv.marginY;
    const ctx = {
        size,
        theme,
        tune,
        rng: mulberry32(seed),
        area: { x: mx, y: my, w: size.width - 2 * mx, h: size.height - 2 * my },
        sv,
    };
    switch (spec.kind) {
        case "cover":
            return layoutCover(spec, ctx);
        case "section":
            return layoutSection(spec, ctx);
        case "bullets":
            return layoutBullets(spec, ctx);
        case "two-column":
            return layoutTwoColumn(spec, ctx);
        case "quote":
            return layoutQuote(spec, ctx);
        case "image-text":
            return layoutImageText(spec, ctx);
        case "table":
            return layoutTable(spec, ctx);
        case "closing":
            return layoutClosing(spec, ctx);
        case "content":
            return layoutContent(spec, ctx);
        case "hero":
            return layoutHero(spec, ctx);
        case "stat":
            return layoutStat(spec, ctx);
        case "cards":
            return layoutCards(spec, ctx);
        case "timeline":
            return layoutTimeline(spec, ctx);
        case "comparison":
            return layoutComparison(spec, ctx);
        case "agenda":
            return layoutAgenda(spec, ctx);
        case "metrics":
            return layoutMetrics(spec, ctx);
        case "chart":
            return layoutChart(spec, ctx);
        case "process":
            return layoutProcess(spec, ctx);
        case "banner":
            return layoutBanner(spec, ctx);
    }
}
