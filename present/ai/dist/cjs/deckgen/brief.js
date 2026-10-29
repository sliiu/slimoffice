"use strict";
/**
 * Design Brief vocabulary — the planning layer between organize and author.
 *
 * ppt-master keeps this in design_spec.md (Relationships / Composition /
 * Core message / page_rhythm) and spec_lock.md. Here it is a small typed
 * record the organizer emits alongside key points; the author binds to it
 * and the canvas reflect asks "you said order — where is the geometry?".
 * Type / spacing anchors are not authored: the VisualSystem owns them.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PHOTO_RHYTHM_HINTS = exports.PHOTO_RHYTHMS = exports.COMPOSITION_HINTS = exports.COMPOSITIONS = exports.CARRIERS = exports.PAGE_RHYTHMS = exports.RELATIONSHIP_CARRIERS = exports.RELATIONSHIPS = exports.DECK_MODE_HINTS = exports.DECK_MODES = void 0;
exports.coercePhotoRhythm = coercePhotoRhythm;
exports.photoRhythmFromNotes = photoRhythmFromNotes;
exports.notesWantPhotos = notesWantPhotos;
exports.defaultPhotoRhythm = defaultPhotoRhythm;
exports.coerceFolio = coerceFolio;
exports.folioFromNotes = folioFromNotes;
exports.defaultFolio = defaultFolio;
exports.coercePageBrief = coercePageBrief;
exports.defaultComposition = defaultComposition;
exports.breakCompositionRuns = breakCompositionRuns;
exports.coerceDeckBrief = coerceDeckBrief;
exports.defaultRhythm = defaultRhythm;
exports.inferRelationship = inferRelationship;
exports.systemIdsPromptLine = systemIdsPromptLine;
const ids_js_1 = require("./ids.js");
const visual_system_js_1 = require("./visual-system.js");
/** Argument skeleton for the whole deck (decides title voice and page order). */
exports.DECK_MODES = ["pyramid", "narrative", "instructional", "showcase", "briefing"];
exports.DECK_MODE_HINTS = {
    pyramid: "conclusion first; every title is an assertion; evidence pages support the claim above them",
    narrative: "tension → turn → resolution; titles read as a story; one anchor page per act",
    instructional: "learner moves step by step; numbered order everywhere; recap page before close",
    showcase: "the work speaks; photo or figure leads each page; short captions, few bullets",
    briefing: "dense and fast; KPIs and tables first; titles state the status, notes carry detail",
};
/** How the points on one page relate — the author must carry this in geometry. */
exports.RELATIONSHIPS = ["none", "order", "link", "parent", "membership", "contrast", "overlap", "flow"];
/** Geometry the author is expected to use per relationship (checked by reflect). */
exports.RELATIONSHIP_CARRIERS = {
    none: "type only is fine",
    order: "stepStrip / numberedList device, or diagram process|chevron|timeline (agenda pages: agendaList device with linked rows)",
    link: "line elements with arrow between surfaces, or diagram radial|cycle",
    parent: "diagram hierarchy|orgChart|target, or one large surface containing small ones",
    membership: "iconLabelGrid device, or diagram list|horizontalList|matrix",
    contrast: "comparePlanes device, or two surfaces split by a rule",
    overlap: "diagram venn, or two ellipses with fillAlpha",
    flow: "diagram funnel|process, or chevron shapes in a row",
};
/** Page density rhythm — consecutive dense pages ≤ 3, anchor pages carry display type or a photo. */
exports.PAGE_RHYTHMS = ["anchor", "dense", "breathing"];
/** Primary carrier the page should lead with; drives image acquisition. */
exports.CARRIERS = ["photo", "chart", "table", "diagram", "device", "typeOnly"];
/**
 * Page composition — where the title sits and how the field splits. Assigned so that
 * consecutive pages never share one; the author must follow it and reflect checks the
 * header run. This is what stops "eight pages with the same eyebrow/title/deck stack".
 */
exports.COMPOSITIONS = ["header-stack", "split", "statement", "full-bleed", "grid", "band", "sidebar"];
exports.COMPOSITION_HINTS = {
    "header-stack": "eyebrow + title + one-line deck across the top; carriers fill the lower two thirds",
    split: "title column on one side (≈ 1/3), carrier on the other (≈ 2/3); a vertical rule or field edge between",
    statement: "one display-size sentence centred or flush-left in the middle band; at most one small supporting line; no header row",
    "full-bleed": "photo or solid field covers the page; type sits inside a scrimmed corner; no header row",
    grid: "one-line title at the shared content-title size; the page body is a 2×2 / 2×3 grid of equal surfaces or tiles",
    band: "an accent band across the top or bottom holds the title; content in the remaining field",
    sidebar: "narrow accent sidebar (≈ 1/5 width) with numeral + eyebrow; title and content in the wide column",
};
/** Deck-level photo placement. */
exports.PHOTO_RHYTHMS = ["anchors", "bookends", "editorial", "none"];
exports.PHOTO_RHYTHM_HINTS = {
    anchors: "every anchor page (cover, section openers, hero claims, close) is a full-bleed photograph; content pages never are",
    bookends: "cover and close only; everything between is type and colour",
    editorial: "photographs lead most pages (showcase / portfolio); the organizer picks per page",
    none: "no photography; type, colour and figures only",
};
/** Loose enum from organizer JSON or user prose: "anchors", "bookends", "cover-close", "editorial", "none"/"no photos". */
function coercePhotoRhythm(raw) {
    if (typeof raw !== "string")
        return undefined;
    const s = raw.trim().toLowerCase().replace(/[\s_]+/g, "-");
    if (!s)
        return undefined;
    if (/^(anchors?|anchor-pages?)$/.test(s))
        return "anchors";
    if (/^(bookends?|cover-close|cover-and-close|cover-only)$/.test(s))
        return "bookends";
    if (/^(editorial|showcase|every-page|all|most)$/.test(s))
        return "editorial";
    if (/^(none|no|off|false|no-photos?|no-images?)$/.test(s))
        return "none";
    return undefined;
}
/**
 * Does the user's own brief rule photography in or out? "不要配图" / "no photos" / "text only" →
 * none; "多用图片" / "photo-heavy" → editorial; silence → undefined (the organizer decides).
 */
function photoRhythmFromNotes(...blobs) {
    const text = blobs.filter(Boolean).join("\n").toLowerCase();
    if (!text)
        return undefined;
    if (/(不要|不用|不加|无需|别加|不需要)[^。\n]{0,6}(配图|图片|照片|背景图|摄影)|纯文字|(no|without)\s+(stock\s+)?(photos?|photography|images?|pictures?)|text[-\s]only/.test(text))
        return "none";
    if (/(多用|大量|每页)[^。\n]{0,4}(配图|图片|照片)|photo[-\s]?heavy|image[-\s]?heavy|photos? on every page|full[-\s]bleed photos? throughout/.test(text))
        return "editorial";
    return undefined;
}
/**
 * Does the brief ask for photographs at all ("封面用全屏摄影", "full-bleed photography on the
 * cover")? Not a rhythm by itself — the organizer still picks where — but it rules out `none`.
 */
function notesWantPhotos(...blobs) {
    const text = blobs.filter(Boolean).join("\n").toLowerCase();
    if (!text)
        return false;
    if (photoRhythmFromNotes(text) === "none")
        return false;
    return /全屏摄影|全出血(照片|摄影|图)|背景图|配图|照片|摄影|full[-\s]bleed photo|photograph|photo background|stock (photo|image)|\bphotos?\b/.test(text);
}
/** Deck-level default: showcase decks let pictures lead; everything else keeps them to the anchor pages. */
function defaultPhotoRhythm(mode) {
    return mode === "showcase" ? "editorial" : "anchors";
}
/** Loose boolean from organizer JSON or user prose: true/false, "on"/"off", "yes"/"no", "显示"/"不要". */
function coerceFolio(raw) {
    if (typeof raw === "boolean")
        return raw;
    if (typeof raw !== "string")
        return undefined;
    const s = raw.trim().toLowerCase();
    if (/^(true|on|yes|show|显示|需要|要)$/.test(s))
        return true;
    if (/^(false|off|no|hide|none|不要|不显示|隐藏|无)$/.test(s))
        return false;
    return undefined;
}
/**
 * Does the user's own brief ask for or against page numbers? "加页码" / "with page numbers" →
 * true; "不要页码" / "no page numbers" → false; silence → undefined (the organizer decides).
 */
function folioFromNotes(...blobs) {
    const text = blobs.filter(Boolean).join("\n").toLowerCase();
    if (!text)
        return undefined;
    const mention = /页码|页号|page\s*numbers?|slide\s*numbers?|folio/;
    if (!mention.test(text))
        return undefined;
    // "页码由你决定" / "page numbers are your call" mentions them without deciding — leave it open.
    const deferred = /(页码|页号)[^。\n]{0,10}(由你|自行|你来|你定|自己)[^。\n]{0,6}(决定|判断|定)|(page|slide)\s*numbers?[^.\n]{0,40}\b(your call|up to you|you decide|at your discretion)\b/;
    if (deferred.test(text))
        return undefined;
    const negative = /(不要|不加|不需要|去掉|隐藏|无需|没有|取消|别加|不显示)[^。\n]{0,8}(页码|页号)|(no|without|hide|remove|drop|omit)\s+(page|slide)\s*numbers?|(page|slide)\s*numbers?\s*(off|hidden)/;
    return !negative.test(text);
}
/**
 * Deck-level default when neither the user nor the organizer decided: numerals help a reader
 * navigate long, formal, or instructional decks; they are noise on a short showcase.
 */
function defaultFolio(mode, pageCount) {
    if (mode === "showcase" || mode === "narrative")
        return pageCount >= 14;
    if (mode === "briefing" || mode === "instructional")
        return pageCount >= 6;
    return pageCount >= 10;
}
/** Case-insensitive enum pick: "Order" / "ORDER" → "order", "Data Dense" → "data-dense"; also matches camelCase ids like typeOnly. */
function pick(list, raw) {
    const s = String(raw ?? "").trim();
    if (!s)
        return undefined;
    const exact = list.find((x) => x === s);
    if (exact)
        return exact;
    const norm = s.toLowerCase().replace(/[\s_]+/g, "-");
    return list.find((x) => x.toLowerCase() === norm);
}
function coercePageBrief(raw) {
    if (!raw || typeof raw !== "object")
        return {};
    const o = raw;
    const coreMessage = typeof o.coreMessage === "string" ? o.coreMessage.trim().slice(0, 120) : "";
    const audienceMove = typeof o.audienceMove === "string" ? o.audienceMove.trim().slice(0, 120) : "";
    const relationships = pick(exports.RELATIONSHIPS, o.relationships ?? o.relationship);
    const rhythm = pick(exports.PAGE_RHYTHMS, o.rhythm);
    const carrier = pick(exports.CARRIERS, o.carrier ?? o.carrierHint);
    const composition = pick(exports.COMPOSITIONS, o.composition ?? o.layoutComposition);
    return {
        ...(coreMessage ? { coreMessage } : {}),
        ...(audienceMove ? { audienceMove } : {}),
        ...(relationships ? { relationships } : {}),
        ...(rhythm ? { rhythm } : {}),
        ...(carrier ? { carrier } : {}),
        ...(composition ? { composition } : {}),
    };
}
/**
 * Deterministic composition when the organizer left it blank — and the guard that
 * consecutive pages never repeat one, even when the organizer did fill it in.
 */
function defaultComposition(job, rhythm, carrier, prev, index) {
    const candidates = (() => {
        // A photograph is the page: type sits on the scrim. A sidebar strip or an accent band over a
        // full-bleed photo reads as two compositions fighting.
        if (carrier === "photo") {
            const anchorJob = job === "cover" || job === "close" || job === "section" || job === "quote" || job === "claim";
            return anchorJob || rhythm === "anchor" ? ["full-bleed", "statement"] : ["full-bleed", "split"];
        }
        if (job === "cover" || job === "close")
            return ["statement", "band", "full-bleed"];
        if (job === "section" || job === "quote" || job === "claim")
            return ["statement", "band", "sidebar"];
        if (job === "agenda")
            return ["header-stack", "split", "band"];
        if (rhythm === "anchor")
            return ["statement", "full-bleed", "band"];
        if (rhythm === "breathing")
            return ["split", "statement", "sidebar"];
        if (job === "compare")
            return ["split", "header-stack", "band"];
        if (job === "data")
            return ["header-stack", "sidebar", "split"];
        if (job === "sequence")
            return ["band", "header-stack", "sidebar"];
        return ["header-stack", "grid", "split", "sidebar", "band"];
    })();
    const rotated = candidates.filter((c) => c !== prev);
    const pool = rotated.length ? rotated : candidates;
    return pool[index % pool.length];
}
/** Enforce "no two consecutive pages share a composition" over an already-assigned list. */
function breakCompositionRuns(list, jobs) {
    const out = [...list];
    for (let i = 1; i < out.length; i++) {
        if (out[i] === out[i - 1]) {
            out[i] = defaultComposition(jobs[i] ?? "evidence", "dense", undefined, out[i - 1], i);
            if (out[i] === out[i - 1])
                out[i] = out[i] === "header-stack" ? "split" : "header-stack";
        }
    }
    return out;
}
function coerceDeckBrief(raw) {
    if (!raw || typeof raw !== "object")
        return {};
    const o = raw;
    const mode = pick(exports.DECK_MODES, o.mode);
    const systemId = (0, visual_system_js_1.normalizeSystemId)(o.systemId ?? o.visualSystemId ?? o.system);
    const paletteIntent = typeof o.paletteIntent === "string" ? o.paletteIntent.trim().slice(0, 160) : "";
    const motif = typeof o.motif === "string" ? o.motif.trim().slice(0, 120) : "";
    const folio = coerceFolio(o.folio ?? o.pageNumbers ?? o.pageNumerals ?? o.slideNumbers);
    const photoRhythm = coercePhotoRhythm(o.photoRhythm ?? o.photos ?? o.photoPolicy ?? o.photography);
    return {
        ...(mode ? { mode } : {}),
        ...(systemId ? { systemId } : {}),
        ...(paletteIntent ? { paletteIntent } : {}),
        ...(motif ? { motif } : {}),
        ...(folio != null ? { folio } : {}),
        ...(photoRhythm ? { photoRhythm } : {}),
    };
}
/**
 * Deterministic rhythm when the organizer left it blank: cover / section /
 * close anchor, every fourth content page breathes, the rest are dense.
 */
function defaultRhythm(index, total, job) {
    if (job === "cover" || job === "close" || job === "section" || job === "quote" || job === "claim")
        return "anchor";
    if (job === "agenda")
        return "breathing";
    if (index > 0 && index % 4 === 0)
        return "breathing";
    return total <= 3 ? "anchor" : "dense";
}
/** Relationship guess from the points when the organizer left it blank. */
function inferRelationship(points, job) {
    if (job === "sequence" || job === "agenda")
        return "order";
    if (job === "compare")
        return "contrast";
    const text = points.join(" ").toLowerCase();
    if (/(step|phase|first|then|finally|第一|第二|第三|步骤|阶段|然后|最后)/.test(text))
        return "order";
    if (/\bvs\.?\b|versus|before.*after|对比|相比|之前.*之后/.test(text))
        return "contrast";
    if (points.length >= 4 && points.every((p) => [...p].length <= 28))
        return "membership";
    return "none";
}
/** Builtin + registered custom system ids (custom ids use `_`, so no hyphen normalisation is applied to them). */
function systemIdsPromptLine() {
    return (0, ids_js_1.listCanvasSystemIds)().join(" | ");
}
