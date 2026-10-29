import { t as translate } from "./i18n/index.js";
function localizedDetail(key, params) {
    return {
        detail: translate(key, params),
        detailKey: key,
        ...(params ? { detailParams: params } : {}),
    };
}
/** Issue explanation in the current locale. Falls back to the stored `detail` string. */
export function accessibilityIssueDetail(issue) {
    if (issue.detailKey)
        return translate(issue.detailKey, issue.detailParams);
    return issue.detail;
}
const WCAG_LARGE = 3.0;
const WCAG_BODY = 4.5;
const SAFE_TEXT_DARK = "#0f172a";
const SAFE_TEXT_LIGHT = "#f8fafc";
function parseHex(input) {
    if (!input)
        return null;
    let s = input.trim();
    if (s.startsWith("#"))
        s = s.slice(1);
    if (s.length === 3) {
        s = s
            .split("")
            .map((c) => c + c)
            .join("");
    }
    if (s.length !== 6 || /[^0-9a-fA-F]/.test(s))
        return null;
    return {
        r: parseInt(s.slice(0, 2), 16),
        g: parseInt(s.slice(2, 4), 16),
        b: parseInt(s.slice(4, 6), 16),
    };
}
function luminance(rgb) {
    const ch = (c) => {
        const cs = c / 255;
        return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * ch(rgb.r) + 0.7152 * ch(rgb.g) + 0.0722 * ch(rgb.b);
}
function contrastRatio(a, b) {
    const la = luminance(a);
    const lb = luminance(b);
    const hi = Math.max(la, lb);
    const lo = Math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05);
}
function readableTextColor(bg) {
    return luminance(bg) > 0.5 ? SAFE_TEXT_DARK : SAFE_TEXT_LIGHT;
}
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
function firstRunColor(t) {
    for (const p of t.paragraphs) {
        for (const r of p.runs) {
            if (r.color)
                return r.color;
        }
    }
    return undefined;
}
function isLargeText(t) {
    let max = 0;
    let bold = false;
    for (const p of t.paragraphs) {
        for (const r of p.runs) {
            const fs = r.fontSize ?? 0;
            if (fs > max)
                max = fs;
            if (r.fontWeight === "bold" || (typeof r.fontWeight === "number" && r.fontWeight >= 600)) {
                bold = true;
            }
        }
    }
    return max >= 24 || (max >= 18.66 && bold);
}
function isDecoration(shape) {
    return shape.id.startsWith("dec_") || shape.id.startsWith("bgov_") || shape.name === "BG overlay";
}
function slideShapes(slide) {
    return slide.layers.flatMap((l) => l.shapes);
}
function bboxArea(b) {
    return Math.max(0, b.w) * Math.max(0, b.h);
}
function intersectionArea(a, b) {
    const x1 = Math.max(a.x, b.x);
    const y1 = Math.max(a.y, b.y);
    const x2 = Math.min(a.x + a.w, b.x + b.w);
    const y2 = Math.min(a.y + a.h, b.y + b.h);
    if (x2 <= x1 || y2 <= y1)
        return 0;
    return (x2 - x1) * (y2 - y1);
}
function slideHasContent(slide) {
    for (const layer of slide.layers) {
        for (const sh of layer.shapes) {
            if (!sh.visible || isDecoration(sh))
                continue;
            if (sh.kind === "text") {
                const t = sh;
                if (t.paragraphs.some((p) => p.runs.some((r) => r.text?.trim())))
                    return true;
            }
            else {
                return true;
            }
        }
    }
    return false;
}
function resolveSlideBg(slide, themeBg) {
    const bg = slide.background;
    if (bg?.kind === "image")
        return { r: 40, g: 40, b: 40 };
    return parseHex(paintMainColor(bg) ?? themeBg);
}
function isGenericImageName(name) {
    if (!name?.trim())
        return true;
    const n = name.trim().toLowerCase();
    return (n === "picture" ||
        n === "image" ||
        n === "photo" ||
        n === "img" ||
        n.startsWith("picture ") ||
        n.startsWith("image "));
}
function imageAltText(img) {
    return (img.descr ?? img.name ?? "").trim();
}
function effectiveBgForText(shapes, text, slideBg) {
    if (text.fill?.kind === "solid" && text.fill.color) {
        const own = parseHex(text.fill.color);
        if (own)
            return own;
    }
    const idx = shapes.indexOf(text);
    if (idx < 0)
        return slideBg;
    for (let i = idx - 1; i >= 0; i--) {
        const sh = shapes[i];
        if (!sh.visible || isDecoration(sh))
            continue;
        if (intersectionArea(sh.bbox, text.bbox) / Math.max(1, bboxArea(text.bbox)) < 0.45)
            continue;
        const c = parseHex(paintMainColor(sh.fill) ?? undefined);
        if (c)
            return c;
    }
    return slideBg;
}
function slideHasTitle(slide) {
    for (const layer of slide.layers) {
        for (const sh of layer.shapes) {
            if (!sh.visible || sh.kind !== "text")
                continue;
            const t = sh;
            const hasText = t.paragraphs.some((p) => p.runs.some((r) => r.text?.trim()));
            if (!hasText)
                continue;
            const ph = sh.placeholderType;
            if (ph === "title" || ph === "ctrTitle")
                return true;
            let max = 0;
            for (const p of t.paragraphs) {
                for (const r of p.runs)
                    max = Math.max(max, r.fontSize ?? 0);
            }
            if (max >= 20)
                return true;
            const name = (sh.name ?? "").toLowerCase();
            if (name.includes("title") || name.includes("标题"))
                return true;
        }
    }
    return false;
}
/** Issues that can be fixed with SetTextStyleCmd color patch. */
export function contrastIssuesFromReport(report) {
    return report.issues.filter((i) => i.kind === "contrast" && i.shapeId && i.suggestedColor);
}
/** Issues that can be fixed with SetImageDescrCmd. */
export function missingAltIssuesFromReport(report) {
    return report.issues.filter((i) => i.kind === "missing-alt" && i.shapeId);
}
/** Per-kind issue counts for filter chips / summary. */
export function summarizeAccessibilityByKind(report) {
    const out = {};
    for (const i of report.issues)
        out[i.kind] = (out[i.kind] ?? 0) + 1;
    return out;
}
/** Suggested alt text from a non-generic shape name. */
export function suggestedImageAltText(shapeName) {
    if (!shapeName?.trim() || isGenericImageName(shapeName))
        return "";
    return shapeName.trim();
}
/** 只读 WCAG 对比度 / 空页 / 过小字号 / 图片替代文本 / 图层遮挡扫描（不修改 presentation）。 */
export function auditPresentationAccessibility(pres) {
    const issues = [];
    let passed = 0;
    const themeBg = pres.theme?.colors?.["bg1"];
    const slideArea = pres.size.width * pres.size.height;
    pres.slides.forEach((slide, slideIndex) => {
        if (!slideHasContent(slide)) {
            issues.push({
                slideIndex,
                kind: "empty-slide",
                ...localizedDetail("accessibility.detail.emptySlide"),
            });
        }
        else if (!slideHasTitle(slide)) {
            issues.push({
                slideIndex,
                kind: "missing-title",
                ...localizedDetail("accessibility.detail.missingTitle"),
            });
        }
        const bg = resolveSlideBg(slide, themeBg);
        const shapes = slideShapes(slide).filter((sh) => sh.visible && !isDecoration(sh));
        const texts = shapes.filter((s) => s.kind === "text");
        for (const sh of shapes) {
            if (sh.kind === "image") {
                const img = sh;
                const alt = imageAltText(img);
                if (!alt || isGenericImageName(alt)) {
                    issues.push({
                        slideIndex,
                        shapeId: img.id,
                        shapeName: img.name,
                        kind: "missing-alt",
                        ...localizedDetail(alt ? "accessibility.detail.missingAlt.generic" : "accessibility.detail.missingAlt.none"),
                    });
                }
            }
        }
        const largeImages = shapes.filter((sh) => sh.kind === "image" &&
            intersectionArea(sh.bbox, { x: 0, y: 0, w: pres.size.width, h: pres.size.height }) / slideArea > 0.35);
        for (const img of largeImages) {
            for (const t of texts) {
                const hasText = t.paragraphs.some((p) => p.runs.some((r) => r.text?.trim()));
                if (!hasText)
                    continue;
                const overlap = intersectionArea(img.bbox, t.bbox);
                if (overlap / Math.max(1, bboxArea(t.bbox)) > 0.25) {
                    const imgIdx = shapes.indexOf(img);
                    const textIdx = shapes.indexOf(t);
                    if (imgIdx > textIdx) {
                        issues.push({
                            slideIndex,
                            shapeId: t.id,
                            shapeName: t.name,
                            kind: "image-overlap",
                            ...localizedDetail("accessibility.detail.imageOverlap", { name: t.name ?? t.id }),
                        });
                    }
                }
            }
        }
        for (const layer of slide.layers) {
            for (const sh of layer.shapes) {
                if (sh.kind !== "text" || !sh.visible || isDecoration(sh))
                    continue;
                const t = sh;
                const hasText = t.paragraphs.some((p) => p.runs.some((r) => r.text?.trim()));
                if (!hasText)
                    continue;
                let minFont = Infinity;
                for (const p of t.paragraphs) {
                    for (const r of p.runs) {
                        const fs = r.fontSize;
                        if (fs && fs < minFont)
                            minFont = fs;
                    }
                }
                if (minFont < 11) {
                    issues.push({
                        slideIndex,
                        shapeId: t.id,
                        shapeName: t.name,
                        kind: "tiny-text",
                        ...localizedDetail("accessibility.detail.tinyText", { size: minFont }),
                    });
                }
                if (!bg) {
                    passed += 1;
                    continue;
                }
                const effectiveBg = effectiveBgForText(shapes, t, bg) ?? bg;
                const textRgb = parseHex(firstRunColor(t));
                const threshold = isLargeText(t) ? WCAG_LARGE : WCAG_BODY;
                const ratio = textRgb ? contrastRatio(textRgb, effectiveBg) : 0;
                if (!textRgb || ratio < threshold) {
                    const large = isLargeText(t);
                    issues.push({
                        slideIndex,
                        shapeId: t.id,
                        shapeName: t.name,
                        kind: "contrast",
                        ...localizedDetail(textRgb
                            ? "accessibility.detail.contrast"
                            : large
                                ? "accessibility.detail.missingColor.title"
                                : "accessibility.detail.missingColor.body", textRgb ? { ratio: ratio.toFixed(2), threshold } : undefined),
                        suggestedColor: readableTextColor(effectiveBg),
                    });
                }
                else {
                    passed += 1;
                }
            }
        }
    });
    return { issues, passed, checkedSlides: pres.slides.length };
}
