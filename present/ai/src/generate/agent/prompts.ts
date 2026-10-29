import { getEnabledSkillFragments } from "../../skills/registry";
import type { HostSkillStore } from "../../skills/types";
import type { GuidanceInput, Outline, OutlineItem } from "../schema";
import { guidanceHardConstraints, guidancePaintConstraints } from "../prompts";
import type { Manuscript, SlideBrief } from "./roles";
import { listCanvasSystemIds } from "../../deckgen/ids.js";
import { COPY_VOICE_BLOCK } from "../copy-voice.js";
import { CARRIERS, COMPOSITIONS, COMPOSITION_HINTS, DECK_MODES, DECK_MODE_HINTS, PAGE_RHYTHMS, PHOTO_RHYTHMS, PHOTO_RHYTHM_HINTS, RELATIONSHIPS } from "../../deckgen/brief.js";

export function researchSystemPrompt(host?: HostSkillStore): string {
  return [
    "You research facts for a presentation.",
    "Turn the user's brief into a manuscript: thesis, sections, and source-grounded facts.",
    "Do not invent citations, numbers, or product claims. Prefer concrete, presentable facts over prose.",
    "Do not write cover, section-divider, or closing slides — those already exist in the outline.",
    "HARD: every title, summary, and fact MUST be in the requested language. Do not switch languages.",
    'JSON only (exact keys): { "title", "language", "thesis", "sections": [{ "title", "summary", "facts": ["..."] }] }.',
    "Do NOT emit slides, layoutHint, bullets, or speaker_notes.",
    ...getEnabledSkillFragments({ stage: "outline", host }),
  ].join("\n");
}

export function researchUserPrompt(guidance: GuidanceInput, outline: Outline): string {
  const lines = [
    guidanceHardConstraints(guidance),
    "",
    `Topic: ${guidance.topic}`,
    "",
    "Approved outline (slideIdx is 0-based):",
    `Title: ${outline.title}`,
    outline.subtitle ? `Subtitle: ${outline.subtitle}` : "",
    ...outline.slides.map((s, i) => `  slideIdx=${i} [${s.layoutHint ?? "content"}] ${s.title}`),
  ];
  return lines.filter((l) => l !== "").join("\n");
}

export function contentOrganizerSystemPrompt(): string {
  return [
    "You write speaker-ready key points for one slide.",
    "Only use manuscript facts.",
    "Content slides: 4–6 keyPoints, each a concrete fact / number / mechanism — never a bare label.",
    "Cover / section / closing: 1–2 keyPoints plus speaker notes.",
    "HARD: keyPoints and speaker notes MUST be in the requested language.",
    COPY_VOICE_BLOCK,
  ].join("\n");
}

export function contentOrganizerUserPrompt(args: {
  outline: Outline;
  item: OutlineItem;
  slideIdx: number;
  manuscript: Manuscript;
  language?: string;
}): string {
  const ms = args.manuscript.sections
    .map((s) => `## ${s.title}\n${s.summary}\n${s.facts.map((f) => `- ${f}`).join("\n")}`)
    .join("\n\n");
  return [
    `Presentation: ${args.outline.title}`,
    `Outline (slideIdx is 0-based):\n${args.outline.slides.map((s, i) => `slideIdx=${i}: ${s.title}`).join("\n")}`,
    `slideIdx=${args.slideIdx} (0-based): ${args.item.title}`,
    `layout: ${args.item.layoutHint ?? "content"}`,
    args.item.bullets?.length ? `Outline bullets:\n${args.item.bullets.map((b) => `- ${b}`).join("\n")}` : "",
    args.item.imageIdea ? `Image direction: ${args.item.imageIdea}` : "",
    args.language ? `HARD: Language: write keyPoints and speaker notes in ${args.language}.` : "",
    "",
    "Manuscript:",
    `Thesis: ${args.manuscript.thesis}`,
    ms,
  ]
    .filter(Boolean)
    .join("\n");
}

export function organizeDeckSystemPrompt(host?: HostSkillStore): string {
  const skillFragments = getEnabledSkillFragments({ stage: "outline", host });
  return [
    "You write speaker-ready key points for every outline slide AND the deck's Design Brief.",
    "Same order, same count as the outline. Only use manuscript facts.",
    "Content slides: 4–6 keyPoints, each a concrete fact / number / mechanism — never a bare label.",
    "Cover / section / closing: 1–2 keyPoints plus speaker notes.",
    "HARD: every keyPoints item, coreMessage, and speaker notes MUST be in the requested language.",
    COPY_VOICE_BLOCK,
    "",
    "DESIGN BRIEF (deck):",
    `  mode ∈ { ${DECK_MODES.join(" | ")} } — ${DECK_MODES.map((m) => `${m}: ${DECK_MODE_HINTS[m]}`).join("; ")}.`,
    `  systemId ∈ { ${listCanvasSystemIds().join(" | ")} } — pick for audience and tone, not by default.`,
    "  paletteIntent: one line (warm/cool, paper tone, brand hex if the brief has one). motif: one repeatable mark (rule position, numeral style, corner tag).",
    "  folio: true|false — page numerals on content pages. true for briefing / instructional / formal or long decks (≥ 10 pages) and whenever the user asked for page numbers; false for showcase / narrative / short decks or when the user asked for none.",
    `  photoRhythm ∈ { ${PHOTO_RHYTHMS.join(" | ")} } — ${PHOTO_RHYTHMS.map((r) => `${r}: ${PHOTO_RHYTHM_HINTS[r]}`).join("; ")}. One decision for the deck; per-page carrier=photo is honoured only under editorial.`,
    "DESIGN BRIEF (per slide):",
    "  coreMessage: the one thing the page must get across, as a plain full sentence a reader could repeat (title-worthy; not a slogan, not an antithesis).",
    "  audienceMove: 'reader goes from A to B'.",
    `  relationships ∈ { ${RELATIONSHIPS.join(" | ")} } — how the keyPoints relate. Use none only when they are truly independent facts.`,
    `  rhythm ∈ { ${PAGE_RHYTHMS.join(" | ")} } — anchor for cover / section / claim / close, breathing at least every 4th content page, dense otherwise.`,
    `  carrier ∈ { ${CARRIERS.join(" | ")} } — what should lead the page: chart/table when there are numbers, photo when imagery matters, diagram/device for relationships, typeOnly for a single claim.`,
    `  composition ∈ { ${COMPOSITIONS.join(" | ")} } — ${COMPOSITIONS.map((c) => `${c}: ${COMPOSITION_HINTS[c]}`).join("; ")}. HARD: two consecutive slides never share a composition; cover and close are statement or full-bleed.`,
    "  imageIdea: for every slide with carrier=photo, and for at least one of every 3–4 content slides, a stock-photo SEARCH PHRASE in English: one real subject + setting + light, 4–10 words (\"laptop on lectern, dark stage, rim light\"). It is fed to a stock-photo search verbatim, so: no split-screen / montage / conceptual composites, no negations (\"no text\" is not searchable), and no subjects that carry writing — whiteboards, signage, documents, sticky notes, screens with UI — they fight the slide's own copy. Sensory / place / people topics deserve more photo pages; abstract metrics fewer.",
    ...(skillFragments.length ? ["", "STYLE GUIDANCE (enabled skills — when one names a visual system or look, the Design Brief follows it):", ...skillFragments] : []),
  ].join("\n");
}

export function organizeDeckUserPrompt(args: {
  outline: Outline;
  manuscript: Manuscript;
  language?: string;
}): string {
  const ms = args.manuscript.sections
    .map((s) => `## ${s.title}\n${s.summary}\n${s.facts.map((f) => `- ${f}`).join("\n")}`)
    .join("\n\n");
  return [
    `Presentation: ${args.outline.title}`,
    args.language ? `HARD: Language: ${args.language}.` : "",
    `Thesis: ${args.manuscript.thesis}`,
    "",
    "Manuscript:",
    ms,
    "",
    "Outline (emit one brief per row, same order; slideIdx is 0-based):",
    ...args.outline.slides.map(
      (s, i) =>
        `slideIdx=${i} [${s.layoutHint ?? "content"}] ${s.title}${s.bullets?.length ? ` — ${(s.bullets ?? []).join(" / ")}` : ""}`,
    ),
    "",
    `JSON: { "deck": { "mode", "systemId", "paletteIntent", "motif", "folio", "photoRhythm" }, "slides": [{ "purpose", "topic", "keyPoints": ["..."], "notes"?, "coreMessage", "audienceMove", "relationships", "rhythm", "carrier", "composition", "imageIdea"? }] } with exactly ${args.outline.slides.length} slides.`,
  ]
    .filter((l) => l !== "")
    .join("\n");
}

export function painterSystemPrompt(args: {
  host?: HostSkillStore;
  mode: "freeform" | "reference";
  allowImagery: boolean;
  styleFamily?: string;
  hasDesignBrief?: boolean;
}): string {
  const skillFragments = args.hasDesignBrief
    ? []
    : getEnabledSkillFragments({
        stage: "slide",
        host: args.host,
        ...(args.styleFamily ? { styleFamily: args.styleFamily } : {}),
      });
  const mode =
    args.mode === "reference"
      ? [
          "This slide already has a layout. Keep positions, decorations, photos, and the given colors.",
          "Change text with `replaceShapeText` / `setShapeTextStyle`. Add SmartArt / WordArt / a chart only if the slide still looks empty.",
          "Do not rebuild the slide. Do not insert tables. Do not change the background. Do not invent colors.",
        ]
      : [
          "This slide already has a compiled skeleton. Fill existing text shapes first (`replaceShapeText`, `setTextBody { autoFit: \"normAutofit\" }`).",
          "You MAY add SmartArt / a chart / WordArt / one accent shape, and you MAY moveShape inside the margin.",
          "Do NOT insert extra title or body text boxes on top of existing ones. Do NOT insert a blank slide.",
          "Use slideIdx from the user message (0-based).",
        ];

  return [
    "You edit one slide in a presentation editor.",
    "Use editing tools. Do not dump JSON. Do not ask questions. Do not recap.",
    "Call several edit tools in ONE step, then stop. Do not list, search, or discover.",
    "Shape ids are in the snapshot.",
    "",
    ...mode,
    "",
    "Slide size is typically 1280×720. Keep 5% margin. Title y ≈ 8% of height. Body from ≈ 22%.",
    "HARD bbox: x ≥ 0.05W, y ≥ 0.05H, x+w ≤ 0.95W, y+h ≤ 0.95H. No overflow. No overlapping titles.",
    "NEVER a full-slide rectangle. No negative image bbox. Use only Palette colors, or `#f8fafc` / `#0f172a` for contrast.",
    "New shapes land on TOP. Covering text → `reorderShape { direction: \"back\" }`. Never prefix ids with `dec_`.",
    "Contrast: body ≥ 4.5:1, title ≥ 3:1.",
    "Put EVERY key point on the slide. Sparse pages fail. Growing text → `setTextBody { autoFit: \"normAutofit\" }`.",
    "Add visuals if still sparse: process/list bullets → `convertToSmartArt`; numbers with no chart → `insertChart` using Palette accents; cover/hero title still plain → `insertWordArt` (dark: fillAccent1GlowAccent2; light: outlineAccent1). Do not search or embed fonts. Skip photos and 3D.",
    "Speaker notes: `setSlideNotes` 60–160 chars. `renameSlide` to a short title.",
    "HARD: every visible string and speaker notes must match Language.",
    "",
    ...(skillFragments.length > 0 ? skillFragments : []),
  ].join("\n");
}

export function painterUserPrompt(args: {
  outline: Outline;
  item: OutlineItem;
  slideIdx: number;
  brief: SlideBrief;
  manuscript: Manuscript;
  language?: string;
  styleFamily?: string;
  designBrief?: string;
  slotMap?: string;
  size: { width: number; height: number };
  palette?: Record<string, string>;
  guidance?: GuidanceInput;
  snapshot?: string;
  findings?: string;
}): string {
  const slides = args.outline.slides;
  const i = args.slideIdx;
  const neighbors = [
    i > 0 ? `prev slideIdx=${i - 1}: ${slides[i - 1]!.title}` : "",
    `this slideIdx=${i}: ${args.item.title}`,
    i + 1 < slides.length ? `next slideIdx=${i + 1}: ${slides[i + 1]!.title}` : "",
  ].filter(Boolean);
  return [
    args.guidance ? guidancePaintConstraints(args.guidance) : "",
    `Edit slideIdx=${i} (0-based). Slide size ${args.size.width}×${args.size.height}.`,
    `Presentation: ${args.outline.title}`,
    args.styleFamily && !args.designBrief ? `Style family: ${args.styleFamily}` : "",
    args.palette ? `Palette: ${JSON.stringify(args.palette)}` : "",
    args.designBrief ? `Design brief:\n${args.designBrief}` : "",
    neighbors.join("\n"),
    `layout: ${args.item.layoutHint ?? "content"}`,
    "Key points:",
    ...args.brief.keyPoints.map((p) => `- ${p}`),
    args.brief.notes ? `Speaker notes: ${args.brief.notes}` : args.item.notes ? `Speaker notes: ${args.item.notes}` : "",
    args.slotMap ? `Reference slots:\n${args.slotMap}` : "",
    args.snapshot ? `Snapshot:\n${args.snapshot}` : "",
    args.findings ? `Fix these issues:\n${args.findings}` : "",
    "Put every key point on this slide. No empty body. Stay inside the 5% margin.",
    "Edit this slide now in one step, then stop.",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

export function directorSystemPrompt(args: {
  host?: HostSkillStore;
  styleFamily?: string;
  hasDesignBrief?: boolean;
}): string {
  const skillFragments = args.hasDesignBrief
    ? []
    : getEnabledSkillFragments({
        stage: "slide",
        host: args.host,
        ...(args.styleFamily ? { styleFamily: args.styleFamily } : {}),
      });
  return [
    "You edit middle slides of a presentation. Do not rebuild. Do not recap.",
    "Leave cover / hero / closing alone. Edit the other slides.",
    "Use `insertChart` when a slide has numbers and no chart yet. One chart per slide. Place it under the title, 5% margin. Chart `colors` MUST be Palette accents.",
    "You may convert sparse bullets to SmartArt or add one WordArt title with `insertWordArt` (no preset list).",
    "You may add one accent shape. Never a full-slide rectangle. Never prefix ids with `dec_`. Do not change the background or invent colors.",
    "Do not insert tables. Do not dump text boxes. Do not list shapes. Do not search fonts.",
    "Call several tools in ONE step. Stop after at most 3 edits.",
    "HARD: visible strings must match Language.",
    ...(skillFragments.length > 0 ? ["", ...skillFragments] : []),
  ].join("\n");
}

export function directorUserPrompt(args: {
  outline: Outline;
  size: { width: number; height: number };
  snapshot: string;
  language?: string;
  styleFamily?: string;
  palette?: Record<string, string>;
  guidance?: GuidanceInput;
}): string {
  return [
    args.guidance ? guidancePaintConstraints(args.guidance) : "",
    `Edit middle slides. Slide size ${args.size.width}×${args.size.height}.`,
    `Presentation: ${args.outline.title}`,
    args.styleFamily ? `Style family: ${args.styleFamily}` : "",
    args.palette ? `Palette: ${JSON.stringify(args.palette)}` : "",
    "Outline (slideIdx is 0-based):",
    ...args.outline.slides.map((s, i) => `slideIdx=${i} [${s.layoutHint ?? "content"}] ${s.title}`),
    `Snapshot:\n${args.snapshot}`,
    "Edit now in one step. Then stop.",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

export function reflectorSystemPrompt(host?: HostSkillStore): string {
  return [
    "You fix review findings with editing tools.",
    "Do not rebuild slides. Do not call createSlide.",
    "Do not change backgrounds. Do not invent colors.",
    "You MAY convertToSmartArt, insertWordArt, insertChart, move/reorder/recolor text.",
    "Edit in one step, then stop.",
    ...getEnabledSkillFragments({ stage: "slide", host }),
  ].join("\n");
}

export function reflectorUserPrompt(
  outline: Outline,
  guidance?: GuidanceInput,
  findings?: string,
): string {
  return [
    "Fix these findings with tools. slideIdx is 0-based.",
    guidance ? guidancePaintConstraints(guidance) : "",
    `Presentation: ${outline.title}`,
    findings ? `Findings:\n${findings}` : "",
    "When done, stop.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function themeAgentUserPrompt(guidance: GuidanceInput): string {
  return [
    "Design and apply a visual theme for the whole presentation.",
    guidanceHardConstraints(guidance),
    `Topic: ${guidance.topic}`,
    "Call generateAndApplyTheme with withMotion:false. Then stop.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function motionAgentUserPrompt(args: { style?: string; topic?: string }): string {
  return [
    "Apply entrance animations and slide transitions to the whole presentation.",
    args.topic ? `Topic: ${args.topic}` : "",
    args.style
      ? `HARD: Call applyMainstreamAnimations without slideIdx, style=${args.style}.`
      : "Call applyMainstreamAnimations without slideIdx.",
    "Then stop.",
  ]
    .filter(Boolean)
    .join("\n");
}
