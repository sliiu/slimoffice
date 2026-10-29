/**
 * LLM authors each page as a complete SlimPPT canvas (ppt-master method, our IR).
 *
 * The model outputs semantics: system, palette hex, and per page the carriers
 * (text runs, presets, icons, diagrams, devices). Geometry expansion, type
 * ramp, scrim direction, and whitelists are deterministic (snap / emit).
 */
import { CANVAS, listCanvasSystems } from "../deckgen/visual-system.js";
import { sampleCanvasRule } from "./sample-composition.js";
import { COPY_VOICE_BLOCK } from "./copy-voice.js";
import { COMPOSITION_HINTS, DECK_MODE_HINTS, PHOTO_RHYTHM_HINTS, RELATIONSHIP_CARRIERS } from "../deckgen/brief.js";
import { vocabularyPromptLines } from "../deckgen/vocab.js";
import { MAX_COPY_BLOCKS, READING_CAP } from "../deckgen/reflect-canvas.js";
import { generateJson } from "../llm/json.js";
import { CanvasDeckSchema, normalizeCanvasDeck } from "./canvas-schema.js";
import { getEnabledSkillFragments } from "../skills/registry.js";
function pageBrief(jobs, images, only) {
    return jobs
        .filter((j) => !only || only.has(j.index))
        .map((j) => {
        const src = images.get(j.index);
        const photo = src
            ? `PHOTO available for this page (${src.startsWith("data:") ? "fetched image" : src.slice(0, 64)}). Set background:{kind:"image", src:"PHOTO", scrim:{…}} — write the literal string "PHOTO" as src; the real URL is substituted after.`
            : "NO_PHOTO";
        const others = jobs
            .filter((o) => o.index !== j.index)
            .map((o) => `${o.index}:${o.job}:${o.title}`)
            .join(" | ");
        const rel = j.relationships;
        return [
            `PAGE ${j.index} job=${j.job} rhythm=${j.rhythm} relationships=${rel}${j.carrier ? ` carrier=${j.carrier}` : ""} composition=${j.composition}`,
            `composition ${j.composition}: ${COMPOSITION_HINTS[j.composition]}`,
            `title: ${j.title}`,
            j.coreMessage ? `coreMessage: ${j.coreMessage}` : "",
            j.audienceMove ? `audienceMove: ${j.audienceMove}` : "",
            j.bullets.length ? `points: ${j.bullets.join(" · ")}` : "points: (none)",
            rel !== "none" ? `carry relationships=${rel} with: ${RELATIONSHIP_CARRIERS[rel]}` : "",
            j.imageIdea ? `imageIdea: ${j.imageIdea}` : "",
            photo,
            `otherPages: ${others}`,
        ]
            .filter(Boolean)
            .join("\n");
    })
        .join("\n\n");
}
function systemBlurb(sys) {
    const t = sys.typeScale;
    return `${sys.id}: ${sys.canvas.character}; type ${[t.display, t.h1, t.h2, t.body, t.caption].join("/")}; grid ${sys.grid.columns} cols; radius ${sys.canvas.radius}; shadow ${sys.canvas.shadow ? "ok" : "no"}; glow ${sys.canvas.glow ? "ok" : "no"}; display treatment ${sys.canvas.displayTreatment}; paper ${sys.canvas.tone}.`;
}
/** Palette authoring rules: one hue family, roles that read against each other, no random hex. */
const PALETTE_RULES = [
    "PALETTE (deck-wide, 7 roles): bg = paper; surface = a card tone 1 step off bg (light paper: slightly darker, dark paper: slightly lighter); ink = body text, ≥ 7:1 on bg; muted = secondary text, ≥ 4.5:1 on bg, same hue family as ink; line = hairlines, faint (≈1.3:1 on bg); accent = ONE saturated hue, ≥ 3:1 on bg; accentSoft = a wash of accent (≈15% on bg) used for chips / bands / tints.",
    "Build the palette as one family: pick the accent hue, then tint bg/surface/line and shade ink/muted toward that same hue (2–6% chroma) so the page feels designed, not assembled. Never two competing saturated accents; brand hex, if given, IS the accent.",
    "Pairing: text on accent fill uses bg or ink (whichever contrasts more) — never muted; text on accentSoft or surface uses ink; on a photo use onPhoto. Numbers / KPI values may take accent only when accent reads ≥ 3:1 on their carrier.",
    "Every palette is re-checked and nudged to these floors automatically, but a palette that already obeys them keeps YOUR hues; one that ignores them gets shifted toward grey.",
].join("\n");
export function canvasAuthorSystemPrompt(brand, lock, brief, host, sample = false) {
    // Reading the skills first also registers any custom visual systems they define,
    // so the whitelist below already contains them.
    const skillFragments = getEnabledSkillFragments({ stage: "slide", host });
    const systems = listCanvasSystems();
    const look = lock
        ? `Keep systemId="${lock.systemId}". You may adjust palette hex if contrast failed.`
        : [
            "You choose the look for THIS brief. Do not default to a generic magazine/ink deck.",
            `systemId must be one of: ${systems.map((s) => s.id).join(" | ")}.`,
            ...systems.map(systemBlurb),
            brief?.systemId ? `The organizer suggested systemId=${brief.systemId}; follow it unless the brief clearly contradicts it.` : "",
            "Pick the system that fits topic, audience, and tone. Then author palette hex (bg, ink, accent required; surface, muted, line, accentSoft recommended) — dark paper for dark-tech / photo-editorial unless told otherwise.",
        ]
            .filter(Boolean)
            .join("\n");
    const mode = brief?.mode ? `Deck mode=${brief.mode}: ${DECK_MODE_HINTS[brief.mode]}.` : "";
    const folio = brief?.folio === true
        ? "Folio ON: every content page (not cover / close / section) carries its page numeral (index + 1, two digits \"02\") at caption size in ONE fixed position for the whole deck — bottom margin corner, or as the sidebar numeral when composition=sidebar. Same size, same paintRole, same corner everywhere; the compiler adds a missing one."
        : brief?.folio === false
            ? "Folio OFF: no page numerals anywhere — never write a bare 1–2 digit text outside a device; the compiler strips them."
            : "";
    const photos = brief?.photoRhythm
        ? `Photo rhythm=${brief.photoRhythm}: ${PHOTO_RHYTHM_HINTS[brief.photoRhythm]}. Only pages marked PHOTO available get an image background; every other page is paper — one rhythm across the deck, never a photograph on a page that was not given one.`
        : "";
    return [
        "You design a native editable slide deck as JSON canvases.",
        "Each slide is a complete page: every visible object is in elements[] or background. Do not leave empty image frames.",
        `Canvas ${CANVAS.width}x${CANVAS.height}. Type inset 5% (x 64..1216, y 36..684). Photo / overlay / bars / surfaces may bleed. Use the chosen system's grid and type ramp.`,
        look,
        mode,
        folio,
        photos,
        brief?.paletteIntent ? `Palette intent from the organizer: ${brief.paletteIntent}.` : "",
        brief?.motif ? `Cross-page motif: ${brief.motif}. Repeat it on every content page.` : "",
        brand ? `Brand accent ${brand} — use it as palette.brand / palette.accent.` : "",
        PALETTE_RULES,
        "onPhoto #F8FAFC on light photos, #0F172A on dark photos, unless you set a better hex.",
        "paintRole must be one of bg,surface,ink,muted,line,accent,accentSoft.",
        "",
        "VOCABULARY (ids outside these lists are dropped and reported back):",
        "kinds: text, image, rule, bar, surface, ellipse, line, chart, table, overlay, shape, icon, diagram, device.",
        ...vocabularyPromptLines(),
        "text: {text | runs, fontSize (REQUIRED, px from the system ramp display/h1/h2/body/caption), fontWeight?, align? start|middle|end, caps? \"all\", treatment? gradient|outline|shadow|glow}.",
        "text.treatment = art type for ONE display-size element per anchor page (cover / section / statement / close): outline = hollow stroked glyphs (editorial, swiss, brutalist), gradient = ink→accent sweep (dark-tech, soft-rounded), shadow = lift off a photo (photo-editorial). Never on body copy, never more than one per page, never on data-dense. Left unset, anchor display type gets the system default.",
        "text.runs[]: [{text, emphasis?: bold|accent|mono}] — at most 2 emphasised spans per element; use on the core sentence of each page.",
        'chart: {chart:{type: column|bar|line|area|pie|doughnut, categories:[2–8 strings], series:[{name, values:[numbers, same length as categories]}]}} — numbers from the points; if the brief has none, use clearly plausible illustrative values and label the series honestly.',
        "table: {table:{headers:[2–5 strings], rows:[[strings…] × ≤6]}} — every cell a string; no nested objects.",
        "line: dash solid|dash|dot, arrow none|end|both. shape: {kind:\"shape\", preset:\"<id>\", text?, strokeOnly?} — preset is a plain string on the element.",
        'background (optional per slide): {kind: solid, paintRole} | {kind: image, src, scrim} | {kind: linear, paintRole, toRole, angle}. Omit it for plain paper; never kind "color".',
        "",
        "RULES",
        "Type hierarchy on EVERY page: exactly one title at h1 (display on anchor pages), eyebrow/labels/captions at caption, copy at body. Never leave fontSize out and never set all text to one size — a page whose largest text is below h2 fails the gate.",
        "Content-page titles share ONE size across the deck (the system h1; slot it \"title\" — it is snapped to h1 regardless). Vary pages by composition, carrier, and colour role, not by title size. Display sizes belong to cover / close / section / statement pages only.",
        "Relationships: when a page says relationships≠none you MUST carry it in geometry (device / diagram / shape / line) — bullets alone fail the gate.",
        "Rhythm: anchor pages carry display type (≥ 1.4 × h1) or a photo field and few words; dense pages may stack a device + chart/table; breathing pages hold one idea and lots of paper.",
        COPY_VOICE_BLOCK,
        `Copy budget per page (text below h2): ≤ ${READING_CAP.default} CJK-equivalent characters (dense ≤ ${READING_CAP.dense}, breathing ≤ ${READING_CAP.breathing}, 30% less on a photo canvas) in ≤ ${MAX_COPY_BLOCKS} blocks — one phrase per step / tile description; provenance and method notes go to speaker notes, not the canvas.`,
        "Devices: at least one device or diagram on every evidence / sequence / compare / data page. Icons: ≥ 3 across the deck, always beside a label. Presets: ≥ 2 across the deck (chevron / callout / bracket / arrow, not decoration on its own).",
        "Speech order is the outline bullet array, not the visual path. Device items[] follow that array (step 1 first, even on a bottom-up timeline). Each item's visible title or body must include that bullet's words.",
        "Agenda (job=agenda): title (\"Contents\" / \"目录\" / \"Agenda\" in the deck language) + ONE agendaList device whose rows are the section pages in order — items[{title: section title, body?: one short line, target: that page's 1-based number = otherPages index + 1}]. Rows become click-to-jump links; never list the cover, the agenda itself, or the close. Any element may carry link:<page number> to jump there (e.g. a small \"↩ contents\" mark on section pages).",
        'Photography-as-canvas: when a page says PHOTO available, set background:{kind:"image", src:"PHOTO", scrim:{direction: the side the type sits on (left|right|bottom|top|radial), strength 0.6–0.85}} and put the type on the scrimmed side. Never a uniform overlay, never invent an image URL.',
        "Composition: each page names its composition — follow it literally (title position, split, header row present or not). Consecutive pages never share one; three pages in a row with the same header stack fail the gate. Vary field size, type scale, and carriers as well.",
        "Rounded corners, shadows, glow, and linear gradients are allowed only where the system says so; ≤ 2 floating (shadow/glow) objects per page.",
        "Charts and tables are native OOXML objects. No fake image src. Never write hex on elements — only paintRole.",
        'Return JSON { systemId, palette:{bg,ink,accent,...}, slides:[{ job, background?, elements:[{ kind, bbox:{x,y,w,h}, paintRole, ...}] }] }. bbox is always an object, never an array.',
        sample ? sampleCanvasRule() : "",
        ...(skillFragments.length
            ? [
                "",
                sample
                    ? "STYLE GUIDANCE (enabled skills) covers voice and wording. The sample composition wins over any visual system named here."
                    : "STYLE GUIDANCE (enabled skills). Follow it within the vocabulary and rules above; when it names a visual system, choose that systemId.",
                ...skillFragments,
            ]
            : []),
    ]
        .filter(Boolean)
        .join("\n");
}
function toDiagram(d) {
    return {
        layout: d.layout,
        items: d.items.map((it) => (typeof it === "string" ? { title: it } : { title: it.title, ...(it.body ? { body: it.body } : {}) })),
    };
}
function toDevice(d) {
    return {
        type: d.type,
        ...(d.items
            ? {
                items: d.items.map((it) => typeof it === "string"
                    ? { title: it }
                    : {
                        title: it.title ?? "",
                        ...(it.body ? { body: it.body } : {}),
                        ...(it.value ? { value: it.value } : {}),
                        ...(it.note ? { note: it.note } : {}),
                        ...(it.icon ? { icon: it.icon } : {}),
                        ...(it.target != null ? { target: it.target } : {}),
                    }),
            }
            : {}),
        ...(d.text ? { text: d.text } : {}),
        ...(d.attribution ? { attribution: d.attribution } : {}),
        ...(d.icon ? { icon: d.icon } : {}),
        ...(d.left ? { left: d.left } : {}),
        ...(d.right ? { right: d.right } : {}),
    };
}
export function toFilled(deck, jobs, images) {
    return deck.slides.slice(0, jobs.length).map((slide, i) => {
        const job = jobs[i];
        // Images are keyed by the page's deck index; in a page-scoped pass position ≠ index.
        const photo = images.get(job?.index ?? i);
        let background = slide.background
            ? {
                kind: slide.background.kind,
                ...(slide.background.src ? { src: slide.background.src } : {}),
                ...(slide.background.paintRole ? { paintRole: slide.background.paintRole } : {}),
                ...(slide.background.overlay != null ? { overlay: slide.background.overlay } : {}),
                ...(slide.background.overlayRole ? { overlayRole: slide.background.overlayRole } : {}),
                ...(slide.background.scrim
                    ? { scrim: { direction: slide.background.scrim.direction, strength: slide.background.scrim.strength ?? 0.72 } }
                    : {}),
                ...(slide.background.angle != null ? { angle: slide.background.angle } : {}),
                ...(slide.background.toRole ? { toRole: slide.background.toRole } : {}),
            }
            : undefined;
        if (photo && (!background || background.kind !== "image")) {
            // No overlayRole here: snap picks the system's dark token (`bg` on dark paper, `ink` on
            // light). Forcing `ink` painted a white radial wash over the photo on dark-tech decks with
            // white copy on top of it.
            background = { kind: "image", src: photo, overlay: 0.48 };
        }
        else if (photo && background?.kind === "image") {
            // The prompt only shows a truncated PHOTO_SRC preview; the model copies it back verbatim.
            // Always substitute the real fetched src, keep the model's scrim / overlay choices.
            background = { ...background, src: photo, ...(background.scrim || background.overlay != null ? {} : { overlay: 0.48 }) };
        }
        const elements = slide.elements.map((el, n) => ({
            slot: el.slot || `${el.kind}-${n}`,
            kind: el.kind,
            name: `slot:${el.slot || el.kind}:${n}`,
            bbox: el.bbox,
            paintRole: el.paintRole ?? (el.kind === "text" ? "ink" : "accent"),
            ...(el.text ? { text: el.text } : {}),
            ...(el.runs?.length ? { runs: el.runs } : {}),
            ...(el.fontSize != null ? { fontSize: el.fontSize } : {}),
            ...(el.fontWeight != null ? { fontWeight: el.fontWeight } : {}),
            ...(el.align ? { align: el.align } : {}),
            ...(el.src ? { src: el.src } : {}),
            ...(el.rx != null ? { rx: el.rx } : {}),
            ...(el.fillAlpha != null ? { fillAlpha: el.fillAlpha } : {}),
            ...(el.italic ? { italic: true } : {}),
            ...(el.caps ? { caps: el.caps } : {}),
            ...(el.glow ? { glow: true } : {}),
            ...(el.treatment ? { treatment: el.treatment } : {}),
            ...(el.gradient ? { gradient: el.gradient } : {}),
            ...(el.shadow ? { shadow: el.shadow } : {}),
            ...(el.chart ? { chart: el.chart } : {}),
            ...(el.table ? { table: el.table } : {}),
            ...(el.x2 != null ? { x2: el.x2 } : {}),
            ...(el.y2 != null ? { y2: el.y2 } : {}),
            ...(el.dash ? { dash: el.dash } : {}),
            ...(el.arrow ? { arrow: el.arrow } : {}),
            ...(el.preset ? { preset: el.preset } : {}),
            ...(el.strokeOnly ? { strokeOnly: true } : {}),
            ...(el.icon ? { icon: el.icon } : {}),
            ...(el.link != null ? { link: el.link } : {}),
            ...(el.diagram ? { diagram: toDiagram(el.diagram) } : {}),
            ...(el.device ? { device: toDevice(el.device) } : {}),
        }));
        return {
            layout: slide.job || job?.job || `page-${i}`,
            variant: slide.variant || "canvas",
            elements,
            ...(background ? { background } : {}),
        };
    });
}
/** 少于此页数仍一次写完。再短的稿分段没有收益。 */
export const CANVAS_CHUNK_MIN_PAGES = 10;
/** 分段多出来的写作次数。留给几何修补、文案改写和艺术总监。 */
export const CANVAS_CHUNK_MAX_EXTRA = 2;
/** 第一次画布写作之后还要留出的调用：几何修补、文案改写、艺术总监。 */
export const CANVAS_RESERVED_AFTER_AUTHOR = 3;
/**
 * 长稿可以再分几段写。`remainingBeforeAuthor` 是还没扣掉这一次画布写作时的剩余次数。
 * 短稿、或剩余次数不够留给后面三步时，返回 0（仍一次写完）。
 */
export function canvasExtraChunks(pageCount, remainingBeforeAuthor) {
    if (pageCount < CANVAS_CHUNK_MIN_PAGES)
        return 0;
    const room = remainingBeforeAuthor - 1 - CANVAS_RESERVED_AFTER_AUTHOR;
    return Math.max(0, Math.min(CANVAS_CHUNK_MAX_EXTRA, room));
}
/** 把 0..pageCount-1 切成 `1 + extraChunks` 段，每段连续、尽量等长。 */
export function canvasChunkIndexes(pageCount, extraChunks) {
    if (pageCount <= 0)
        return [];
    const chunks = 1 + Math.max(0, extraChunks);
    if (chunks <= 1)
        return [Array.from({ length: pageCount }, (_, i) => i)];
    const size = Math.ceil(pageCount / chunks);
    const out = [];
    for (let i = 0; i < pageCount; i += size) {
        out.push(Array.from({ length: Math.min(size, pageCount - i) }, (_, k) => i + k));
    }
    return out;
}
export async function authorCanvasDeck(input) {
    const only = input.only?.length ? [...new Set(input.only)].sort((a, b) => a - b) : undefined;
    const jobs = only ? input.jobs.filter((j) => only.includes(j.index)) : input.jobs;
    const scope = only
        ? [
            `Re-author ONLY pages ${only.join(", ")} — return slides[] with exactly ${only.length} entries in this order (page ${only.join(", page ")}); every other page is kept from the previous pass and is NOT in this request.`,
            input.unchanged ? `Unchanged pages, for consistency (index · job · title · composition · folio · says). Do not repeat a fact already in "says":\n${input.unchanged}` : "",
            "Match their folio numbering, header stack and title size; pick a composition that differs from the neighbouring pages.",
        ]
            .filter(Boolean)
            .join("\n")
        : "";
    const prompt = [
        `Topic: ${input.topic}`,
        input.repair ? `Repair these issues${only ? "" : ", keep the same page count"}:\n${input.repair}` : "",
        scope,
        pageBrief(input.jobs, input.images, only ? new Set(only) : undefined),
        input.sampleComposition ? `SAMPLE COMPOSITION:\n${input.sampleComposition}` : "",
    ]
        .filter(Boolean)
        .join("\n\n");
    const deck = await generateJson({
        model: input.model,
        schema: CanvasDeckSchema,
        system: canvasAuthorSystemPrompt(input.brand, input.lock, input.brief, input.host, Boolean(input.sampleComposition)),
        prompt,
        signal: input.signal,
        normalize: normalizeCanvasDeck,
        ...(input.onUsage ? { onUsage: input.onUsage } : {}),
        ...(input.onRaw ? { onRaw: input.onRaw } : {}),
    });
    return {
        systemId: deck.systemId,
        slides: toFilled(deck, jobs, input.images),
        ...(deck.palette ? { palette: deck.palette } : {}),
        ...(deck.themeId ? { themeId: deck.themeId } : {}),
    };
}
