"use strict";
// 把字体文件嵌进 PPTX（p:embeddedFontLst），与 fonts_apply 不同：
// fonts_apply 只改 fontFamily + 注入浏览器 <link>；本域写入 pres.fonts，
// 导出后在没装该字体的机器上也能显示。
Object.defineProperty(exports, "__esModule", { value: true });
exports.fontTools = void 0;
const zod_1 = require("zod");
const core_1 = require("@sliiu/present-core");
const commands_1 = require("@sliiu/present-editor/commands");
const themes_1 = require("@sliiu/present-themes");
const types_1 = require("../types");
const summaries_1 = require("../summaries");
const formatEnum = zod_1.z.enum(["embedded-opentype", "truetype", "opentype", "woff", "woff2"]);
const faceSchema = zod_1.z.object({
    family: zod_1.z.string().min(1),
    src: zod_1.z.string().min(8).describe("data: URL of the TTF/OTF/WOFF bytes (data:font/ttf;base64,...)."),
    weight: zod_1.z.number().int().min(100).max(900).optional(),
    style: zod_1.z.enum(["normal", "italic"]).optional(),
    format: formatEnum.optional(),
});
function inferFormat(src) {
    const mime = /^data:([^;,]+)/i.exec(src)?.[1]?.toLowerCase() ?? "";
    if (mime.includes("woff2"))
        return "woff2";
    if (mime.includes("woff"))
        return "woff";
    if (mime.includes("otf") || mime.includes("opentype"))
        return "opentype";
    if (mime.includes("eot") || mime.includes("embedded-opentype"))
        return "embedded-opentype";
    return "truetype";
}
function fontSnapshot(pres) {
    const used = (0, core_1.collectUsedTypefaces)(pres);
    const usedFaces = (0, core_1.collectUsedFontFaces)(pres);
    const embedded = (pres.fonts ?? []).map((f) => ({
        family: f.family,
        weight: f.weight,
        style: f.style,
        format: f.format ?? null,
        src: (0, summaries_1.elideUrlForSummary)(f.src),
    }));
    const missing = usedFaces
        .filter((f) => !(0, core_1.isFontFaceEmbedded)(pres, f.family, f.weight, f.style))
        .map((f) => `${f.family}@${f.weight}${f.style === "italic" ? "i" : ""}`);
    return {
        embedTrueTypeFonts: !!pres.options?.embedTrueTypeFonts,
        saveSubsetFonts: !!pres.options?.saveSubsetFonts,
        used,
        embedded,
        missing,
    };
}
function googleCssUrl(family, weight) {
    const name = (0, core_1.canonicalTypeface)(family) ?? (0, core_1.firstNamedTypeface)(family) ?? family.trim();
    const preset = (0, themes_1.findFontPreset)(name);
    if (preset?.cssUrl)
        return preset.cssUrl;
    const q = encodeURIComponent(name).replace(/%20/g, "+");
    return `https://fonts.googleapis.com/css2?family=${q}:wght@${weight}&display=swap`;
}
function googleWeightsForUsed(used) {
    const weights = new Set([400]);
    const max = used.length ? Math.max(...used) : 400;
    if (max >= 800)
        weights.add(800);
    else if (max >= 600)
        weights.add(700);
    return [...weights];
}
async function fetchFamilyDataUrl(family, weight) {
    const fromPreset = await (0, commands_1.fetchPresetFontDataUrl)(family, weight);
    if (fromPreset)
        return fromPreset;
    const bytes = await (0, commands_1.fetchGoogleFontBytes)(googleCssUrl(family, weight), weight);
    if (!bytes?.length)
        return null;
    const mime = bytes[0] === 0x4f && bytes[1] === 0x54 ? "font/otf" : "font/ttf";
    return (0, core_1.bytesToFontDataUrl)(bytes, mime);
}
async function fetchFamilyWeight(family, weight) {
    const src = await fetchFamilyDataUrl(family, weight);
    if (src)
        return { src, weight };
    if (weight >= 800) {
        const fallback = await fetchFamilyDataUrl(family, 700);
        if (fallback)
            return { src: fallback, weight: 700 };
    }
    return null;
}
exports.fontTools = [
    (0, types_1.defineTool)({
        name: "listFontEmbedStatus",
        description: "List typefaces used in the deck vs fonts already embedded into the PPTX (pres.fonts). Also returns embedTrueTypeFonts / saveSubsetFonts flags. Call before embedFonts. Distinct from fonts_search — this is about files packed into the export, not CSS appearance.",
        inputSchema: zod_1.z.object({}),
        tags: ["read"],
        execute: (rt) => (0, types_1.ok)(fontSnapshot(rt.getPres())),
    }),
    (0, types_1.defineTool)({
        name: "embedFonts",
        description: [
            "Embed font files into the presentation so export/PPTX viewers do not need the font installed.",
            "This is NOT fonts_apply (that only sets fontFamily + a browser stylesheet).",
            "Modes:",
            "  - usedOnly=true (default when families/faces omitted): fetch Google Fonts TTF for every USED family that is not yet embedded.",
            "  - families: fetch those Google Font family names (e.g. 'Inter', 'Noto Sans SC') — do NOT append :700.",
            "  - faces: pass TTF/OTF/WOFF data URLs for custom or system fonts (Calibri / 微软雅黑 cannot be fetched — user must supply bytes).",
            "  - remove: drop embedded faces by family name (also matches aliases like 'Noto Serif SC:700').",
            "Bold/800 slots used in the deck are downloaded automatically (Google wght@700 or 800). Do not invent ':700' family names.",
            "System fonts and unlicensed files cannot be downloaded; those land in `failed` and need faces[].src.",
            "Ripple: after embedding, keep using the same fontFamily on text.",
        ].join(" "),
        inputSchema: zod_1.z.object({
            families: zod_1.z
                .array(zod_1.z.string().min(1))
                .optional()
                .describe("Google Font family names to download and embed. No weight suffix."),
            faces: zod_1.z.array(faceSchema).optional().describe("Raw font files as data URLs."),
            remove: zod_1.z
                .array(zod_1.z.string().min(1))
                .optional()
                .describe("Remove embedded faces by family name, including aliases like 'Noto Serif SC:700'."),
            usedOnly: zod_1.z
                .boolean()
                .optional()
                .describe("Embed every used-but-missing typeface via Google Fonts. Default true when families and faces are both omitted."),
            skipExisting: zod_1.z.boolean().optional().describe("Skip faces already in pres.fonts. Default true."),
            saveSubsetFonts: zod_1.z
                .boolean()
                .optional()
                .describe("OOXML saveSubsetFonts flag (subset glyphs on export when the serializer supports it)."),
        }),
        tags: ["mutate", "theme"],
        execute: async (rt, { families, faces, usedOnly, skipExisting, saveSubsetFonts, remove }) => {
            const pres = rt.getPres();
            const skip = skipExisting !== false;
            const autoUsed = usedOnly ?? (!families?.length && !faces?.length && !remove?.length);
            const usedFaces = (0, core_1.collectUsedFontFaces)(pres);
            const weightsByFamily = new Map();
            const addWeight = (family, weight) => {
                const list = weightsByFamily.get(family) ?? [];
                list.push(weight);
                weightsByFamily.set(family, list);
            };
            if (autoUsed) {
                for (const face of usedFaces)
                    addWeight(face.family, face.weight);
            }
            for (const raw of families ?? []) {
                const family = (0, core_1.canonicalTypeface)(raw) ?? raw.trim();
                if (!family)
                    continue;
                const used = usedFaces.filter((f) => f.family === family).map((f) => f.weight);
                if (used.length) {
                    for (const w of used)
                        addWeight(family, w);
                }
                else {
                    addWeight(family, 400);
                }
            }
            const additions = [];
            const skipped = [];
            const failed = [];
            for (const [family, usedWeights] of weightsByFamily) {
                for (const weight of googleWeightsForUsed(usedWeights)) {
                    if (skip && (0, core_1.isFontFaceEmbedded)(pres, family, weight)) {
                        skipped.push(`${family}@${weight}`);
                        continue;
                    }
                    try {
                        const got = await fetchFamilyWeight(family, weight);
                        if (!got) {
                            failed.push(`${family}@${weight}`);
                            continue;
                        }
                        additions.push({
                            family,
                            weight: got.weight,
                            style: "normal",
                            src: got.src,
                            format: "truetype",
                        });
                    }
                    catch {
                        failed.push(`${family}@${weight}`);
                    }
                }
            }
            for (const face of faces ?? []) {
                if (!face.src.startsWith("data:")) {
                    return (0, types_1.err)(`faces.src for "${face.family}" must be a data: URL (got a remote URL).`);
                }
                additions.push({
                    family: face.family,
                    weight: face.weight ?? 400,
                    style: face.style ?? "normal",
                    src: face.src,
                    format: face.format ?? inferFormat(face.src),
                });
            }
            if (additions.length === 0 && saveSubsetFonts === undefined && !remove?.length) {
                if (failed.length) {
                    return (0, types_1.err)(`Could not download: ${failed.join(", ")}. System fonts need faces[].src as a data URL. Call listFontEmbedStatus to see what is still missing.`);
                }
                return (0, types_1.err)("Nothing to embed — used typefaces are already packed, or the deck has no custom typefaces.");
            }
            const res = rt.apply(new commands_1.EmbedFontsCmd(additions, {
                embedTrueTypeFonts: true,
                ...(saveSubsetFonts !== undefined ? { saveSubsetFonts } : {}),
            }, remove ?? []));
            if (!res.ok)
                return res;
            return (0, types_1.ok)({
                embedded: additions.map((f) => ({ family: f.family, weight: f.weight, style: f.style, format: f.format })),
                skipped,
                failed,
                hint: failed.length
                    ? "failed families are probably system fonts — ask the user for a TTF/OTF file and pass faces[].src"
                    : undefined,
                status: fontSnapshot(rt.getPres()),
            });
        },
    }),
];
