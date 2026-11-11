/**
 * Ticket B — Folio through the AI main pipeline
 * (outline → theme → page-type fill → self-check).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Presentation, TextShape } from "@ppt/core";
import {
  COLOR_THEME_PALETTES,
  FOLIO,
  checkTitleHierarchy,
  compileCanvasDeck,
  generateDeck,
  lockColorTheme,
  reflectCanvas,
  reflectPainted,
  reflectPresentation,
  resolveVisualSystem,
  type PaintedSlide,
  type ReflectFinding,
} from "../deckgen/index.js";
import type { FilledSlide } from "../deckgen/ir.js";
import { pageNumeralOf } from "../deckgen/snap.js";
import { contrastRatio, parseHex } from "./qa/color.js";
import { createHeadlessPort } from "../kernel/port.js";
import { defaultConfig } from "../config/types.js";
import { createToolRuntime } from "../tools/types.js";
import { shapeBasicTools } from "../tools/domains/shapes-basic.js";
import {
  isFolioGuidance,
  isInkBoardGuidance,
  resolveDeckgenSystem,
  resolveDeckgenTheme,
  toDeckgenInput,
  withFolioDecision,
} from "./deckgen-adapter.js";
import { generateFromOutline } from "./pipeline.js";
import { pagesFromOutline } from "./deckgen-ui.js";
import type { Outline } from "./schema.js";

const PAPER = COLOR_THEME_PALETTES.ikb.bg;
const INK = COLOR_THEME_PALETTES.ikb.ink;
const IKB = COLOR_THEME_PALETTES.ikb.accent;

const folioOutline: Outline = {
  title: "Why local-first decks win",
  subtitle: "Product leads",
  themeId: "ai",
  slides: [
    { title: "Own the file", layoutHint: "cover" },
    { title: "The case", layoutHint: "section" },
    {
      title: "Four holds",
      layoutHint: "cards",
      bullets: ["Offline edit stays", "Export is a round-trip", "Tokens lock the look", "Narrative then skin"],
    },
    {
      title: "File versus tab",
      layoutHint: "comparison",
      bullets: ["Own the file", "No tab lock-in", "Export stays a trip", "Cloud is a copy"],
    },
    {
      title: "Ship the file",
      layoutHint: "closing",
      bullets: ["Keep the file", "Keep the look", "Keep the motion"],
    },
  ],
};

function textShapes(pres: Presentation): TextShape[] {
  const out: TextShape[] = [];
  const walk = (sh: { kind: string; children?: unknown[] }): void => {
    if (sh.kind === "text") out.push(sh as TextShape);
    if (sh.kind === "group") for (const c of sh.children ?? []) walk(c as never);
  };
  for (const slide of pres.slides) {
    for (const layer of slide.layers) for (const sh of layer.shapes) walk(sh);
  }
  return out;
}

function titleShapes(pres: Presentation): TextShape[] {
  return textShapes(pres).filter((s) => /slot:(title|claim)$/i.test(s.name ?? ""));
}

function textPage(layout: string, title: string): FilledSlide {
  const sys = resolveVisualSystem("swiss");
  return {
    layout,
    variant: "canvas",
    elements: [
      {
        slot: "title",
        kind: "text",
        name: "slot:title",
        bbox: { x: 64, y: 60, w: 900, h: 60 },
        paintRole: "ink",
        text: title,
        fontSize: sys.typeScale.h1,
      },
      {
        slot: "body",
        kind: "text",
        name: "slot:body",
        bbox: { x: 64, y: 160, w: 900, h: 120 },
        paintRole: "ink",
        text: "Body copy that says something concrete about the topic at hand.",
        fontSize: sys.typeScale.body,
      },
    ],
  };
}

describe("Folio pairing", () => {
  it("names swiss + ikb and accepts folio / ikb aliases", () => {
    assert.deepEqual(FOLIO, { systemId: "swiss", themeId: "ikb" });
    assert.equal(isFolioGuidance({ topic: "x", styleFamily: "swiss" }), true);
    assert.equal(isFolioGuidance({ topic: "x", themeId: "folio" }), true);
    assert.equal(isFolioGuidance({ topic: "x", themeId: "ikb" }), true);
    assert.equal(isFolioGuidance({ topic: "x", extraNotes: "Make this a Folio deck" }), true);
    assert.equal(isFolioGuidance({ topic: "x", styleFamily: "swiss", themeId: "ai" }), true);
    assert.equal(isFolioGuidance({ topic: "x", styleFamily: "editorial" }), false);
    assert.equal(isFolioGuidance({ topic: "x", themeId: "ink" }), false);
    assert.equal(isFolioGuidance({ topic: "x", themeId: "indigo" }), false);
    assert.equal(isFolioGuidance({ topic: "x", themeId: "kraft" }), false);
    assert.equal(isFolioGuidance({ topic: "x", styleFamily: "swiss", themeId: "signal" }), false);
    assert.equal(isFolioGuidance({ topic: "x", styleFamily: "swiss", themeId: "lemon" }), false);
    assert.equal(isFolioGuidance({ topic: "x", extraNotes: "Ink Board" }), false);
    assert.equal(isInkBoardGuidance({ topic: "x", extraNotes: "Make this a Folio deck" }), false);
    assert.equal(isInkBoardGuidance({ topic: "x", styleFamily: "editorial" }), true);
    assert.throws(() => generateDeck({ topic: "Wrong pairing", systemId: "swiss", themeId: "ink" }), /cannot pair/);
    assert.throws(() => generateDeck({ topic: "Wrong pairing", systemId: "editorial", themeId: "ikb" }), /cannot pair/);
    assert.equal(resolveDeckgenSystem({ topic: "x", themeId: "folio" }), "swiss");
    assert.equal(resolveDeckgenTheme("swiss", "folio"), "ikb");
    const input = toDeckgenInput({ topic: "Folio brief", extraNotes: "Folio" });
    assert.equal(input.systemId, "swiss");
    assert.equal(input.themeId, "ikb");
    const swiss = toDeckgenInput({ topic: "Swiss default", styleFamily: "swiss" });
    assert.equal(swiss.systemId, "swiss");
    assert.equal(swiss.themeId, "ikb");
    const editorialIkb = toDeckgenInput({ topic: "x", styleFamily: "editorial", themeId: "ikb" });
    assert.equal(editorialIkb.systemId, "editorial");
    assert.equal(editorialIkb.themeId, "ink");
  });
});

describe("Folio through generateFromOutline", () => {
  it("labels swiss · ikb, covers required pages, and passes reflect hard gates", async () => {
    const pages = pagesFromOutline(folioOutline);
    const used = new Set(pages.map((p) => p.layout));
    assert.ok(used.has("cover"));
    assert.ok(used.has("section"));
    assert.ok(used.has("cards") || used.has("compare") || used.has("split"));
    assert.ok(used.has("close"));

    const filled = generateDeck({
      topic: folioOutline.title,
      systemId: FOLIO.systemId,
      themeId: FOLIO.themeId,
      pages,
    });
    assert.equal(filled.theme.id, "ikb");
    assert.equal(filled.system.id, "swiss");
    assert.equal(filled.reflect.passed, true, filled.reflect.findings.map((f) => f.issue).join("; "));
    assert.equal(reflectPainted(filled.painted, filled.system, filled.theme).passed, true);
    const canvas = reflectCanvas(filled.painted, filled.system, filled.theme);
    const blocking = canvas.findings.filter((f) => f.kind === "design" || f.kind === "coherence" || /contrast|reading|composition/i.test(f.issue));
    assert.deepEqual(blocking, [], blocking.map((f) => `[${f.kind} #${f.slideIdx}] ${f.issue}`).join("; "));

    const pres = await generateFromOutline(
      folioOutline,
      { topic: folioOutline.title, styleFamily: "swiss", themeId: "ikb" },
      { wallClock: false, enableAnimations: false, enableArtDirector: false, enableImageEnrichment: false, enableQaRepair: false },
    );
    const meta = pres.meta as { deckgen: { system: string; theme: string } };
    assert.equal(meta.deckgen.system, "swiss");
    assert.equal(meta.deckgen.theme, "ikb");
    assert.equal(pres.theme?.colors?.bg, PAPER);
    assert.equal(pres.theme?.colors?.accent, IKB);

    const layouts = pres.slides.map((s) => s.customData?.tags?.layout);
    assert.ok(layouts.includes("cover"));
    assert.ok(layouts.includes("section"));
    assert.ok(layouts.some((l) => l === "cards" || l === "compare" || l === "split"));
    assert.ok(layouts.includes("close"));
    for (const slide of pres.slides) {
      assert.equal(slide.customData?.tags?.system, "swiss");
      assert.equal(slide.customData?.tags?.theme, "ikb");
    }

    const paper = parseHex(PAPER)!;
    const titles = titleShapes(pres);
    assert.ok(titles.length >= 4, `titles=${titles.length}`);
    for (const t of titles) {
      const color = t.paragraphs[0]?.runs[0]?.color ?? INK;
      assert.notEqual(color.toLowerCase(), COLOR_THEME_PALETTES.ikb.muted.toLowerCase(), `gray-on-mud: ${t.name}`);
      const fg = parseHex(color);
      assert.ok(fg, color);
      const ratio = contrastRatio(fg!, paper);
      assert.ok(ratio >= 7, `${t.name} contrast ${ratio.toFixed(2)} on swiss paper`);
    }

    const emitted = reflectPresentation(pres, resolveVisualSystem("swiss"), lockColorTheme("swiss", "ikb"));
    assert.equal(emitted.passed, true, emitted.findings.map((f) => f.issue).join("; "));
  });

  it("playground tools can open the deck and edit one field", async () => {
    const pres = await generateFromOutline(
      folioOutline,
      { topic: folioOutline.title, extraNotes: "Folio" },
      { wallClock: false, enableAnimations: false, enableArtDirector: false, enableImageEnrichment: false, enableQaRepair: false },
    );
    const title = titleShapes(pres)[0];
    assert.ok(title, "need a title field to edit");
    const slideIdx = pres.slides.findIndex((s) => s.layers.some((l) => l.shapes.some((sh) => sh.id === title!.id)));
    assert.ok(slideIdx >= 0);
    const port = createHeadlessPort(pres);
    const rt = createToolRuntime({ port, getConfig: () => defaultConfig() });
    const tool = shapeBasicTools.find((t) => t.name === "replaceShapeText") as {
      execute: (runtime: typeof rt, input: { slideIdx: number; shapeId: string; paragraphs: string[] }) => Promise<{ ok: boolean; error?: string }>;
    };
    const res = await tool.execute(rt, {
      slideIdx,
      shapeId: title!.id,
      paragraphs: ["Edited Folio title"],
    });
    assert.equal(res.ok, true, res.error ?? "");
    const edited = port.getPres();
    const texts = textShapes(edited).map((s) => s.paragraphs.flatMap((p) => p.runs.map((r) => r.text)).join(""));
    assert.ok(texts.includes("Edited Folio title"));
  });
});

describe("Folio page numbers stay on DeckBrief.folio", () => {
  it("turns numbering on and off from that field only", () => {
    const system = resolveVisualSystem("swiss");
    const theme = lockColorTheme("swiss", "ikb");
    const slides = [textPage("cover", "Cover"), textPage("evidence", "One"), textPage("evidence", "Two"), textPage("close", "Close")];
    const on = compileCanvasDeck({ system, theme, title: "t", slides, folio: true });
    assert.equal((on.presentation.meta as { deckgen: { folio?: boolean; theme: string; system: string } }).deckgen.folio, true);
    assert.equal((on.presentation.meta as { deckgen: { theme: string; system: string } }).deckgen.system, "swiss");
    assert.equal((on.presentation.meta as { deckgen: { theme: string } }).deckgen.theme, "ikb");
    assert.equal(pageNumeralOf(on.painted[0]!.elements), undefined, "cover stays unnumbered");
    assert.equal(pageNumeralOf(on.painted[1]!.elements)?.text, "02");
    assert.equal(pageNumeralOf(on.painted[2]!.elements)?.text, "03");
    assert.equal(pageNumeralOf(on.painted[3]!.elements), undefined, "close stays unnumbered");

    const off = compileCanvasDeck({ system, theme, title: "t", slides, folio: false });
    assert.equal((off.presentation.meta as { deckgen: { folio?: boolean } }).deckgen.folio, false);
    for (const s of off.painted) assert.equal(pageNumeralOf(s.elements), undefined);

    assert.equal(withFolioDecision({ folio: true }, { topic: "x", styleFamily: "swiss" }, 8).folio, true);
    assert.equal(withFolioDecision({}, { topic: "x", styleFamily: "swiss", pageNumbers: false }, 20).folio, false);
    assert.equal(withFolioDecision({ folio: false }, { topic: "x", extraNotes: "Make this a Folio deck" }, 8).folio, true);
  });
});

describe("Folio title hierarchy gate", () => {
  it("rejects muted titles on swiss paper (gray-on-mud)", () => {
    const theme = lockColorTheme("swiss", "ikb");
    const slides = [
      {
        layout: "cover",
        variant: "poster",
        elements: [
          {
            slot: "title",
            kind: "text",
            name: "slot:title",
            bbox: { x: 64, y: 80, w: 900, h: 80 },
            paintRole: "muted",
            text: "Muddy title",
            fontSize: 48,
            color: COLOR_THEME_PALETTES.ikb.muted,
            backdrop: PAPER,
          },
        ],
      },
    ] as unknown as PaintedSlide[];
    const findings: ReflectFinding[] = [];
    checkTitleHierarchy(slides, theme, findings);
    assert.ok(findings.some((f) => /gray-on-mud/.test(f.issue)), findings.map((f) => f.issue).join("; "));
  });
});
