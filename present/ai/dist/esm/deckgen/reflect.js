/**
 * Content / Design / Coherence self-check.
 * Reflective checklist; hard fail.
 */
import { SLOT_CAPS } from "./ids.js";
import { isLayoutId, isVariantForLayout } from "./ids.js";
import { imageSlotsAllowed } from "./layouts.js";
import { paletteOf } from "./color-theme.js";
import { typeScaleValues, CANVAS } from "./visual-system.js";
function find(findings, kind, slideIdx, issue) {
    findings.push({ kind, slideIdx, issue });
}
function texts(slide) {
    return slide.elements.filter((e) => e.kind === "text" && (e.text ?? "").trim());
}
export function reflectPainted(slides, system, theme) {
    const findings = [];
    const pal = paletteOf(theme);
    const allowed = new Set(Object.values(pal).map((c) => c.toLowerCase()));
    const typeSet = new Set(typeScaleValues(system));
    const mx = CANVAS.width * system.grid.margin;
    const my = CANVAS.height * system.grid.margin;
    const inset = { x: mx, y: my, r: CANVAS.width - mx, b: CANVAS.height - my };
    for (let i = 0; i < slides.length; i++) {
        const s = slides[i];
        if (!isLayoutId(s.layout)) {
            find(findings, "content", i, `invented layout "${s.layout}"`);
            continue;
        }
        if (!isVariantForLayout(s.layout, s.variant)) {
            find(findings, "content", i, `invented variant "${s.variant}" on ${s.layout}`);
        }
        if (s.layout === "statement") {
            const claim = s.elements.find((e) => e.slot === "claim")?.text ?? "";
            const raw = [...claim].filter((ch) => ch !== "…").join("");
            if ([...claim.replace(/…$/, "")].length > SLOT_CAPS.statementClaimChars) {
                find(findings, "content", i, `statement claim exceeds ${SLOT_CAPS.statementClaimChars} chars`);
            }
            void raw;
        }
        if (s.layout === "bullets") {
            const items = s.elements.filter((e) => e.slot === "items");
            if (items.length > SLOT_CAPS.bulletItems) {
                find(findings, "content", i, `bullets exceed ${SLOT_CAPS.bulletItems} items`);
            }
            for (const it of items) {
                const t = (it.text ?? "").replace(/…$/, "");
                if ([...t].length > SLOT_CAPS.bulletItemChars) {
                    find(findings, "content", i, `bullet exceeds ${SLOT_CAPS.bulletItemChars} chars`);
                }
            }
        }
        if (s.layout === "kpi" && s.variant === "number-row") {
            const values = s.elements.filter((e) => e.name.includes(":value"));
            if (values.length > SLOT_CAPS.kpiRow) {
                find(findings, "content", i, `kpi row exceeds ${SLOT_CAPS.kpiRow}`);
            }
        }
        if (!imageSlotsAllowed(s.layout, s.variant) && s.elements.some((e) => e.kind === "image")) {
            find(findings, "content", i, `image on ${s.layout}/${s.variant} (only figure/split text-figure)`);
        }
        for (const el of s.elements) {
            const b = el.bbox;
            if (b.x < inset.x - 0.5 || b.y < inset.y - 0.5 || b.x + b.w > inset.r + 0.5 || b.y + b.h > inset.b + 0.5) {
                find(findings, "design", i, `overflow past 5% margin (${el.name})`);
            }
            if (el.kind === "text" && el.fontSize != null && !typeSet.has(el.fontSize)) {
                find(findings, "design", i, `font ${el.fontSize} not in type scale (shrink-to-fit banned)`);
            }
            if (el.kind === "text" && el.align === "middle" && system.bans.centeredDisplay) {
                const display = system.typeScale.display;
                if (el.fontSize != null && el.fontSize >= display - 1) {
                    find(findings, "design", i, "swiss/editorial ban: centered display title");
                }
            }
            const color = el.color.toLowerCase();
            // `liftedFrom` = a token panel pushed a step darker/lighter by applyColorTheme so the copy
            // on it clears AA; the token it derives from must itself be a palette hex.
            if (!allowed.has(el.liftedFrom?.toLowerCase() ?? color)) {
                find(findings, "design", i, `free hex ${el.color} not in ColorTheme ${theme.id}`);
            }
        }
        const ts = texts(s);
        for (let a = 0; a < ts.length; a++) {
            for (let b = a + 1; b < ts.length; b++) {
                const A = ts[a].bbox;
                const B = ts[b].bbox;
                const x1 = Math.max(A.x, B.x);
                const y1 = Math.max(A.y, B.y);
                const x2 = Math.min(A.x + A.w, B.x + B.w);
                const y2 = Math.min(A.y + A.h, B.y + B.h);
                const ov = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
                if (ov > 8)
                    find(findings, "design", i, `overlapping text ${ts[a].name} / ${ts[b].name}`);
            }
        }
    }
    if (slides.length === 0)
        find(findings, "coherence", -1, "empty deck");
    return { passed: findings.length === 0, findings };
}
export function reflectPresentation(pres, system, theme) {
    const findings = [];
    const pal = paletteOf(theme);
    const allowed = new Set(Object.values(pal).map((c) => c.toLowerCase()));
    const typeSet = new Set(typeScaleValues(system));
    for (let i = 0; i < pres.slides.length; i++) {
        const slide = pres.slides[i];
        const layout = (slide.customData?.tags?.layout ?? slide.name);
        const variant = slide.customData?.tags?.variant ?? "";
        if (!isLayoutId(layout))
            find(findings, "content", i, `invented layout "${layout}"`);
        else if (variant && !isVariantForLayout(layout, variant)) {
            find(findings, "content", i, `invented variant "${variant}"`);
        }
        const bg = slide.background;
        if (bg?.kind === "solid" && bg.color && !allowed.has(bg.color.toLowerCase())) {
            find(findings, "design", i, `free bg hex ${bg.color}`);
        }
        if (bg?.kind === "linear" || bg?.kind === "radial") {
            find(findings, "design", i, "gradient background banned");
        }
        const walk = (sh) => {
            if (sh.kind === "group") {
                for (const ch of sh.children)
                    walk(ch);
                return;
            }
            if ("rx" in sh && typeof sh.rx === "number" && sh.rx > 0) {
                find(findings, "design", i, "rounded corners banned");
            }
            if (sh.shadow)
                find(findings, "design", i, "shadow banned");
            const fill = "fill" in sh ? sh.fill : undefined;
            if (fill?.kind === "linear" || fill?.kind === "radial")
                find(findings, "design", i, "gradient fill banned");
            if (fill?.kind === "solid" && fill.color && !allowed.has(fill.color.toLowerCase())) {
                find(findings, "design", i, `free fill hex ${fill.color}`);
            }
            if (sh.kind === "text") {
                const t = sh;
                for (const p of t.paragraphs) {
                    if (system.bans.centeredDisplay && p.align === "middle") {
                        find(findings, "design", i, "centered title banned on this VisualSystem");
                    }
                    for (const r of p.runs) {
                        if (r.fontSize != null && !typeSet.has(r.fontSize)) {
                            find(findings, "design", i, `font ${r.fontSize} not in type scale`);
                        }
                        if (r.color && !allowed.has(r.color.toLowerCase())) {
                            find(findings, "design", i, `free text hex ${r.color}`);
                        }
                    }
                }
            }
            if (sh.kind === "image") {
                if (!isLayoutId(layout) || !imageSlotsAllowed(layout, variant)) {
                    find(findings, "content", i, "image outside figure/split text-figure");
                }
            }
        };
        for (const layer of slide.layers)
            for (const sh of layer.shapes)
                walk(sh);
    }
    return { passed: findings.length === 0, findings };
}
export function assertReflect(result) {
    if (result.passed)
        return;
    const sample = result.findings
        .slice(0, 6)
        .map((f) => `[${f.kind} #${f.slideIdx}] ${f.issue}`)
        .join("; ");
    throw new Error(`deckgen reflect failed: ${sample}`);
}
