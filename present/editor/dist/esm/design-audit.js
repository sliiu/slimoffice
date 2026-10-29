import { auditPresentationAccessibility } from "./accessibility-audit.js";
function isDecoration(shape) {
    return shape.id.startsWith("dec_") || shape.id.startsWith("bgov_") || shape.name === "BG overlay";
}
function slideShapes(slide) {
    return slide.layers.flatMap((l) => l.shapes);
}
function slideHasVisual(slide) {
    return slideShapes(slide).some((sh) => sh.visible && !isDecoration(sh) && (sh.kind === "image" || sh.kind === "group"));
}
function slideIsTextOnly(slide) {
    const shapes = slideShapes(slide).filter((sh) => sh.visible && !isDecoration(sh));
    if (shapes.length === 0)
        return false;
    return shapes.every((sh) => sh.kind === "text");
}
function slideRole(slide) {
    const texts = slideShapes(slide).filter((s) => s.kind === "text" && s.visible);
    const named = texts.find((t) => t.name && !t.name.startsWith("Text"));
    if (named?.name)
        return named.name;
    const title = texts.find((t) => (t.paragraphs[0]?.runs[0]?.fontSize ?? 0) >= 28);
    if (title)
        return "title-slide";
    return slideHasVisual(slide) ? "content-visual" : "content-text";
}
function bgSignature(slide) {
    const bg = slide.background;
    if (!bg || bg.kind === "none")
        return "default";
    if (bg.kind === "image")
        return `image:${bg.src?.slice(0, 32) ?? "?"}`;
    if (bg.kind === "solid")
        return `solid:${bg.color ?? "?"}`;
    return bg.kind;
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
function slideArea(pres) {
    return pres.size.width * pres.size.height;
}
let nextId = 0;
function sid() {
    nextId += 1;
    return `ds-${nextId}`;
}
/** Read-only deck design audit (contrast, rhythm, imagery, density). Does not mutate presentation. */
export function auditPresentationDesign(pres) {
    const suggestions = [];
    const a11y = auditPresentationAccessibility(pres);
    for (const issue of a11y.issues) {
        const category = issue.kind === "contrast" ? "contrast" : issue.kind === "empty-slide" ? "empty" : "typography";
        suggestions.push({
            id: sid(),
            severity: issue.kind === "contrast" ? "error" : "warn",
            category,
            slideIndex: issue.slideIndex,
            ...(issue.shapeId ? { shapeId: issue.shapeId } : {}),
            title: issue.kind === "contrast"
                ? "Low text contrast"
                : issue.kind === "empty-slide"
                    ? "Empty slide"
                    : "Text too small",
            detail: issue.shapeName ? `${issue.shapeName}: ${issue.detail}` : issue.detail,
            action: issue.kind === "contrast"
                ? "Adjust text color or add a semi-transparent overlay behind text"
                : issue.kind === "empty-slide"
                    ? "Add content or remove the slide"
                    : "Increase font size to at least 11px (18px+ recommended for body)",
        });
    }
    const slideCount = pres.slides.length;
    if (slideCount > 0) {
        const roles = pres.slides.map(slideRole);
        const inner = pres.slides.slice(1, Math.max(1, slideCount - 1));
        const withVisual = inner.filter(slideHasVisual).length;
        if (inner.length >= 3 && withVisual / inner.length < 0.4) {
            suggestions.push({
                id: sid(),
                severity: "warn",
                category: "imagery",
                title: "Low imagery rate",
                detail: `Only ${withVisual}/${inner.length} content slides include images or graphics (target ≥40%)`,
                action: "Add hero, stat, or image-text layouts on key slides",
            });
        }
        let textRun = 0;
        for (let i = 0; i < pres.slides.length; i++) {
            if (slideIsTextOnly(pres.slides[i]))
                textRun += 1;
            else if (textRun > 2) {
                suggestions.push({
                    id: sid(),
                    severity: "info",
                    category: "layout",
                    slideIndex: i - 1,
                    title: "Monotonous rhythm",
                    detail: `${textRun} consecutive text-only slides ending at slide ${i}`,
                    action: "Break the sequence with a visual slide (hero, chart, or quote)",
                });
                textRun = 0;
            }
            else
                textRun = 0;
        }
        for (let i = 2; i < roles.length; i++) {
            if (roles[i] === roles[i - 1] && roles[i] === roles[i - 2]) {
                suggestions.push({
                    id: sid(),
                    severity: "info",
                    category: "consistency",
                    slideIndex: i,
                    title: "Repeated layout pattern",
                    detail: `Three consecutive slides share the "${roles[i]}" layout pattern`,
                    action: "Vary slide layouts to keep the deck visually engaging",
                });
                break;
            }
        }
        const roleCounts = new Map();
        for (const r of roles)
            roleCounts.set(r, (roleCounts.get(r) ?? 0) + 1);
        for (const [role, n] of roleCounts) {
            if (n >= 4 && n / roles.length > 0.5) {
                suggestions.push({
                    id: sid(),
                    severity: "info",
                    category: "consistency",
                    title: "Layout overuse",
                    detail: `"${role}" appears on ${n}/${roles.length} slides`,
                    action: "Mix in alternative layouts for visual variety",
                });
                break;
            }
        }
        const bgs = new Set(pres.slides.map(bgSignature));
        if (bgs.size === 1 && slideCount >= 4) {
            suggestions.push({
                id: sid(),
                severity: "info",
                category: "consistency",
                title: "Uniform backgrounds",
                detail: "All slides share the same background — consider accent slides for section breaks",
                action: "Apply a variant background on cover, section, or closing slides",
            });
        }
    }
    const area = slideArea(pres);
    pres.slides.forEach((slide, slideIndex) => {
        const shapes = slideShapes(slide).filter((sh) => sh.visible && !isDecoration(sh));
        if (shapes.length > 18) {
            suggestions.push({
                id: sid(),
                severity: "warn",
                category: "density",
                slideIndex,
                title: "Crowded slide",
                detail: `${shapes.length} content shapes — may feel cluttered when projected`,
                action: "Split content across slides or increase whitespace",
            });
        }
        const placeholders = shapes.filter((sh) => sh.name === "Image placeholder" || sh.name === "Image hint");
        if (placeholders.length > 0) {
            suggestions.push({
                id: sid(),
                severity: "warn",
                category: "placeholder",
                slideIndex,
                title: "Unfilled image placeholders",
                detail: `${placeholders.length} placeholder shape(s) still on this slide`,
                action: "Replace placeholders with stock images or remove them",
            });
        }
        const texts = shapes.filter((s) => s.kind === "text");
        const largeImages = shapes.filter((sh) => sh.kind === "image" &&
            intersectionArea(sh.bbox, { x: 0, y: 0, w: pres.size.width, h: pres.size.height }) / area > 0.35);
        for (const img of largeImages) {
            for (const t of texts) {
                const overlap = intersectionArea(img.bbox, t.bbox);
                if (overlap / Math.max(1, t.bbox.w * t.bbox.h) > 0.25) {
                    const imgIdx = shapes.indexOf(img);
                    const textIdx = shapes.indexOf(t);
                    if (imgIdx > textIdx) {
                        suggestions.push({
                            id: sid(),
                            severity: "error",
                            category: "layout",
                            slideIndex,
                            shapeId: t.id,
                            title: "Image may cover text",
                            detail: `Large image overlaps "${t.name ?? t.id}" — check z-order`,
                            action: 'Send image backward or use setSlideBackground for full-bleed images',
                        });
                        break;
                    }
                }
            }
        }
    });
    const errors = suggestions.filter((s) => s.severity === "error").length;
    const warns = suggestions.filter((s) => s.severity === "warn").length;
    const score = Math.max(0, Math.min(100, 100 - errors * 12 - warns * 5 - suggestions.length));
    const summary = suggestions.length === 0
        ? "No design issues detected — deck looks well balanced."
        : `${suggestions.length} suggestion(s): ${errors} critical, ${warns} warnings`;
    return { suggestions, score, summary };
}
