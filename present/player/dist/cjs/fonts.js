"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerEmbeddedFonts = registerEmbeddedFonts;
exports.loadEmbeddedFonts = loadEmbeddedFonts;
const registered = new WeakMap();
function registerEmbeddedFonts(doc, pres) {
    void loadEmbeddedFonts(doc, pres);
}
/** Await embedded OOXML fonts before high-DPI raster export (PDF / PNG). */
async function loadEmbeddedFonts(doc, pres) {
    const fonts = pres.fonts;
    if (!fonts || fonts.length === 0)
        return;
    const docFonts = doc.fonts;
    if (!docFonts || typeof FontFace === "undefined")
        return;
    let set = registered.get(doc);
    if (!set) {
        set = new Set();
        registered.set(doc, set);
    }
    const pending = [];
    for (const f of fonts) {
        const key = `${f.family}|${f.weight}|${f.style}|${f.src}`;
        if (set.has(key))
            continue;
        set.add(key);
        try {
            const face = new FontFace(f.family, `url(${f.src})`, {
                weight: String(f.weight),
                style: f.style,
                display: "swap",
            });
            pending.push(face.load().then((loaded) => {
                docFonts.add(loaded);
            }, (err) => {
                console.warn(`[player] font "${f.family}" failed to load`, err);
            }));
        }
        catch (e) {
            console.warn(`[player] FontFace ctor failed for "${f.family}"`, e);
        }
    }
    if (pending.length)
        await Promise.allSettled(pending);
    if (docFonts.ready)
        await docFonts.ready;
}
