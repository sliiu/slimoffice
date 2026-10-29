// Master + layout 构造（从 ThemeDef 生成母版图，供模板新建与 ApplyCustomThemeCmd 共用）。
import { identityTransform, } from "@sliiu/present-core";
import { buildDecorationShapesShared } from "./decorations.js";
function namedDecoration(d) {
    switch (d) {
        case "corner-gradient-shape": return "aurora";
        case "geometric-lines": return "ink-thread";
        case "bottom-accent-bar": return "authority";
        case "dotted-grid": return "tech-bracket";
        case undefined: return "none";
        default: return d;
    }
}
function buildMasterFromTheme(spec, theme, size, baseId) {
    // background：spec.background.kind === "solid" → 用 theme.palette.bg；否则取 theme.backgroundPaint。
    const background = theme.backgroundPaint ?? { kind: "solid", color: spec.palette.bg };
    const decoShapes = buildDecorationShapesShared(spec.decoration ?? "none", {
        palette: {
            bg: spec.palette.bg,
            bgAlt: spec.palette.bgAlt,
            text: spec.palette.text,
            textMuted: spec.palette.textMuted,
            accent1: spec.palette.accent1,
            accent2: spec.palette.accent2,
            accent3: spec.palette.accent3,
            accent4: spec.palette.accent4,
            divider: spec.palette.divider,
        },
        size,
        locked: true,
        idPrefix: `${baseId}_tpl`,
    });
    return {
        id: `${baseId}__master`,
        name: spec.name,
        background,
        shapes: decoShapes,
        layouts: [], // 由 realizeTemplate 填
        txStyles: undefined,
        clrMap: undefined,
    };
}
function layoutTuning(theme) {
    let tune;
    switch (theme.layout) {
        case "centered":
            tune = { id: "centered", align: "middle", coverAnchor: "mid", showRule: true, thickTitleRule: false, twoColRatio: 0.5, contentInset: 0, centerBody: true };
            break;
        case "editorial":
            tune = { id: "editorial", align: "start", coverAnchor: "bottom", showRule: false, thickTitleRule: true, twoColRatio: 0.62, contentInset: 0.02, mediaFrame: true };
            break;
        case "terminal":
            tune = { id: "terminal", align: "start", coverAnchor: "mid", showRule: false, thickTitleRule: false, twoColRatio: 0.5, contentInset: 0, prompt: "$ ", bodyPanel: true, panelDots: true };
            break;
        case "classic":
        default:
            tune = { id: "classic", align: "start", coverAnchor: "mid", showRule: true, thickTitleRule: false, twoColRatio: 0.5, contentInset: 0 };
            break;
    }
    // 主题级 contentPanel：在任意版式上叠一层内容卡片（深色主题用），不强制画窗口圆点。
    if (theme.contentPanel)
        tune.bodyPanel = true;
    return tune;
}
function buildLayoutsFromTheme(spec, theme, size, masterId) {
    const tune = layoutTuning(theme);
    const layouts = [];
    layouts.push({
        id: `${masterId}__layout_title`,
        name: "Title",
        type: "title",
        shapes: titleLayoutShapes(spec, theme, size, tune),
    });
    layouts.push({
        id: `${masterId}__layout_titleContent`,
        name: "Title + Content",
        type: "obj",
        shapes: titleContentLayoutShapes(spec, theme, size, tune),
    });
    layouts.push({
        id: `${masterId}__layout_twoCol`,
        name: "Two Content",
        type: "twoObj",
        shapes: twoColLayoutShapes(spec, theme, size, tune),
    });
    layouts.push({
        id: `${masterId}__layout_section`,
        name: "Section Header",
        type: "sectionHead",
        shapes: sectionHeaderLayoutShapes(spec, theme, size, tune),
    });
    layouts.push({
        id: `${masterId}__layout_blank`,
        name: "Blank",
        type: "blank",
        shapes: [],
    });
    return layouts;
}
// 把 ThemeDef.titleWordArt 烘焙进标题 run + shape，得到"艺术字"标题占位符。
function titleWordArt(theme) {
    return theme.titleWordArt;
}
/**
 * 主题 → 封面母题。显式 `coverMotif` 优先，其次按装饰语言映射，最后按 id 稳定散列
 * 兜底 —— 兜底这一步保证「装饰为 none 的 AI 主题」也不会集体撞脸。
 */
function coverMotifFor(theme) {
    if (theme.coverMotif)
        return theme.coverMotif;
    switch (namedDecoration(theme.decoration)) {
        case "authority": return "stack";
        case "manuscript": return "rule-box";
        case "ink-thread": return "spine";
        case "tech-bracket": return "bracket";
        case "terminal": return "bracket";
        case "aurora": return "halo";
        case "organic-blobs": return "blob";
        case "sunrise-arc": return "arc";
        case "gilded": return "frame";
        case "neon-burst": return "burst";
        case "confetti": return "dots";
        case "ink-wash": return "wash";
        case "masthead": return "masthead";
        default: {
            // 无装饰语言可依：按 id 散列，稳定但分散。
            const pool = ["slash", "stack", "spine", "bracket", "halo", "burst"];
            let h = 0;
            for (let i = 0; i < theme.id.length; i++)
                h = (h * 31 + theme.id.charCodeAt(i)) >>> 0;
            return pool[h % pool.length];
        }
    }
}
function coverMotifShapes(motif, c) {
    const { W, H, mx, palette, titleY, centered } = c;
    const p = (color, alpha) => solidPaint(color, alpha);
    // 左对齐母题的锚点；居中版式统一改用页面中线。
    const ax = centered ? W / 2 : mx;
    switch (motif) {
        case "stack": {
            // 三条递减横线压在标题上方：秩序感、公文/咨询报告气质。
            // 线要**够长够疏**才有版面感 —— 早期版本最长只有 13% 页宽、行距 12px，三条挤在
            // 一起像个小 "≡" 图标，反而显得局促。
            const widths = [W * 0.3, W * 0.19, W * 0.1];
            const colors = [palette.accent1, palette.accent2, palette.accent1];
            const alphas = [1, 1, 0.45];
            const gap = 18;
            return {
                shapes: widths.map((w, i) => decoRect(`dz_stack${i}`, `Rule ${i + 1}`, { x: centered ? W / 2 - w / 2 : ax, y: titleY - 74 + i * gap, w, h: 6 - i * 1.5 }, p(colors[i], alphas[i]))),
                titleDy: H * 0.03,
            };
        }
        case "rule-box": {
            // 通栏细线上下夹住标题块 = 学术论文的版心，配一枚左端方点作起始标记。
            const w = W - mx * 2;
            return {
                shapes: [
                    decoRect("dz_rule_top", "Top rule", { x: mx, y: titleY - 30, w, h: 1.5 }, p(palette.divider)),
                    decoRect("dz_rule_mark", "Rule mark", { x: mx, y: titleY - 34, w: 10, h: 10 }, p(palette.accent1)),
                    decoRect("dz_rule_bottom", "Bottom rule", { x: mx, y: c.subtitleBottom + 20, w, h: 1.5 }, p(palette.divider)),
                ],
                footer: "none",
            };
        }
        case "spine": {
            // 版心左外侧一根贯穿上下的发丝线，标题旁一小段实心 —— 画廊标签牌的语言。
            if (centered) {
                // 居中版式没有"左外侧"，改成标题正上方的一根短竖线。
                return {
                    shapes: [decoRect("dz_spine", "Spine", { x: W / 2 - 1, y: titleY - 54, w: 2, h: 34 }, p(palette.accent1))],
                };
            }
            const sx = mx - W * 0.028;
            return {
                shapes: [
                    decoRect("dz_spine", "Spine", { x: sx, y: H * 0.12, w: 1, h: H * 0.76 }, p(palette.divider)),
                    decoRect("dz_spine_mark", "Spine mark", { x: sx - 1, y: titleY + 6, w: 3, h: H * 0.09 }, p(palette.accent1)),
                ],
                footer: "corner",
            };
        }
        case "bracket": {
            // 左上 L 形角标：技术文档 / 终端的取景框语言。
            const arm = W * 0.05;
            const t = 3;
            const bx = centered ? W / 2 - arm / 2 : ax;
            const by = titleY - 44;
            return {
                shapes: [
                    decoRect("dz_bracket_h", "Bracket arm", { x: bx, y: by, w: arm, h: t }, p(palette.accent1)),
                    decoRect("dz_bracket_v", "Bracket stem", { x: bx, y: by, w: t, h: arm * 0.62 }, p(palette.accent1)),
                ],
                titleDy: H * 0.02,
                footer: "corner",
            };
        }
        case "terminal-bar": {
            // Phosphor 封面：保留终端气质，但不画 ~ $ 文字。两根递减状态条 + 左侧竖标。
            const barW = W * 0.24;
            return {
                shapes: [
                    decoRect("dz_term_tick", "Status tick", { x: ax, y: titleY - 52, w: 4, h: 22 }, p(palette.accent1)),
                    decoRect("dz_term_bar", "Status bar", { x: ax + 12, y: titleY - 44, w: barW, h: 3 }, p(palette.accent1, 0.85)),
                    decoRect("dz_term_bar2", "Status bar 2", { x: ax + 12, y: titleY - 36, w: barW * 0.42, h: 2 }, p(palette.accent2, 0.6)),
                ],
                titleDy: H * 0.015,
                footer: "corner",
            };
        }
        case "halo": {
            // 极光光斑：**出血**到左上角外，只露一段弧。之前是一枚完整圆悬在标题正上方，
            // 底边离标题只有 2px，加上标题的辉光就糊成"圆压字"。出血 + 远离文字带才像光晕
            // 而不是贴纸。
            const d = W * 0.26;
            return {
                shapes: [
                    decoEllipse("dz_halo", "Halo", { x: -d * 0.3, y: -d * 0.36, w: d, h: d }, p(palette.accent1, 0.1)),
                    decoEllipse("dz_halo_dot", "Halo dot", { x: centered ? W / 2 - 6 : ax, y: titleY - 34, w: 12, h: 12 }, p(palette.accent2)),
                ],
                titleDy: H * 0.025,
            };
        }
        case "blob": {
            // 右上角两枚柔圆，都**出血**到画布外。有机形态一旦画成一枚居中的完整正圆就变成
            // "贴上去的圆形贴纸"，很突兀；只露一部分才像自然生长进画面的形状。
            const d1 = W * 0.24, d2 = W * 0.15;
            return {
                shapes: [
                    decoEllipse("dz_blob1", "Blob", { x: W - d1 * 0.66, y: -d1 * 0.34, w: d1, h: d1 }, p(palette.accent1, 0.16)),
                    decoEllipse("dz_blob2", "Blob 2", { x: W - d1 * 0.62 - d2, y: -d2 * 0.42, w: d2, h: d2 }, p(palette.accent2, 0.2)),
                    decoRect("dz_blob_bar", "Kicker", { x: centered ? W / 2 - 24 : ax, y: titleY - 28, w: 48, h: 4 }, p(palette.accent1)),
                ],
                footer: "center",
            };
        }
        case "arc": {
            // 右下角升起的大圆弧 = 地平线上的日出；标题上方配一条细长线而非短粗条。
            const d = W * 0.62;
            return {
                shapes: [
                    decoEllipse("dz_arc", "Sun arc", { x: W - d * 0.72, y: H - d * 0.42, w: d, h: d }, p(palette.accent1, 0.12)),
                    decoRect("dz_arc_line", "Horizon line", { x: centered ? W / 2 - W * 0.11 : ax, y: titleY - 26, w: W * 0.22, h: 2 }, p(palette.accent2)),
                ],
                titleDy: -H * 0.03,
                footer: "none",
            };
        }
        case "frame": {
            // 四角细线框：高奢/礼盒的烫金边角，只画角不画整框，留白更贵。
            const inset = W * 0.035;
            const arm = W * 0.045;
            const t = 1.5;
            const gold = palette.accent2;
            const corners = [
                ["tl_h", inset, inset, arm, t],
                ["tl_v", inset, inset, t, arm],
                ["tr_h", W - inset - arm, inset, arm, t],
                ["tr_v", W - inset - t, inset, t, arm],
                ["bl_h", inset, H - inset - t, arm, t],
                ["bl_v", inset, H - inset - arm, t, arm],
                ["br_h", W - inset - arm, H - inset - t, arm, t],
                ["br_v", W - inset - t, H - inset - arm, t, arm],
            ];
            return {
                shapes: corners.map(([k, x, y, w, h]) => decoRect(`dz_frame_${k}`, "Frame corner", { x, y, w, h }, p(gold))),
                footer: "none",
            };
        }
        case "burst": {
            // 三道**同角度、等间距**的平行斜条：创意/发布会的速度感。
            // 早期版本三条各用不同角度（-28/-8/+16）又互相错位，读起来像三段随机乱码而不是
            // 一个有意为之的记号 —— 平行 + 等距是让斜线组成立的最低条件。
            const rot = -32;
            const bar = W * 0.07;
            const step = W * 0.028;
            const colors = [palette.accent1, palette.accent2, palette.accent3 ?? palette.accent1];
            const spanW = bar + step * (colors.length - 1);
            const x0 = centered ? W / 2 - spanW / 2 : ax;
            return {
                shapes: colors.map((color, i) => decoRect(`dz_burst${i}`, `Burst ${i + 1}`, { x: x0 + i * step, y: titleY - 58, w: bar, h: 6 }, p(color), { rotation: rot })),
                titleDy: H * 0.035,
                footer: "center",
            };
        }
        case "dots": {
            // 3×3 点阵：粉彩/轻盈主题，颗粒感但不抢戏。
            const r = 7;
            const gap = W * 0.026;
            const gx = centered ? W / 2 - gap : ax;
            const gy = titleY - 62;
            const shapes = [];
            for (let row = 0; row < 3; row++) {
                for (let col = 0; col < 3; col++) {
                    const fade = 1 - (row + col) * 0.12;
                    shapes.push(decoEllipse(`dz_dot_${row}${col}`, "Dot", { x: gx + col * gap, y: gy + row * gap, w: r, h: r }, p(col % 2 === 0 ? palette.accent1 : palette.accent2, fade)));
                }
            }
            return { shapes, titleDy: H * 0.035, footer: "center" };
        }
        case "wash": {
            // 右侧一整条低饱和色块（留白 : 墨色 ≈ 2:1）+ 版心内一条竖线，水墨/国风的分割。
            const bw = W * 0.24;
            if (centered) {
                // 居中标题会横穿整个版心，右侧竖条会压到字上；改成顶部横幅。
                const bh = H * 0.16;
                return {
                    shapes: [
                        decoRect("dz_wash", "Wash panel", { x: 0, y: 0, w: W, h: bh }, p(palette.accent1, 0.08)),
                        decoRect("dz_wash_edge", "Wash edge", { x: 0, y: bh, w: W, h: 2 }, p(palette.accent1, 0.35)),
                        decoRect("dz_wash_mark", "Seal mark", { x: W / 2 - 9, y: bh / 2 - 9, w: 18, h: 18 }, p(palette.accent2, 0.9)),
                    ],
                    footer: "none",
                };
            }
            return {
                shapes: [
                    decoRect("dz_wash", "Wash panel", { x: W - bw, y: 0, w: bw, h: H }, p(palette.accent1, 0.08)),
                    decoRect("dz_wash_edge", "Wash edge", { x: W - bw, y: 0, w: 2, h: H }, p(palette.accent1, 0.35)),
                    decoRect("dz_wash_mark", "Seal mark", { x: W - bw + bw / 2 - 9, y: H * 0.12, w: 18, h: 18 }, p(palette.accent2, 0.9)),
                ],
                textInsetRight: bw + W * 0.03,
                footer: "none",
            };
        }
        case "masthead": {
            // 杂志报头：通栏粗顶线 + 压在其上的次色短段。
            return {
                shapes: [
                    decoRect("dz_topline", "Overline", { x: mx, y: titleY - 26, w: W - mx * 2, h: 4 }, p(palette.accent1)),
                    decoRect("dz_kicker", "Kicker", { x: mx, y: titleY - 26, w: W * 0.16, h: 4 }, p(palette.accent2)),
                ],
            };
        }
        case "slash":
        default: {
            // 历史默认：左上斜向 ribbon + 短粗 kicker。现在只有"无装饰语言"的主题才会命中。
            if (centered) {
                return {
                    shapes: [decoRect("dz_kicker", "Kicker", { x: W / 2 - 28, y: titleY - 26, w: 56, h: 8 }, p(palette.accent1))],
                };
            }
            return {
                shapes: [
                    decoRect("dz_ribbon", "Accent ribbon", { x: mx, y: H * 0.2, w: W * 0.06, h: 6 }, p(palette.accent2), { rotation: -18 }),
                    decoRect("dz_kicker", "Kicker", { x: mx, y: H * 0.3, w: 56, h: 8 }, p(palette.accent1)),
                ],
            };
        }
    }
}
function coverFooterShapes(style, c) {
    const { W, H, mx, palette } = c;
    switch (style) {
        case "none":
            return [];
        case "center":
            return [decoRect("dz_foot", "Footer bar", { x: W / 2 - W * 0.09, y: H - 6, w: W * 0.18, h: 6 }, solidPaint(palette.accent1))];
        case "corner":
            return [
                decoRect("dz_foot", "Footer bar", { x: mx, y: H - 5, w: W * 0.1, h: 5 }, solidPaint(palette.accent1)),
                decoRect("dz_foot2", "Footer bar 2", { x: W - mx - W * 0.04, y: H - 5, w: W * 0.04, h: 5 }, solidPaint(palette.accent2)),
            ];
        case "split":
        default:
            return [
                decoRect("dz_foot", "Footer bar", { x: 0, y: H - 6, w: W * 0.55, h: 6 }, solidPaint(palette.accent1)),
                decoRect("dz_foot2", "Footer bar 2", { x: W * 0.55, y: H - 6, w: W * 0.18, h: 6 }, solidPaint(palette.accent2)),
            ];
    }
}
function titleLayoutShapes(spec, theme, size, tune) {
    const W = size.width, H = size.height;
    const mx = W * 0.08;
    const wa = titleWordArt(theme);
    const centered = tune.align === "middle";
    const baseTitleY = tune.coverAnchor === "bottom" ? H * 0.52 : H * 0.36;
    const out = [];
    // 终端封面的命令提示符：**独立成一行**放在标题上方，而不是塞在标题左边。
    // 贴在标题同一基线上时它会和标题糊成一句（"~ $ 未来已来…"），而且只要字体 / 字号 /
    // 字距一变，预留的那点宽度就不够，提示符直接压到标题头两个字上 —— 这是靠"多留点宽度"
    // 修不干净的一类 bug。真实终端本来也是提示符独占一行，换行反而更像。
    // 它按行**预留纵向空间**（整个标题块下移），这样上方母题的装饰也不会被它撞到。
    const showCoverPrompt = !!tune.prompt && theme.coverPrompt !== false;
    const promptFs = showCoverPrompt ? Math.round(theme.fontSizes.coverTitle * 0.34) : 0;
    const promptGap = showCoverPrompt ? promptFs * 1.9 : 0;
    const motif = coverMotifFor(theme);
    const ctx = {
        W,
        H,
        mx,
        palette: spec.palette,
        titleY: baseTitleY,
        subtitleBottom: baseTitleY + promptGap + theme.fontSizes.coverTitle * 1.5 + theme.fontSizes.coverSubtitle * 1.6,
        centered,
    };
    const m = coverMotifShapes(motif, ctx);
    out.push(...m.shapes);
    const titleY = baseTitleY + (m.titleDy ?? 0) + promptGap;
    const textX = centered ? mx : mx + (m.titleIndent ?? 0);
    const textW = W - mx * 2 - (centered ? 0 : m.titleIndent ?? 0) - (m.textInsetRight ?? 0);
    if (showCoverPrompt) {
        out.push(decoText("dz_prompt", "Prompt", { x: textX, y: titleY - promptGap, w: textW, h: promptFs * 1.5 }, "~ $", {
            color: spec.palette.accent1,
            fontFamily: extractFamilyName(theme.fonts.mono ?? theme.fonts.title),
            fontSize: promptFs,
            weight: wa?.weight ?? 700,
            alpha: 0.75,
            align: tune.align,
        }));
    }
    // 封面大标题（艺术字）。
    out.push(placeholderText({
        id: "ph_title",
        name: "Title 1",
        bbox: { x: textX, y: titleY, w: textW, h: theme.fontSizes.coverTitle * 1.4 },
        placeholder: { type: "ctrTitle", idx: 0 },
        defaultText: "Click to add title",
        color: wa?.color ?? spec.palette.text,
        fontFamily: extractFamilyName(theme.fonts.title),
        fontSize: theme.fontSizes.coverTitle,
        wordArt: wa,
        isTitle: true,
        align: tune.align,
        autoFit: true,
    }));
    // 副标题。
    out.push(placeholderText({
        id: "ph_subtitle",
        name: "Subtitle 2",
        bbox: { x: textX, y: titleY + theme.fontSizes.coverTitle * 1.5, w: textW, h: theme.fontSizes.coverSubtitle * 1.6 },
        placeholder: { type: "subTitle", idx: 1 },
        defaultText: "Subtitle",
        color: spec.palette.textMuted,
        fontFamily: extractFamilyName(theme.fonts.body),
        fontSize: theme.fontSizes.coverSubtitle,
        align: tune.align,
        autoFit: true,
    }));
    out.push(...coverFooterShapes(m.footer ?? (centered ? "center" : "split"), ctx));
    return out;
}
function titleContentLayoutShapes(spec, theme, size, tune) {
    const W = size.width, H = size.height;
    const mx = W * 0.06;
    const inset = W * tune.contentInset;
    const cx = mx + inset;
    const cw = W - cx * 2;
    const wa = titleWordArt(theme);
    const centered = tune.align === "middle";
    const out = [];
    if (tune.thickTitleRule) {
        // 杂志：标题上方粗顶线 + 无左侧 kicker 竖条，编辑栏目感。
        out.push(decoRect("dz_topline", "Overline", { x: cx, y: H * 0.075, w: cw, h: 4 }, solidPaint(spec.palette.accent1)));
    }
    else if (!centered) {
        // 经典/终端：标题左侧 kicker 竖条。
        out.push(decoRect("dz_kicker", "Kicker", { x: cx, y: H * 0.085, w: 6, h: theme.fontSizes.pageTitle * 1.1 }, solidPaint(spec.palette.accent1)));
    }
    else {
        // 居中：标题正上方居中短条。
        out.push(decoRect("dz_kicker", "Kicker", { x: W / 2 - 22, y: H * 0.06, w: 44, h: 6 }, solidPaint(spec.palette.accent1)));
    }
    // 终端：标题前缀提示符。
    if (tune.prompt) {
        out.push(decoText("dz_prompt", "Prompt", { x: cx, y: H * 0.085, w: W * 0.06, h: theme.fontSizes.pageTitle * 1.4 }, tune.prompt, {
            color: spec.palette.accent1,
            fontFamily: extractFamilyName(theme.fonts.title),
            fontSize: theme.fontSizes.pageTitle,
            weight: wa?.weight ?? 700,
            alpha: 0.8,
        }));
    }
    const titleX = centered ? cx : tune.thickTitleRule || tune.prompt ? cx + (tune.prompt ? W * 0.06 : 0) : cx + 18;
    out.push(placeholderText({
        id: "ph_title",
        name: "Title 1",
        bbox: { x: titleX, y: H * 0.08, w: cx + cw - titleX, h: theme.fontSizes.pageTitle * 1.4 },
        placeholder: { type: "title", idx: 0 },
        defaultText: "Click to add title",
        color: wa?.color ?? spec.palette.text,
        fontFamily: extractFamilyName(theme.fonts.title),
        fontSize: theme.fontSizes.pageTitle,
        wordArt: wa,
        isTitle: true,
        align: tune.align,
    }));
    // 标题下方细分割线（仅 showRule）；centered 用居中短线，其余贯穿版心。
    if (tune.showRule) {
        if (tune.centerBody) {
            out.push(decoRect("dz_rule", "Title rule", { x: W / 2 - W * 0.12, y: H * 0.2, w: W * 0.24, h: 1.5 }, solidPaint(spec.palette.divider)));
        }
        else {
            out.push(decoRect("dz_rule", "Title rule", { x: cx, y: H * 0.21, w: cw, h: 1 }, solidPaint(spec.palette.divider)));
        }
    }
    // 正文区底板：terminal 代码块（含窗口圆点）/ 深色主题内容卡片（无圆点）。
    const dotsExtra = tune.panelDots ? 0.018 : 0; // 有窗口圆点时顶部多留一条 title bar 空间
    if (tune.bodyPanel) {
        const px = cx - W * 0.012, py = H * (0.225 - dotsExtra), pw = cw + W * 0.024, ph = H * (0.685 + dotsExtra);
        out.push(decoPanel("dz_panel", "Content panel", { x: px, y: py, w: pw, h: ph }, spec.palette.bgAlt, 0.6, spec.palette.divider, 8));
        out.push(decoRect("dz_panel_edge", "Panel edge", { x: px, y: py, w: 3, h: ph }, solidPaint(spec.palette.accent1, 0.8)));
        if (tune.panelDots) {
            const dotColors = [spec.palette.accent4, spec.palette.accent3, spec.palette.accent1];
            dotColors.forEach((c, i) => out.push(decoEllipse(`dz_dot${i}`, "Window dot", { x: px + 16 + i * 16, y: py + 14, w: 8, h: 8 }, solidPaint(c, 0.85))));
        }
    }
    // centered 版式：正文收成居中窄栏（measure ≈ 72%），与居中标题呼应。
    const bodyW = tune.centerBody ? cw * 0.72 : tune.bodyPanel ? cw - W * 0.02 : cw;
    const bodyX = tune.centerBody ? cx + (cw - bodyW) / 2 : tune.bodyPanel ? cx + W * 0.01 : cx;
    out.push(placeholderText({
        id: "ph_body",
        name: "Content 2",
        bbox: { x: bodyX, y: tune.panelDots ? H * 0.285 : tune.bodyPanel ? H * 0.255 : H * 0.24, w: bodyW, h: tune.bodyPanel ? H * 0.6 : H * 0.64 },
        placeholder: { type: "body", idx: 1 },
        defaultText: "Click to add content",
        color: spec.palette.text,
        fontFamily: extractFamilyName(theme.fonts.body),
        fontSize: theme.fontSizes.body,
    }));
    // 页脚强调点。
    out.push(decoRect("dz_footdot", "Footer dot", { x: cx, y: H - 30, w: 18, h: 4 }, solidPaint(spec.palette.accent1)));
    return out;
}
function twoColLayoutShapes(spec, theme, size, tune) {
    const W = size.width, H = size.height;
    const mx = W * 0.06;
    const inset = W * tune.contentInset;
    const cx = mx + inset;
    const cw = W - cx * 2;
    const wa = titleWordArt(theme);
    const gutter = W * 0.03;
    // 按 tuning 比例切分左右栏（editorial 用 0.62 不对称宽左栏）。
    const leftW = (cw - gutter) * tune.twoColRatio;
    const rightW = cw - gutter - leftW;
    const colY = H * 0.24, colH = H * 0.64;
    const centered = tune.align === "middle";
    const out = [];
    if (tune.thickTitleRule) {
        out.push(decoRect("dz_topline", "Overline", { x: cx, y: H * 0.075, w: cw, h: 4 }, solidPaint(spec.palette.accent1)));
    }
    else if (!centered) {
        out.push(decoRect("dz_kicker", "Kicker", { x: cx, y: H * 0.085, w: 6, h: theme.fontSizes.pageTitle * 1.1 }, solidPaint(spec.palette.accent1)));
    }
    else {
        out.push(decoRect("dz_kicker", "Kicker", { x: W / 2 - 22, y: H * 0.06, w: 44, h: 6 }, solidPaint(spec.palette.accent1)));
    }
    const titleX = centered ? cx : tune.thickTitleRule ? cx : cx + 18;
    out.push(placeholderText({
        id: "ph_title",
        name: "Title 1",
        bbox: { x: titleX, y: H * 0.08, w: cx + cw - titleX, h: theme.fontSizes.pageTitle * 1.4 },
        placeholder: { type: "title", idx: 0 },
        defaultText: "Click to add title",
        color: wa?.color ?? spec.palette.text,
        fontFamily: extractFamilyName(theme.fonts.title),
        fontSize: theme.fontSizes.pageTitle,
        wordArt: wa,
        isTitle: true,
        align: tune.align,
    }));
    if (tune.showRule) {
        out.push(decoRect("dz_rule", "Title rule", { x: cx, y: H * 0.21, w: cw, h: 1 }, solidPaint(spec.palette.divider)));
    }
    out.push(placeholderText({
        id: "ph_left",
        name: "Content Left",
        bbox: { x: cx, y: colY, w: leftW, h: colH },
        placeholder: { type: "body", idx: 1 },
        defaultText: "Left content",
        color: spec.palette.text,
        fontFamily: extractFamilyName(theme.fonts.body),
        fontSize: theme.fontSizes.body,
    }));
    if (tune.mediaFrame) {
        // 图文左右版：右栏改为媒体占位框（底板 + 细边 + 居中提示 + 对角斜线暗示"待插图"）。
        const fx = cx + leftW + gutter, fw = rightW;
        out.push(decoPanel("dz_media", "Media frame", { x: fx, y: colY, w: fw, h: colH }, spec.palette.bgAlt, 0.7, spec.palette.accent1, 6));
        out.push(decoRect("dz_media_bar", "Media caption bar", { x: fx, y: colY + colH - 10, w: fw, h: 4 }, solidPaint(spec.palette.accent1, 0.85)));
        out.push(decoText("dz_media_hint", "Media hint", { x: fx, y: colY + colH / 2 - 22, w: fw, h: 44 }, "▦", {
            color: spec.palette.textMuted,
            fontFamily: extractFamilyName(theme.fonts.body),
            fontSize: 40,
            weight: 400,
            alpha: 0.5,
            align: "middle",
        }));
    }
    else {
        // 中缝分割线。
        out.push(decoRect("dz_divider", "Divider", { x: cx + leftW + gutter / 2, y: colY, w: 1.5, h: colH }, solidPaint(spec.palette.divider)));
        out.push(placeholderText({
            id: "ph_right",
            name: "Content Right",
            bbox: { x: cx + leftW + gutter, y: colY, w: rightW, h: colH },
            placeholder: { type: "body", idx: 2 },
            defaultText: "Right content",
            color: spec.palette.text,
            fontFamily: extractFamilyName(theme.fonts.body),
            fontSize: theme.fontSizes.body,
        }));
    }
    return out;
}
function sectionHeaderLayoutShapes(spec, theme, size, tune) {
    const W = size.width, H = size.height;
    const mx = W * 0.1;
    const wa = titleWordArt(theme);
    const centered = tune.align === "middle";
    const out = [];
    // 变形点缀：右侧一枚旋转的大色块（半透明），作为章节页的主视觉变形元素。
    out.push(decoRect("dz_shard", "Section shard", { x: W * 0.78, y: H * 0.18, w: W * 0.22, h: W * 0.22 }, solidPaint(spec.palette.accent1, 0.1), { rotation: 18 }));
    // 巨大且低饱和的章节序号（装饰，不可编辑）；居中版放标题正上方居中。
    out.push(decoText("dz_num", "Section number", { x: centered ? 0 : mx, y: H * 0.18, w: centered ? W : W * 0.5, h: 120 }, "01", {
        color: spec.palette.accent1,
        fontFamily: extractFamilyName(theme.fonts.title),
        fontSize: 96,
        weight: wa?.weight ?? 800,
        alpha: 0.85,
        align: tune.align,
    }));
    // kicker 短条。
    out.push(decoRect("dz_kicker", "Kicker", { x: centered ? W / 2 - 28 : mx, y: H * 0.46, w: 56, h: 8 }, solidPaint(spec.palette.accent2)));
    out.push(placeholderText({
        id: "ph_title",
        name: "Section Title",
        bbox: { x: mx, y: H * 0.5, w: W - mx * 2, h: theme.fontSizes.sectionTitle * 1.4 },
        placeholder: { type: "title", idx: 0 },
        defaultText: "Section title",
        color: wa?.color ?? spec.palette.text,
        fontFamily: extractFamilyName(theme.fonts.title),
        fontSize: theme.fontSizes.sectionTitle,
        wordArt: wa,
        isTitle: true,
        align: tune.align,
    }));
    out.push(placeholderText({
        id: "ph_caption",
        name: "Section Caption",
        bbox: { x: mx, y: H * 0.5 + theme.fontSizes.sectionTitle * 1.5, w: W - mx * 2, h: theme.fontSizes.body * 1.6 },
        placeholder: { type: "body", idx: 1 },
        defaultText: "Section caption",
        color: spec.palette.textMuted,
        fontFamily: extractFamilyName(theme.fonts.body),
        fontSize: theme.fontSizes.body,
        align: tune.align,
    }));
    return out;
}
// ---------------------------------------------------------------------------
// shape helper
// ---------------------------------------------------------------------------
function solidPaint(color, alpha) {
    return (alpha === undefined ? { kind: "solid", color } : { kind: "solid", color, alpha });
}
// 装饰矩形（非占位符，locked，可选变形旋转）。
function decoRect(id, name, bbox, fill, opts = {}) {
    const transform = identityTransform();
    if (opts.rotation)
        transform.rotation = opts.rotation;
    return {
        id,
        kind: "rect",
        name,
        bbox,
        zIndex: 0,
        visible: true,
        locked: true,
        opacity: 1,
        transform,
        fill,
    };
}
// 装饰椭圆（非占位符，locked）——终端代码窗口的"红黄绿"圆点等。
function decoEllipse(id, name, bbox, fill) {
    return {
        id,
        kind: "ellipse",
        name,
        bbox,
        zIndex: 0,
        visible: true,
        locked: true,
        opacity: 1,
        transform: identityTransform(),
        fill,
    };
}
// 装饰面板（非占位符，locked）——带圆角 + 描边的底板，用于代码块 / 媒体占位框。
function decoPanel(id, name, bbox, fillColor, fillAlpha, strokeColor, rx) {
    return {
        id,
        kind: "rect",
        name,
        bbox,
        rx,
        zIndex: 0,
        visible: true,
        locked: true,
        opacity: 1,
        transform: identityTransform(),
        fill: { kind: "solid", color: fillColor, alpha: fillAlpha },
        stroke: { paint: { kind: "solid", color: strokeColor, alpha: 0.5 }, width: 1 },
    };
}
// 装饰文字（非占位符，locked）——用于章节大序号等不可编辑的主题视觉元素。
function decoText(id, name, bbox, text, style) {
    return {
        id,
        kind: "text",
        name,
        bbox,
        zIndex: 0,
        visible: true,
        locked: true,
        opacity: style.alpha ?? 1,
        transform: identityTransform(),
        paragraphs: [
            {
                ...(style.align ? { align: style.align } : {}),
                runs: [
                    {
                        text,
                        fontFamily: style.fontFamily,
                        fontSize: style.fontSize,
                        fontWeight: style.weight ?? 800,
                        color: style.color,
                    },
                ],
            },
        ],
    };
}
// ---------------------------------------------------------------------------
// Placeholder text helper（含艺术字烘焙）
// ---------------------------------------------------------------------------
function placeholderText(args) {
    const isTitle = !!args.isTitle;
    const wa = isTitle ? args.wordArt : undefined;
    const run = {
        text: args.defaultText,
        fontFamily: args.fontFamily,
        fontSize: args.fontSize,
        color: args.color,
        fontWeight: wa?.weight ?? (isTitle ? 700 : 400),
    };
    if (wa?.letterSpacing !== undefined)
        run.letterSpacing = wa.letterSpacing;
    if (wa?.caps)
        run.caps = "all";
    if (wa?.outlineColor && wa.outlineWidth) {
        run.textOutline = { paint: { kind: "solid", color: wa.outlineColor }, width: wa.outlineWidth };
    }
    const paragraph = { runs: [run] };
    if (args.align && args.align !== "start")
        paragraph.align = args.align;
    const shape = {
        id: args.id,
        kind: "text",
        name: args.name,
        bbox: args.bbox,
        visible: true,
        locked: false,
        opacity: 1,
        transform: identityTransform(),
        paragraphs: [paragraph],
        placeholder: { type: args.placeholder.type, idx: args.placeholder.idx },
    };
    if (args.autoFit)
        shape.autoFit = { kind: "normAutofit" };
    // 标题阴影 / 变形：烘焙到 shape 级，使用户输入标题即继承。
    if (wa?.shadow) {
        shape.shadow = {
            kind: "outer",
            blur: wa.shadow.blur,
            dx: wa.shadow.dx,
            dy: wa.shadow.dy,
            color: wa.shadow.color,
            alpha: wa.shadow.alpha,
        };
    }
    return shape;
}
function extractFamilyName(stack) {
    // ThemeDef.fonts 是 CSS font-stack（多字体 fallback 链）。模板需要单一字体名。
    // 取第一个引号或第一个逗号前的部分。
    const m = stack.trim().match(/^"([^"]+)"|^'([^']+)'|^([^,]+)/);
    return (m?.[1] ?? m?.[2] ?? m?.[3] ?? stack).trim();
}
/** ThemeDef → GeneratedThemeSpec（无 LLM，供母版构建与模板合成共用）。 */
export function themeSpecFromThemeDef(theme, spec) {
    return (spec ??
        {
            name: theme.name,
            description: theme.description,
            mode: "light",
            palette: {
                bg: theme.palette.bg,
                bgAlt: theme.palette.bgAlt,
                text: theme.palette.text,
                textMuted: theme.palette.textMuted,
                accent1: theme.palette.accent1,
                accent2: theme.palette.accent2,
                accent3: theme.palette.accent3,
                accent4: theme.palette.accent4,
                divider: theme.palette.divider,
            },
            background: { kind: "solid" },
            fonts: {
                title: extractFamilyName(theme.fonts.title),
                body: extractFamilyName(theme.fonts.body),
                mono: extractFamilyName(theme.fonts.mono),
            },
            decoration: namedDecoration(theme.decoration),
        });
}
export function buildCoreThemeFromSpec(spec, theme, themeId) {
    return {
        id: themeId,
        name: spec.name,
        colors: {
            bg: spec.palette.bg,
            bgAlt: spec.palette.bgAlt,
            text: spec.palette.text,
            textMuted: spec.palette.textMuted,
            accent1: spec.palette.accent1,
            accent2: spec.palette.accent2,
            accent3: spec.palette.accent3,
            accent4: spec.palette.accent4,
            divider: spec.palette.divider,
            bg1: spec.palette.bg,
            bg2: spec.palette.bgAlt,
            tx1: spec.palette.text,
            tx2: spec.palette.textMuted,
        },
        fonts: {
            major: extractFamilyName(theme.fonts.title),
            minor: extractFamilyName(theme.fonts.body),
        },
    };
}
/** 从 ThemeDef 构建完整母版 + 版式（与 template picker / 新建 deck 同源）。 */
export function buildMastersFromThemeDef(theme, size, baseId, spec) {
    const resolvedSpec = themeSpecFromThemeDef(theme, spec);
    const master = buildMasterFromTheme(resolvedSpec, theme, size, baseId);
    master.layouts = buildLayoutsFromTheme(resolvedSpec, theme, size, master.id);
    const coreTheme = buildCoreThemeFromSpec(resolvedSpec, theme, theme.id);
    return { masters: [master], coreTheme };
}
/** 套用主题后按版式 type 为 slide 重绑 layoutRef。 */
export function resolveLayoutTypeForSlide(slide, index, prevMasters) {
    if (slide.layoutRef && prevMasters) {
        const master = prevMasters.find((m) => m.id === slide.layoutRef.masterId);
        const layout = master?.layouts?.find((l) => l.id === slide.layoutRef.layoutId);
        if (layout?.type)
            return layout.type;
    }
    return index === 0 ? "title" : "obj";
}
export function findLayoutRefByType(masters, layoutType) {
    const master = masters[0];
    if (!master?.layouts)
        return undefined;
    const layout = master.layouts.find((l) => l.type === layoutType);
    if (!layout)
        return undefined;
    return { masterId: master.id, layoutId: layout.id };
}
/** 清除 slide 层遗留的 dec_*（母版路径下装饰改由 compose 合成）。 */
export function stripSlideThemeDecorations(slide) {
    for (const layer of slide.layers) {
        layer.shapes = layer.shapes.filter((sh) => !sh.id.startsWith("dec_"));
    }
}
