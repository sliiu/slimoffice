"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseCssTypefaces = parseCssTypefaces;
exports.firstNamedTypeface = firstNamedTypeface;
exports.canonicalTypeface = canonicalTypeface;
exports.collectUsedTypefaces = collectUsedTypefaces;
exports.collectUsedFontFaces = collectUsedFontFaces;
exports.isTypefaceEmbedded = isTypefaceEmbedded;
exports.isFontFaceEmbedded = isFontFaceEmbedded;
exports.removeEmbeddedFontFamilies = removeEmbeddedFontFamilies;
exports.mergeEmbeddedFonts = mergeEmbeddedFonts;
exports.bytesToFontDataUrl = bytesToFontDataUrl;
const GENERIC_FAMILY = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-sans-serif|ui-serif|ui-monospace|ui-rounded|emoji|math|fangsong|-apple-system|BlinkMacSystemFont)$/i;
function walkShapes(shapes, visit) {
    if (!shapes)
        return;
    for (const sh of shapes) {
        visit(sh);
        if (sh.kind === "group")
            walkShapes(sh.children, visit);
    }
}
function parseCssTypefaces(css) {
    if (!css)
        return [];
    const out = [];
    let i = 0;
    while (i < css.length) {
        while (i < css.length && /[\s,]/.test(css[i]))
            i++;
        if (i >= css.length)
            break;
        let name;
        const q = css[i];
        if (q === '"' || q === "'") {
            i++;
            let buf = "";
            while (i < css.length && css[i] !== q) {
                if (css[i] === "\\" && i + 1 < css.length) {
                    buf += css[i + 1];
                    i += 2;
                }
                else {
                    buf += css[i++];
                }
            }
            if (i < css.length)
                i++;
            name = buf.trim();
        }
        else {
            const start = i;
            while (i < css.length && css[i] !== ",")
                i++;
            name = css.slice(start, i).trim();
        }
        if (name && !GENERIC_FAMILY.test(name))
            out.push(name);
    }
    return out;
}
function firstNamedTypeface(css) {
    return parseCssTypefaces(css)[0];
}
function canonicalTypeface(css) {
    const named = firstNamedTypeface(css);
    if (!named)
        return undefined;
    const stripped = named.replace(/:(?:ital,)?(?:wght@)?[\d.;,@]+$/i, "").trim();
    return stripped || named;
}
function isWeightAliasFamily(family) {
    return /:\d{3}$/.test(family) || /:wght@/i.test(family);
}
function numericFontWeight(weight) {
    if (typeof weight === "number" && Number.isFinite(weight))
        return weight;
    if (typeof weight === "string") {
        const n = Number(weight);
        if (Number.isFinite(n))
            return n;
        if (/^bold$/i.test(weight))
            return 700;
        if (/^normal$/i.test(weight))
            return 400;
    }
    return 400;
}
function addFamily(set, family) {
    const f = canonicalTypeface(family);
    if (f)
        set.add(f);
}
/** Collect unique typeface names from deck text + theme font scheme. */
function collectUsedTypefaces(pres) {
    const out = new Set();
    addFamily(out, pres.theme?.fonts?.major);
    addFamily(out, pres.theme?.fonts?.minor);
    for (const slide of pres.slides) {
        for (const layer of slide.layers ?? []) {
            walkShapes(layer.shapes, (sh) => {
                if (sh.kind !== "text")
                    return;
                const paras = sh.paragraphs ?? [];
                for (const p of paras) {
                    addFamily(out, p.defRunStyle?.fontFamily);
                    for (const r of p.runs ?? [])
                        addFamily(out, r.fontFamily);
                }
            });
        }
    }
    return [...out];
}
function collectUsedFontFaces(pres) {
    const map = new Map();
    const add = (family, weight, italic) => {
        const name = canonicalTypeface(family);
        if (!name)
            return;
        const w = numericFontWeight(weight);
        const style = italic ? "italic" : "normal";
        const key = `${name}|${w}|${style}`;
        if (!map.has(key))
            map.set(key, { family: name, weight: w, style });
    };
    add(pres.theme?.fonts?.major, 400, false);
    add(pres.theme?.fonts?.minor, 400, false);
    for (const slide of pres.slides) {
        for (const layer of slide.layers ?? []) {
            walkShapes(layer.shapes, (sh) => {
                if (sh.kind !== "text")
                    return;
                for (const p of sh.paragraphs ?? []) {
                    const def = p.defRunStyle;
                    add(def?.fontFamily, def?.fontWeight, def?.italic);
                    for (const r of p.runs ?? []) {
                        add(r.fontFamily ?? def?.fontFamily, r.fontWeight ?? def?.fontWeight, r.italic ?? def?.italic);
                    }
                }
            });
        }
    }
    return [...map.values()];
}
function embedBaseFamily(family) {
    const suffix = /( Bold Italic| Bold| Italic)$/.exec(family);
    const base = suffix ? family.slice(0, -suffix[0].length) : family;
    return canonicalTypeface(base) ?? base;
}
function embedSlot(weight, style) {
    const bold = weight >= 600;
    const italic = style === "italic";
    if (bold && italic)
        return "boldItalic";
    if (bold)
        return "bold";
    if (italic)
        return "italic";
    return "regular";
}
/** True when `pres.fonts` already has a face for the base family (ignoring alias entries). */
function isTypefaceEmbedded(pres, typeface) {
    const want = canonicalTypeface(typeface) ?? typeface.trim();
    const fonts = pres.fonts ?? [];
    return fonts.some((f) => embedBaseFamily(f.family) === want);
}
function isFontFaceEmbedded(pres, typeface, weight, style = "normal") {
    const want = canonicalTypeface(typeface) ?? typeface.trim();
    const slot = embedSlot(weight, style);
    return (pres.fonts ?? []).some((f) => embedBaseFamily(f.family) === want && embedSlot(f.weight, f.style) === slot);
}
function fontKey(f) {
    return `${f.family}|${f.weight}|${f.style}`;
}
function removeEmbeddedFontFamilies(current, families) {
    const exact = new Set(families.map((s) => s.trim()).filter(Boolean));
    const bases = new Set(families
        .filter((s) => !isWeightAliasFamily(s.trim()))
        .map((s) => (canonicalTypeface(s) ?? s.trim()).toLowerCase()));
    return (current ?? []).filter((f) => {
        if (exact.has(f.family))
            return false;
        if (bases.has(embedBaseFamily(f.family).toLowerCase()))
            return false;
        return true;
    });
}
/** Merge new embedded faces; later entries win on duplicate family/weight/style. */
function mergeEmbeddedFonts(current, additions) {
    const map = new Map();
    for (const f of current ?? []) {
        const face = isWeightAliasFamily(f.family)
            ? { ...f, family: embedBaseFamily(f.family) }
            : f;
        map.set(fontKey(face), face);
    }
    for (const f of additions) {
        const face = { ...f, family: embedBaseFamily(f.family) };
        map.set(fontKey(face), face);
    }
    return [...map.values()];
}
function bytesToFontDataUrl(bytes, mime = "font/ttf") {
    const bin = bytes.reduce((s, b) => s + String.fromCharCode(b), "");
    const b64 = typeof btoa !== "undefined" ? btoa(bin) : Buffer.from(bytes).toString("base64");
    return `data:${mime};base64,${b64}`;
}
