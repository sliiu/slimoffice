import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SLOT_CAPS } from "../deckgen/ids.js";
import { clampOutlineToDeckgenSlots, specFromOutlineImagery } from "./polish.js";
import { generateFromOutline } from "./pipeline.js";
import type { Outline } from "./schema.js";

const outline: Outline = {
  title: "Why local-first decks win",
  themeId: "ai",
  slides: [
    { title: "Own the file", layoutHint: "cover", imageIdea: "open notebook on a desk, morning light" },
    {
      title: "Offline edit",
      layoutHint: "bullets",
      deckgenLayout: "bullets",
      deckgenVariant: "title-5",
      bullets: ["one", "two", "three", "four", "five"],
    },
    { title: "Export remains a round-trip", layoutHint: "closing" },
  ],
};

describe("deckgen polish helpers", () => {
  it("clamps organize-sized bullet lists to slot caps", () => {
    const oversized: Outline = {
      ...outline,
      slides: outline.slides.map((s, i) =>
        i === 1
          ? { ...s, bullets: ["one", "two", "three", "four", "five", "six", "seven", "eight"] }
          : s,
      ),
    };
    const clamped = clampOutlineToDeckgenSlots(oversized);
    assert.equal(clamped.slides[1]?.bullets?.length, SLOT_CAPS.bulletItems);
    assert.deepEqual(clamped.slides[1]?.bullets, ["one", "two", "three", "four", "five"]);
  });

  it("maps cover imageIdea to a background query", () => {
    const spec = specFromOutlineImagery(outline);
    const cover = spec.slides[0] as { bgImageQuery?: string; bgOverlay?: number };
    assert.equal(cover.bgImageQuery, "open notebook on a desk, morning light");
    assert.equal(cover.bgOverlay, 0.55);
  });
});

describe("generateFromOutline polish without a key", () => {
  it("still compiles via deckgen and runs QA, skipping research", async () => {
    const keys: string[] = [];
    const pres = await generateFromOutline(outline, { topic: "Ignored", styleFamily: "editorial" }, {
      wallClock: false,
      enableImageEnrichment: false,
      enableArtDirector: false,
      enableAnimations: false,
      onProgress: (p) => {
        if (p.detailKey) keys.push(p.detailKey);
      },
    });
    assert.equal(pres.slides.length, outline.slides.length);
    assert.ok((pres.meta as { deckgen?: { system?: string } }).deckgen?.system);
    assert.ok(!keys.includes("research.drafting"));
    assert.ok(keys.includes("qa.checking"));
  });
});
