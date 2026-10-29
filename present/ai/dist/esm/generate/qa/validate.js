// 生成后确定性质检 + 自动修复 pass（post-compile QA）。
//
// 背景：ppt-deck-workflow 的 P0 checklist、ppt-visual-design 的 ripple-effect 兜底
// 目前**只存在于给 LLM 看的 prompt 文本**里 —— 弱模型（DeepSeek / Moonshot / 本地）
// 经常忽略，导致"深色底上留了深色标题""hero 图盖住文字"这类可读性事故。
//
// 本模块把其中**可以纯几何/颜色推导、不需要再问模型**的规则落成代码，在
// generateFromOutline 的 compile + enrich 之后、animate 之前跑一遍：
//   1. 对比度修复：每个文字 shape 相对其"有效底色"算 WCAG 对比度，不达标就翻到
//      规范里的兜底色（深底 #f8fafc / 亮底 #0f172a）。
//   2. 图层修复：盖住文字的大图 / 大色块（hero 图、误插的 backdrop）自动 reorder
//      到文字下方（对应 ppt-design-rules §2 与 images.ts:190 的 z-order 缺陷）。
//   3. 出血修复：完全/大幅出画布的 shape 拉回画布内。
//   3b. 放不进框的文字打开缩排（normAutofit），不挪框。
//   4. 节奏告警（不改内容，仅返回诊断）：封面非 hero/cover、结尾非 closing/hero、
//      连续 >2 页纯文字。留给调用方在 debug 下打印，或未来回喂 outline 重生成。
//
// 设计约束：
//   - **保守**：只在"明显坏"时修（对比度真的不足、图真的压住文字、真的出画布），
//     绝不主动"美化"已经 OK 的 slide，避免破坏刻意的设计。
//   - **通用**：所有判断基于 IR（bbox / fill / paragraphs），不针对任何具体主题 /
//     具体 PPT 硬编码。
//   - 直接原地 mutate `pres`，同时返回一份可读的 report 供日志 / 未来 UI 使用。
import { contrastRatio, parseHex, readableTextColor, toHex, WCAG_BODY_TEXT_CONTRAST, WCAG_LARGE_TEXT_CONTRAST, } from "./color.js";
function intersectionArea(a, b) {
    const x1 = Math.max(a.x, b.x);
    const y1 = Math.max(a.y, b.y);
    const x2 = Math.min(a.x + a.w, b.x + b.w);
    const y2 = Math.min(a.y + a.h, b.y + b.h);
    if (x2 <= x1 || y2 <= y1)
        return 0;
    return (x2 - x1) * (y2 - y1);
}
function area(b) {
    return Math.max(0, b.w) * Math.max(0, b.h);
}
function centerIn(inner, outer) {
    const cx = inner.x + inner.w / 2;
    const cy = inner.y + inner.h / 2;
    return cx >= outer.x && cx <= outer.x + outer.w && cy >= outer.y && cy <= outer.y + outer.h;
}
// ---------------------------------------------------------------------------
// Paint → 代表色。与 tools/index.ts 的 paintSummary 取色策略保持一致
// （gradient 取中间 stop）。
// ---------------------------------------------------------------------------
function paintMainColor(p) {
    if (!p)
        return null;
    switch (p.kind) {
        case "solid":
            return p.color;
        case "linear":
        case "radial": {
            const stops = p.stops ?? [];
            const mid = stops.find((s) => s.offset >= 0.5) ?? stops[Math.floor(stops.length / 2)] ?? stops[0];
            return mid?.color ?? null;
        }
        default:
            return null;
    }
}
// 装饰 / 非内容 shape 判定：dec_* 主题装饰、BG overlay、accent 短条等，不参与对比度/图层修复。
function isDecorationId(id) {
    return id.startsWith("dec_") || id.startsWith("bgov_");
}
function isOverlayName(name) {
    return name === "BG overlay";
}
// 判断一个 text shape 是不是"大文字"（标题 / 大数字），用来选对比度阈值。
function isLargeText(t) {
    // 取首个非空 run 的字号 / 字重。
    for (const para of t.paragraphs) {
        for (const run of para.runs) {
            if (run.text && run.text.length > 0) {
                const size = typeof run.fontSize === "number" ? run.fontSize : undefined;
                const weight = typeof run.fontWeight === "number" ? run.fontWeight : run.fontWeight === "bold" ? 700 : 400;
                if (size !== undefined) {
                    // WCAG large text: ≥24px 常规，或 ≥18.66px 且 bold。
                    return size >= 24 || (size >= 19 && weight >= 700);
                }
                break;
            }
        }
    }
    // 无字号信息时按角色名兜底。
    const n = (t.name ?? "").toLowerCase();
    return (n.includes("title") || n.includes("value") || n.includes("hero") || n.includes("eyebrow") || n.includes("quote"));
}
/** Hollow (outline-only) art type: no fill, glyphs drawn by the stroke. */
function isHollowRun(run) {
    return (run.color === "transparent" || run.color === "none") && run.textOutline?.paint.kind === "solid";
}
/**
 * The colour a run visibly reads in: the outline paint for hollow type, the first stop for a
 * gradient fill, else `color`. Treating hollow type as "missing color" used to flood-fill every
 * outlined cover title with the safe text colour.
 */
export function effectiveRunColor(run) {
    if (isHollowRun(run))
        return run.textOutline.paint.color;
    if (run.fill && (run.fill.kind === "linear" || run.fill.kind === "radial"))
        return run.fill.stops?.[0]?.color ?? run.color;
    return run.color;
}
function firstRunColor(t) {
    for (const para of t.paragraphs) {
        for (const run of para.runs) {
            if (run.text && run.text.length > 0)
                return effectiveRunColor(run);
        }
    }
    return undefined;
}
/** 把一个 text shape 的所有 run 统一改成给定颜色（空心字改描边色；渐变填充退回实色）。 */
function recolorText(t, color) {
    for (const para of t.paragraphs) {
        for (const run of para.runs) {
            if (isHollowRun(run)) {
                run.textOutline = { ...run.textOutline, paint: { kind: "solid", color } };
                continue;
            }
            if (run.fill && run.fill.kind !== "solid")
                delete run.fill;
            run.color = color;
        }
        if (para.defRunStyle)
            para.defRunStyle.color = color;
    }
}
// ---------------------------------------------------------------------------
// 有效底色推导：某个文字 shape 视觉上"坐"在什么颜色上。
//   优先级：位于其下方且实心覆盖它的 backdrop 色块 > slide 背景。
// 返回 { color: Rgb, known: bool }；known=false 表示无法可靠判断（如图片底且无 overlay），
// 此时跳过对比度修复以免误改。
// ---------------------------------------------------------------------------
function resolveEffectiveBg(slide, layerShapes, textIndex, presThemeBg) {
    const text = layerShapes[textIndex];
    const tb = text.bbox;
    // 1) backdrop：在文字**下方**（更低 index）、实心/渐变、且几何上覆盖文字的最上层色块。
    for (let i = textIndex - 1; i >= 0; i--) {
        const sh = layerShapes[i];
        if (!sh || !sh.visible)
            continue;
        if (sh.kind === "text" || sh.kind === "image" || sh.kind === "line")
            continue;
        if (isDecorationId(sh.id) || isOverlayName(sh.name))
            continue;
        const fill = sh.fill;
        if (!fill || (fill.kind !== "solid" && fill.kind !== "linear" && fill.kind !== "radial"))
            continue;
        // 半透明色块不算可靠 backdrop。
        const fillAlpha = fill.kind === "solid" ? fill.alpha ?? 1 : 1;
        if (fillAlpha < 0.6)
            continue;
        const bb = sh.bbox;
        const covers = centerIn(tb, bb) && intersectionArea(tb, bb) / Math.max(1, area(tb)) >= 0.6;
        if (!covers)
            continue;
        const c = parseHex(paintMainColor(fill) ?? undefined);
        if (c)
            return { rgb: c, known: true };
    }
    // 2) slide 背景。
    const bg = slide.background;
    if (bg?.kind === "image") {
        // 有 BG overlay（半透明黑）→ 视为暗底；否则未知（跳过修复）。
        const hasOverlay = layerShapes.some((s) => isOverlayName(s.name) && s.visible);
        if (hasOverlay)
            return { rgb: { r: 20, g: 20, b: 20 }, known: true };
        return { rgb: { r: 128, g: 128, b: 128 }, known: false };
    }
    const bgColor = parseHex(paintMainColor(bg) ?? presThemeBg);
    if (bgColor)
        return { rgb: bgColor, known: true };
    return null;
}
/**
 * What a text shape visually sits on, for read-only summaries (art-director / tools):
 * the hex of the backdrop shape or slide field, `"image"` for an unscrimmed photo, or
 * `undefined` when nothing can be determined. Same rule as the contrast repair uses.
 */
export function effectiveBackdropForText(slide, text, presThemeBg) {
    for (const layer of slide.layers) {
        const idx = layer.shapes.indexOf(text);
        if (idx < 0)
            continue;
        const eff = resolveEffectiveBg(slide, layer.shapes, idx, presThemeBg);
        const scrim = slide.background?.kind === "image" && layer.shapes.some((s) => isOverlayName(s.name) && s.visible);
        if (!eff)
            return undefined;
        if (!eff.known)
            return { on: "image", scrim };
        return { on: toHex(eff.rgb), scrim };
    }
    return undefined;
}
/** Palette text candidates in preference order: ink (light bg), onPhoto / bg (dark bg), then muted. Keeps the token's original hex spelling. */
export function paletteTextCandidates(colors) {
    if (!colors)
        return [];
    const keys = ["ink", "onPhoto", "bg", "tx1", "bg1", "muted"];
    const out = [];
    for (const k of keys) {
        const hex = colors[k];
        const rgb = parseHex(hex);
        if (hex && rgb && !out.some((o) => toHex(o.rgb) === toHex(rgb)))
            out.push({ hex: hex.trim(), rgb });
    }
    return out;
}
/** First palette token (in preference order) that clears `threshold` on `bg`; safe color only as a last resort. */
export function pickRepairColor(bg, threshold, candidates) {
    for (const c of candidates) {
        if (contrastRatio(c.rgb, bg) >= threshold)
            return c.hex;
    }
    return readableTextColor(bg);
}
// ---------------------------------------------------------------------------
// 主入口。
// ---------------------------------------------------------------------------
export function validateAndRepairPresentation(pres, opts = {}) {
    const largeThreshold = opts.largeTextContrast ?? WCAG_LARGE_TEXT_CONTRAST;
    const bodyThreshold = opts.bodyTextContrast ?? WCAG_BODY_TEXT_CONTRAST;
    const presThemeBg = pres.theme?.colors?.["bg1"];
    const paletteTargets = paletteTextCandidates(pres.theme?.colors);
    const fixes = [];
    const warnings = [];
    pres.slides.forEach((slide, slideIdx) => {
        for (const layer of slide.layers) {
            // ---- 1) 图层修复：盖住文字的图片 / 大色块下沉到文字之下 ----
            repairCoveringShapes(layer.shapes, slideIdx, fixes);
            // ---- 2) 对比度修复 ----
            layer.shapes.forEach((sh, idx) => {
                if (sh.kind !== "text")
                    return;
                if (isDecorationId(sh.id) || isOverlayName(sh.name))
                    return;
                const t = sh;
                // 空文字（占位）跳过。
                const hasText = t.paragraphs.some((p) => p.runs.some((r) => r.text && r.text.trim().length > 0));
                if (!hasText)
                    return;
                const eff = resolveEffectiveBg(slide, layer.shapes, idx, presThemeBg);
                if (!eff || !eff.known)
                    return;
                const current = parseHex(firstRunColor(t));
                const threshold = isLargeText(t) ? largeThreshold : bodyThreshold;
                // 当前色缺失 → 直接补一个可读色；当前色存在但对比不足 → 翻色。
                const ratio = current ? contrastRatio(current, eff.rgb) : 0;
                if (current && ratio >= threshold)
                    return;
                const target = pickRepairColor(eff.rgb, threshold, paletteTargets);
                // 若 target 与当前一致（极少数），无需改。
                if (current && target.toLowerCase() === (firstRunColor(t) ?? "").toLowerCase())
                    return;
                recolorText(t, target);
                fixes.push({
                    slide: slideIdx,
                    kind: "contrast",
                    detail: `${t.name ?? "text"}: ${current ? `contrast ${ratio.toFixed(2)}<${threshold}` : "missing color"} → ${target}`,
                });
            });
            // ---- 3) 出血修复：文字 shape 明显出画布时拉回 ----
            layer.shapes.forEach((sh) => {
                if (sh.kind !== "text")
                    return;
                const b = sh.bbox;
                const W = pres.size.width;
                const H = pres.size.height;
                let nx = b.x;
                let ny = b.y;
                let changed = false;
                // 只在"明显出界"时修（负坐标，或超出 > 2px）。
                if (b.x < 0) {
                    nx = 0;
                    changed = true;
                }
                else if (b.x + b.w > W + 2) {
                    nx = Math.max(0, W - b.w);
                    changed = true;
                }
                if (b.y < 0) {
                    ny = 0;
                    changed = true;
                }
                else if (b.y + b.h > H + 2) {
                    ny = Math.max(0, H - b.h);
                    changed = true;
                }
                if (changed) {
                    b.x = nx;
                    b.y = ny;
                    fixes.push({ slide: slideIdx, kind: "offcanvas", detail: `${sh.name ?? "text"} clamped into canvas` });
                }
            });
            // ---- 3b) 框里放不下的字：缩排，不挪框 ----
            repairTextOverflow(layer.shapes, slideIdx, fixes);
        }
    });
    // ---- 4) 叙事节奏告警（不改内容） ----
    const kinds = opts.slideKinds;
    if (kinds && kinds.length > 0) {
        const first = kinds[0];
        if (first && first !== "cover" && first !== "hero") {
            warnings.push(`opener is "${first}" — prefer cover/hero for a strong start`);
        }
        const last = kinds[kinds.length - 1];
        if (last && last !== "closing" && last !== "hero") {
            warnings.push(`closer is "${last}" — prefer closing/hero for a strong ending`);
        }
        let run = 0;
        const textOnly = new Set(["bullets", "content", "agenda"]);
        for (const k of kinds) {
            if (textOnly.has(k)) {
                run += 1;
                if (run === 3) {
                    warnings.push(">2 consecutive text-only slides — insert a hero/stat/cards/metrics/image-text to break rhythm");
                }
            }
            else {
                run = 0;
            }
        }
    }
    // ---- 5) ppt-deck-workflow P0 checklist 的确定性落地（skill 承诺 → 机器检查） ----
    checkLayoutDiversity(kinds, warnings);
    checkImageryRate(pres, warnings);
    repairPlaceholderResidue(pres, fixes, warnings);
    checkCoverClosingVisualAnchor(pres, warnings);
    checkSpeakerNotesCoverage(pres, warnings);
    return { fixes, warnings };
}
function glyphUnits(text) {
    let n = 0;
    for (const ch of text)
        n += /[\u2e80-\u9fff]/.test(ch) ? 1 : 0.55;
    return n;
}
/** 按字号和框的内沿估计行数。放得下就返回 false，渲染期缩排不会再动它。 */
export function textBoxOverflows(shape) {
    const size = shape.paragraphs[0]?.runs[0]?.fontSize ?? shape.paragraphs[0]?.defRunStyle?.fontSize ?? 18;
    const innerW = Math.max(1, shape.bbox.w - 19);
    const innerH = Math.max(1, shape.bbox.h - 8);
    let lines = 0;
    for (const para of shape.paragraphs) {
        const text = para.runs.map((run) => run.text ?? "").join("");
        if (!text)
            continue;
        lines += Math.max(1, Math.ceil((glyphUnits(text) * size) / innerW));
    }
    if (lines === 0)
        return false;
    return lines * size * 1.35 > innerH + 1;
}
function repairTextOverflow(shapes, slideIdx, fixes) {
    for (const shape of shapes) {
        if (shape.kind === "group") {
            repairTextOverflow(shape.children, slideIdx, fixes);
            continue;
        }
        if (shape.kind !== "text")
            continue;
        if (isDecorationId(shape.id) || isOverlayName(shape.name))
            continue;
        if (shape.autoFit?.kind === "normAutofit" || shape.autoFit?.kind === "spAutoFit")
            continue;
        if (!textBoxOverflows(shape))
            continue;
        shape.autoFit = { kind: "normAutofit" };
        fixes.push({ slide: slideIdx, kind: "autofit", detail: `${shape.name ?? "text"} shrinks to fit its box` });
    }
}
// ---------------------------------------------------------------------------
// P0 checklist 确定性检查（对应 .cursor/skills/ppt-deck-workflow P0 质检清单）。
// 这些之前只写在 prompt 里，弱模型经常忽略 —— 现在生成后统一机器验收。
// 前三项能自动修的自动修（placeholder 残留），其余产出结构化 warning。
// ---------------------------------------------------------------------------
/**
 * 版式多样性：同一 kind 连续 ≥3 页，或（≥6 页的 deck）单一 kind 占比 >50% → 告警。
 * skill 要求"相邻页不重复同版式、全 deck 版式有节奏变化"。
 */
function checkLayoutDiversity(kinds, warnings) {
    if (!kinds || kinds.length < 4)
        return;
    let run = 1;
    for (let i = 1; i < kinds.length; i++) {
        if (kinds[i] === kinds[i - 1]) {
            run += 1;
            if (run === 3) {
                warnings.push(`layout diversity: 3+ consecutive "${kinds[i]}" slides (around slide ${i + 1}) — vary the layout`);
            }
        }
        else {
            run = 1;
        }
    }
    if (kinds.length >= 6) {
        const counts = new Map();
        for (const k of kinds)
            counts.set(k, (counts.get(k) ?? 0) + 1);
        for (const [k, n] of counts) {
            if (k !== "cover" && k !== "closing" && n / kinds.length > 0.5) {
                warnings.push(`layout diversity: "${k}" is ${n}/${kinds.length} of the deck — mix in other layouts`);
            }
        }
    }
}
/** slide 是否含有"视觉锚点"（图片背景 / 图片 / 图表 / 大面积非装饰色块）。 */
function slideHasVisual(slide, presW, presH) {
    if (slide.background?.kind === "image")
        return true;
    for (const layer of slide.layers) {
        for (const sh of layer.shapes) {
            if (!sh.visible)
                continue;
            if (isOverlayName(sh.name))
                continue;
            if (sh.kind === "image" || sh.kind === "chart" || sh.kind === "video")
                return true;
            // 大面积非装饰形状（>15% 画布）也算视觉元素（色块构成的编辑设计）。
            if ((sh.kind === "rect" || sh.kind === "ellipse" || sh.kind === "path" || sh.kind === "polygon") && !isDecorationId(sh.id)) {
                const b = sh.bbox;
                if (area(b) / Math.max(1, presW * presH) > 0.15 && sh.fill && sh.fill.kind !== "none")
                    return true;
            }
        }
    }
    return false;
}
/**
 * 配图率：内容页（除封面/结尾外）中含视觉锚点的比例 <40% → 告警。
 * skill 要求"配图率达标，纯文字页不超过节奏预算"。
 */
function checkImageryRate(pres, warnings) {
    if (pres.slides.length < 4)
        return;
    const inner = pres.slides.slice(1, -1);
    if (inner.length === 0)
        return;
    const withVisual = inner.filter((s) => slideHasVisual(s, pres.size.width, pres.size.height)).length;
    const rate = withVisual / inner.length;
    if (rate < 0.4) {
        warnings.push(`imagery rate: only ${withVisual}/${inner.length} content slides have any visual (image/chart/graphic) — target ≥40%; add hero/stat/image-text layouts or fillImagePlaceholders`);
    }
}
/**
 * 占位符残留清理：enrich 抓图失败时 compile 留下的 "Image placeholder" 灰块 +
 * "Image hint" 文字如果还在，导出就是半成品。成对删除并记 fix；文本内容里的
 * 模板残留（lorem / {{...}} / TODO）删不得（可能是刻意内容），仅告警。
 */
function repairPlaceholderResidue(pres, fixes, warnings) {
    pres.slides.forEach((slide, slideIdx) => {
        for (const layer of slide.layers) {
            const residue = layer.shapes.filter((sh) => sh.name === "Image placeholder" || sh.name === "Image hint");
            if (residue.length > 0) {
                layer.shapes = layer.shapes.filter((sh) => !residue.includes(sh));
                fixes.push({
                    slide: slideIdx,
                    kind: "placeholder",
                    detail: `removed ${residue.length} unfilled image placeholder shape(s)`,
                });
            }
            for (const sh of layer.shapes) {
                if (sh.kind !== "text")
                    continue;
                const text = sh.paragraphs
                    .map((p) => p.runs.map((r) => r.text ?? "").join(""))
                    .join("\n");
                if (/lorem ipsum|\{\{[^}]*\}\}|\bTODO\b|\bTBD\b/i.test(text)) {
                    warnings.push(`slide ${slideIdx + 1}: template residue in "${sh.name ?? sh.id}" — replace with real content`);
                }
            }
        }
    });
}
/**
 * 演讲备注覆盖率：skill Step 6 要求每页有 notes。<60% 覆盖时告警
 * （notes 是内容创作，无法确定性伪造，留给上层重新生成或用户补写）。
 */
function checkSpeakerNotesCoverage(pres, warnings) {
    if (pres.slides.length < 3)
        return;
    const withNotes = pres.slides.filter((s) => s.notes && s.notes.trim().length > 0).length;
    if (withNotes / pres.slides.length < 0.6) {
        warnings.push(`speaker notes: only ${withNotes}/${pres.slides.length} slides have notes — skill Step 6 expects notes on every slide (use setSlideNotes to fill in)`);
    }
}
/**
 * 封面/结尾视觉锚点：skill 要求 cover 与 closing 必须有图或图形构成
 * （全文字封面 = 最常见的"AI 味"）。缺失时告警（配图无法确定性伪造）。
 */
function checkCoverClosingVisualAnchor(pres, warnings) {
    if (pres.slides.length === 0)
        return;
    const W = pres.size.width;
    const H = pres.size.height;
    const cover = pres.slides[0];
    if (!slideHasVisual(cover, W, H)) {
        warnings.push("cover slide has no visual anchor (image/graphic) — add a bg image or large accent graphic");
    }
    if (pres.slides.length >= 2) {
        const closing = pres.slides[pres.slides.length - 1];
        if (!slideHasVisual(closing, W, H)) {
            warnings.push("closing slide has no visual anchor — mirror the cover treatment for a strong ending");
        }
    }
}
// ---------------------------------------------------------------------------
// 图层修复实现：把"盖住文字的图片 / 大实心色块"下沉到它所覆盖的最上层文字之下。
//
// 判定一个 shape 是"遮挡者"：
//   - kind=image（非 BG overlay），或 kind=rect/ellipse 且几乎全屏（>55% 画布）；
//   - 且它在数组里位于某个文字 shape **之上**（更高 index）；
//   - 且它与该文字 bbox 有实质重叠（交集 / 文字面积 > 0.12）。
// 修复：把遮挡者移动到它所覆盖的最低 index 文字之前（即下沉到文字之下）。
// ---------------------------------------------------------------------------
function repairCoveringShapes(shapes, slideIdx, fixes) {
    // 多次遍历直到稳定（一次移动可能改变 index）；上限防御性设 shapes.length。
    for (let pass = 0; pass < shapes.length; pass++) {
        let moved = false;
        for (let i = 0; i < shapes.length; i++) {
            const sh = shapes[i];
            if (!sh || !sh.visible)
                continue;
            if (isDecorationId(sh.id) || isOverlayName(sh.name))
                continue;
            const isImage = sh.kind === "image";
            const isBigFill = (sh.kind === "rect" || sh.kind === "ellipse") &&
                sh.fill != null &&
                sh.fill.kind !== "none";
            if (!isImage && !isBigFill)
                continue;
            const shBox = sh.bbox;
            // 找它上方（更低 index）的、被它盖住的文字 —— 若存在，说明遮挡者在文字之上。
            let lowestCoveredTextIdx = -1;
            for (let j = 0; j < i; j++) {
                const other = shapes[j];
                if (!other || other.kind !== "text" || !other.visible)
                    continue;
                if (isDecorationId(other.id))
                    continue;
                const tb = other.bbox;
                const hasText = other.paragraphs.some((p) => p.runs.some((r) => r.text && r.text.trim().length > 0));
                if (!hasText)
                    continue;
                const overlap = intersectionArea(shBox, tb) / Math.max(1, area(tb));
                if (overlap > 0.12) {
                    lowestCoveredTextIdx = j;
                    break; // j 从小到大，第一个即最低 index。
                }
            }
            if (lowestCoveredTextIdx < 0)
                continue;
            // 对大实心色块额外要求"够大"，避免把刻意的小色块 chip 误判为遮挡背景。
            if (isBigFill) {
                // 需要覆盖文字面积的一大半 + 自身较大，才算"当背景用的大色块"。
                const tb = shapes[lowestCoveredTextIdx].bbox;
                const coversText = intersectionArea(shBox, tb) / Math.max(1, area(tb));
                if (coversText < 0.6)
                    continue;
            }
            // 下沉：移除 sh，插到 lowestCoveredTextIdx 处（此时它在该文字之下）。
            shapes.splice(i, 1);
            shapes.splice(lowestCoveredTextIdx, 0, sh);
            fixes.push({
                slide: slideIdx,
                kind: "zorder",
                detail: `${sh.name ?? sh.kind} moved below covered text`,
            });
            moved = true;
            break; // 重新开始一轮，index 已变。
        }
        if (!moved)
            break;
    }
}
