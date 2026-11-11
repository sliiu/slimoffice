/**
 * Ticket A — Ink Board through the AI main pipeline
 * (outline → theme → page-type fill → self-check).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Presentation, TextShape } from "@ppt/core";
import {
  COLOR_THEME_PALETTES,
  INK_BOARD,
  checkTitleHierarchy,
  generateDeck,
  lockColorTheme,
  reflectCanvas,
  reflectPainted,
  reflectPresentation,
  resolveVisualSystem,
  type PaintedSlide,
  type ReflectFinding,
} from "../deckgen/index.js";
import { contrastRatio, parseHex } from "./qa/color.js";
import { createHeadlessPort } from "../kernel/port.js";
import { defaultConfig } from "../config/types.js";
import { createToolRuntime } from "../tools/types.js";
import { shapeBasicTools } from "../tools/domains/shapes-basic.js";
import {
  isInkBoardGuidance,
  resolveDeckgenSystem,
  resolveDeckgenTheme,
  toDeckgenInput,
} from "./deckgen-adapter.js";
import { generateFromOutline } from "./pipeline.js";
import { pagesFromOutline } from "./deckgen-ui.js";
import type { Outline } from "./schema.js";

const PORCELAIN = COLOR_THEME_PALETTES.ink.bg;
const INK = COLOR_THEME_PALETTES.ink.ink;

const inkBoardOutline: Outline = {
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

describe("Ink Board pairing", () => {
  it("names editorial + ink and accepts ink-board aliases", () => {
    assert.deepEqual(INK_BOARD, { systemId: "editorial", themeId: "ink" });
    assert.equal(isInkBoardGuidance({ topic: "x", styleFamily: "editorial" }), true);
    assert.equal(isInkBoardGuidance({ topic: "x", themeId: "ink-board" }), true);
    assert.equal(isInkBoardGuidance({ topic: "x", extraNotes: "Make this an Ink Board deck" }), true);
    assert.equal(isInkBoardGuidance({ topic: "x", styleFamily: "swiss" }), false);
    assert.equal(isInkBoardGuidance({ topic: "x", styleFamily: "swiss", themeId: "ink" }), false);
    assert.throws(() => generateDeck({ topic: "Wrong pairing", systemId: "swiss", themeId: "ink" }), /cannot pair/);
    assert.equal(resolveDeckgenSystem({ topic: "x", themeId: "ink-board" }), "editorial");
    assert.equal(resolveDeckgenTheme("editorial", "ink-board"), "ink");
    const input = toDeckgenInput({ topic: "Board brief", extraNotes: "Ink Board" });
    assert.equal(input.systemId, "editorial");
    assert.equal(input.themeId, "ink");
  });
});

describe("Ink Board through generateFromOutline", () => {
  it("labels editorial · ink, covers required pages, and passes reflect hard gates", async () => {
    const pages = pagesFromOutline(inkBoardOutline);
    const used = new Set(pages.map((p) => p.layout));
    assert.ok(used.has("cover"));
    assert.ok(used.has("section"));
    assert.ok(used.has("cards") || used.has("compare") || used.has("split"));
    assert.ok(used.has("close"));

    const filled = generateDeck({
      topic: inkBoardOutline.title,
      systemId: INK_BOARD.systemId,
      themeId: INK_BOARD.themeId,
      pages,
    });
    assert.equal(filled.theme.id, "ink");
    assert.equal(filled.system.id, "editorial");
    assert.equal(filled.reflect.passed, true, filled.reflect.findings.map((f) => f.issue).join("; "));
    assert.equal(reflectPainted(filled.painted, filled.system, filled.theme).passed, true);
    const canvas = reflectCanvas(filled.painted, filled.system, filled.theme);
    const blocking = canvas.findings.filter((f) => f.kind === "design" || f.kind === "coherence" || /contrast|reading|composition/i.test(f.issue));
    assert.deepEqual(blocking, [], blocking.map((f) => `[${f.kind} #${f.slideIdx}] ${f.issue}`).join("; "));

    const pres = await generateFromOutline(
      inkBoardOutline,
      { topic: inkBoardOutline.title, styleFamily: "editorial", themeId: "ink" },
      { wallClock: false, enableAnimations: false, enableArtDirector: false, enableImageEnrichment: false, enableQaRepair: false },
    );
    const meta = pres.meta as { deckgen: { system: string; theme: string } };
    assert.equal(meta.deckgen.system, "editorial");
    assert.equal(meta.deckgen.theme, "ink");
    assert.equal(pres.theme?.colors?.bg, PORCELAIN);
    assert.equal(pres.theme?.colors?.accent, INK);

    const layouts = pres.slides.map((s) => s.customData?.tags?.layout);
    assert.ok(layouts.includes("cover"));
    assert.ok(layouts.includes("section"));
    assert.ok(layouts.some((l) => l === "cards" || l === "compare" || l === "split"));
    assert.ok(layouts.includes("close"));
    for (const slide of pres.slides) {
      assert.equal(slide.customData?.tags?.system, "editorial");
      assert.equal(slide.customData?.tags?.theme, "ink");
    }

    const paper = parseHex(PORCELAIN)!;
    const titles = titleShapes(pres);
    assert.ok(titles.length >= 4, `titles=${titles.length}`);
    for (const t of titles) {
      const color = t.paragraphs[0]?.runs[0]?.color ?? INK;
      assert.notEqual(color.toLowerCase(), COLOR_THEME_PALETTES.ink.muted.toLowerCase(), `gray-on-mud: ${t.name}`);
      const fg = parseHex(color);
      assert.ok(fg, color);
      const ratio = contrastRatio(fg!, paper);
      assert.ok(ratio >= 7, `${t.name} contrast ${ratio.toFixed(2)} on porcelain`);
    }

    const emitted = reflectPresentation(pres, resolveVisualSystem("editorial"), lockColorTheme("editorial", "ink"));
    assert.equal(emitted.passed, true, emitted.findings.map((f) => f.issue).join("; "));
  });

  it("playground tools can open the deck and edit one field", async () => {
    const pres = await generateFromOutline(
      inkBoardOutline,
      { topic: inkBoardOutline.title, extraNotes: "Ink Board" },
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
      paragraphs: ["Edited Ink Board title"],
    });
    assert.equal(res.ok, true, res.error ?? "");
    const edited = port.getPres();
    const texts = textShapes(edited).map((s) => s.paragraphs.flatMap((p) => p.runs.map((r) => r.text)).join(""));
    assert.ok(texts.includes("Edited Ink Board title"));
  });
});

describe("Ink Board title hierarchy gate", () => {
  it("rejects muted titles on porcelain (gray-on-mud)", () => {
    const theme = lockColorTheme("editorial", "ink");
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
            color: COLOR_THEME_PALETTES.ink.muted,
            backdrop: PORCELAIN,
          },
        ],
      },
    ] as unknown as PaintedSlide[];
    const findings: ReflectFinding[] = [];
    checkTitleHierarchy(slides, theme, findings);
    assert.ok(findings.some((f) => /gray-on-mud/.test(f.issue)), findings.map((f) => f.issue).join("; "));
  });
});
