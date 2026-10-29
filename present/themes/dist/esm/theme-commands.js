import { assignSlideBackground, identityTransform, } from "@sliiu/present-core";
import { buildMastersFromThemeDef, findLayoutRefByType, resolveLayoutTypeForSlide, stripSlideThemeDecorations, } from "./template-masters.js";
import { getTheme } from "./themes.js";
/** 示例封面 shape 的 id 前缀 —— 换主题时按前缀识别并整组重建。 */
const SAMPLE_COVER_ID_PREFIX = "sample_cover_";
/** ThemeDef.fonts 是 CSS font-stack，run.fontFamily 要单一 family 名。 */
function firstFamily(stack) {
    const m = stack.trim().match(/^"([^"]+)"|^'([^']+)'|^([^,]+)/);
    return (m?.[1] ?? m?.[2] ?? m?.[3] ?? stack).trim();
}
/**
 * 按主题排印生成一组「主标题 + 副标题」示例，几何对齐 generate-template 的封面版式。
 * 让用户在空白 deck 上套主题后能立刻看到该主题的标题字体/字号/艺术字效果。
 */
function buildSampleCoverShapes(theme, size, text) {
    const W = size.width, H = size.height;
    const mx = W * 0.08;
    const wa = theme.titleWordArt;
    const align = theme.layout === "centered" ? "middle" : "start";
    const titleY = H * 0.36;
    const titleRun = {
        text: text.title,
        fontFamily: firstFamily(theme.fonts.title),
        fontSize: theme.fontSizes.coverTitle,
        color: wa?.color ?? theme.palette.text,
        fontWeight: wa?.weight ?? 700,
    };
    if (wa?.letterSpacing !== undefined)
        titleRun.letterSpacing = wa.letterSpacing;
    if (wa?.caps)
        titleRun.caps = "all";
    if (wa?.outlineColor && wa.outlineWidth) {
        titleRun.textOutline = { paint: { kind: "solid", color: wa.outlineColor }, width: wa.outlineWidth };
    }
    const base = (id, name, bbox) => ({
        id: `${SAMPLE_COVER_ID_PREFIX}${id}`,
        kind: "text",
        name,
        bbox,
        visible: true,
        locked: false,
        opacity: 1,
        transform: identityTransform(),
    });
    const title = {
        ...base("title", "Cover Title", {
            x: mx,
            y: titleY,
            w: W - mx * 2,
            h: theme.fontSizes.coverTitle * 1.4,
        }),
        paragraphs: [{ runs: [titleRun], ...(align === "middle" ? { align } : {}) }],
    };
    if (wa?.shadow) {
        title.shadow = {
            kind: "outer",
            blur: wa.shadow.blur,
            dx: wa.shadow.dx,
            dy: wa.shadow.dy,
            color: wa.shadow.color,
            alpha: wa.shadow.alpha,
        };
    }
    const subtitle = {
        ...base("subtitle", "Cover Subtitle", {
            x: mx,
            y: titleY + theme.fontSizes.coverTitle * 1.5,
            w: W - mx * 2,
            h: theme.fontSizes.coverSubtitle * 1.6,
        }),
        paragraphs: [
            {
                runs: [
                    {
                        text: text.subtitle,
                        fontFamily: firstFamily(theme.fonts.body),
                        fontSize: theme.fontSizes.coverSubtitle,
                        color: theme.palette.textMuted,
                        fontWeight: 400,
                    },
                ],
                ...(align === "middle" ? { align } : {}),
            },
        ],
    };
    return [title, subtitle];
}
/**
 * 首页只有装饰（或只有上一次注入的示例封面）时，铺一组主题化的示例主副标题。
 * 一旦用户在首页写过任何真实内容就完全不介入 —— 换主题绝不能吃掉用户的东西。
 */
function refreshSampleCover(slide, theme, size, text) {
    const layer = slide.layers[0];
    if (!layer)
        return;
    const authored = layer.shapes.filter((sh) => !sh.id.startsWith("dec_") && !sh.id.startsWith(SAMPLE_COVER_ID_PREFIX));
    if (authored.length > 0)
        return;
    const kept = layer.shapes.filter((sh) => !sh.id.startsWith(SAMPLE_COVER_ID_PREFIX));
    layer.shapes = [...kept, ...buildSampleCoverShapes(theme, size, text)];
}
/**
 * 渲染优先画 `run.fill` 的纯色，`run.color` 只在没有填充时才用。
 * 导入的正文几乎都带着 solid fill，只改 color 时画面上的字色不会变。
 */
function syncTextColorsForTheme(pres, palette) {
    const textColor = palette.text;
    const snaps = [];
    const paintRun = (run) => {
        snaps.push({ run, color: run.color, fill: run.fill });
        run.color = textColor;
        if (run.fill?.kind === "solid") {
            run.fill = { ...run.fill, color: textColor };
        }
    };
    const walk = (shapes) => {
        for (const s of shapes) {
            if (s.kind === "text") {
                for (const para of s.paragraphs) {
                    for (const run of para.runs)
                        paintRun(run);
                }
            }
            else if (s.kind === "group") {
                walk(s.children);
            }
        }
    };
    for (const slide of pres.slides) {
        for (const layer of slide.layers)
            walk(layer.shapes);
    }
    return snaps;
}
function restoreTextColors(snaps) {
    if (!snaps)
        return;
    for (const snap of snaps) {
        if (snap.color === undefined)
            delete snap.run.color;
        else
            snap.run.color = snap.color;
        if (snap.fill === undefined)
            delete snap.run.fill;
        else
            snap.run.fill = snap.fill;
    }
}
export class ApplyCustomThemeCmd {
    theme;
    opts;
    label = "Apply custom theme";
    prev;
    prevMasters;
    prevThemeMeta;
    prevTextColors;
    constructor(theme, opts = {}) {
        this.theme = theme;
        this.opts = opts;
    }
    apply(pres) {
        const theme = this.theme;
        const preserveImg = this.opts.preserveImageBackgrounds !== false;
        const size = pres.size ?? { width: 1280, height: 720 };
        const baseId = `applied:${theme.id}`;
        this.prevMasters = pres.masters
            ? (typeof structuredClone === "function"
                ? structuredClone(pres.masters)
                : JSON.parse(JSON.stringify(pres.masters)))
            : undefined;
        this.prev = pres.slides.map((s) => ({
            slide: s,
            bg: s.background,
            bgRef: s.bgRef,
            shapes: s.layers[0] ? [...s.layers[0].shapes] : [],
            layoutRef: s.layoutRef ? { ...s.layoutRef } : undefined,
        }));
        this.prevThemeMeta = pres.theme ? { ...pres.theme } : undefined;
        const { masters, coreTheme } = buildMastersFromThemeDef(theme, size, baseId);
        pres.masters = masters;
        for (const [idx, slide] of pres.slides.entries()) {
            stripSlideThemeDecorations(slide);
            const layoutType = resolveLayoutTypeForSlide(slide, idx, this.prevMasters);
            const ref = findLayoutRefByType(masters, layoutType) ??
                findLayoutRefByType(masters, idx === 0 ? "title" : "obj");
            if (ref)
                slide.layoutRef = ref;
            const skip = preserveImg && slide.background?.kind === "image";
            if (!skip)
                assignSlideBackground(slide, undefined);
        }
        pres.theme = {
            ...coreTheme,
            colors: {
                ...coreTheme.colors,
                bg1: theme.palette.bg,
                bg2: theme.palette.bgAlt,
                tx1: theme.palette.text,
                tx2: theme.palette.textMuted,
                accent1: theme.palette.accent1,
                accent2: theme.palette.accent2,
                accent3: theme.palette.accent3,
                accent4: theme.palette.accent4,
            },
            fonts: { major: theme.fonts.title, minor: theme.fonts.body },
        };
        this.prevTextColors = syncTextColorsForTheme(pres, theme.palette);
        // 必须排在 syncTextColorsForTheme 之后：那一步会把所有 run 刷成 palette.text，
        // 先注入的话副标题的弱化色和标题艺术字色都会被抹平。
        const first = pres.slides[0];
        if (this.opts.sampleCover && first) {
            refreshSampleCover(first, theme, size, this.opts.sampleCover);
        }
    }
    revert(pres) {
        if (!this.prev)
            return;
        for (const { slide, bg, bgRef, shapes, layoutRef } of this.prev) {
            slide.background = bg;
            if (bgRef)
                slide.bgRef = bgRef;
            else
                delete slide.bgRef;
            slide.layoutRef = layoutRef;
            const layer = slide.layers[0];
            if (layer)
                layer.shapes = shapes;
        }
        pres.masters = this.prevMasters;
        pres.theme = this.prevThemeMeta;
        restoreTextColors(this.prevTextColors);
    }
}
export class ApplyThemeCmd {
    themeId;
    opts;
    label = "Apply theme";
    prev;
    prevThemeMeta;
    prevTextColors;
    constructor(themeId, opts = {}) {
        this.themeId = themeId;
        this.opts = opts;
    }
    apply(pres) {
        const theme = getTheme(this.themeId);
        const preserveImg = this.opts.preserveImageBackgrounds !== false;
        this.prev = pres.slides.map((s) => ({ slide: s, bg: s.background, bgRef: s.bgRef }));
        this.prevThemeMeta = pres.theme ? { ...pres.theme } : undefined;
        for (const slide of pres.slides) {
            if (preserveImg && slide.background?.kind === "image")
                continue;
            assignSlideBackground(slide, { kind: "solid", color: theme.palette.bg });
        }
        pres.theme = {
            id: theme.id,
            name: theme.name,
            colors: {
                bg1: theme.palette.bg,
                bg2: theme.palette.bgAlt,
                tx1: theme.palette.text,
                tx2: theme.palette.textMuted,
                accent1: theme.palette.accent1,
                accent2: theme.palette.accent2,
                accent3: theme.palette.accent3,
                accent4: theme.palette.accent4,
            },
            fonts: { major: theme.fonts.title, minor: theme.fonts.body },
        };
        this.prevTextColors = syncTextColorsForTheme(pres, theme.palette);
    }
    revert(pres) {
        if (!this.prev)
            return;
        for (const { slide, bg, bgRef } of this.prev) {
            slide.background = bg;
            if (bgRef)
                slide.bgRef = bgRef;
            else
                delete slide.bgRef;
        }
        pres.theme = this.prevThemeMeta;
        restoreTextColors(this.prevTextColors);
    }
}
