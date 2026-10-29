/**
 * QA gates for remaining deckgen chrome (no look picker):
 * 1. No-key ColorTheme pairing still rejects illegal pairs with human error
 * 2. Outline page-lock dropdown is catalog-only; illegal values fail Build
 * 3. Errors have no stack traces in UI copy
 * 4. Result badges match generation metadata
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COLOR_THEME_IDS, COLOR_THEME_PAIRING, LAYOUT_IDS, LAYOUT_VARIANTS } from "../deckgen/index.js";
import {
  assertDeckgenBoundary,
  generatePresentationViaDeckgen,
  resolveDeckgenTheme,
  toDeckgenInput,
} from "./deckgen-adapter.js";
import {
  DeckgenUserError,
  applyOutlinePageLock,
  colorThemeOptions,
  formatDeckgenUserError,
  formatResultBadge,
  badgeFromSlideTags,
  isThemeAllowedForSystem,
  isWhitelistedLayoutVariant,
  layoutVariantOptions,
  looksLikeStackDump,
  pagesFromOutline,
  pickBadgeForeground,
  sanitizeDeckgenErrorCopy,
} from "./deckgen-ui.js";
import { generateFromOutline } from "./pipeline.js";
import type { Outline } from "./schema.js";

const baseOutline = (): Outline => ({
  title: "Why local-first decks win",
  subtitle: "Product leads",
  themeId: "ai",
  slides: [
    { title: "Own the file", deckgenLayout: "cover", deckgenVariant: "hero-title" },
    {
      title: "Offline edit",
      deckgenLayout: "bullets",
      deckgenVariant: "title-5",
      bullets: ["No tab lock-in", "File is source"],
    },
    { title: "Export stays a round-trip", deckgenLayout: "close", deckgenVariant: "next-step" },
  ],
});

describe("gate 1 — wrong themes disabled; forced pairing rejected", () => {
  it("lists every ColorTheme and disables the illegal pairing (not hidden)", () => {
    const editorial = colorThemeOptions("editorial");
    const swiss = colorThemeOptions("swiss");
    assert.equal(editorial.length, COLOR_THEME_IDS.length);
    assert.equal(swiss.length, COLOR_THEME_IDS.length);
    assert.deepEqual(
      editorial.filter((o) => o.allowed).map((o) => o.id),
      [...COLOR_THEME_PAIRING.editorial],
    );
    assert.deepEqual(
      editorial.filter((o) => !o.allowed).map((o) => o.id),
      [...COLOR_THEME_PAIRING.swiss],
    );
    assert.equal(isThemeAllowedForSystem("editorial", "ikb"), false);
    assert.equal(isThemeAllowedForSystem("swiss", "ink"), false);
    assert.ok(editorial.some((o) => o.id === "ikb" && o.allowed === false), "ikb stays visible + disabled");
    assert.ok(swiss.some((o) => o.id === "ink" && o.allowed === false), "ink stays visible + disabled");
  });

  it("chrome disables unpaired seeds; generate remaps fill instead of throwing", () => {
    assert.equal(isThemeAllowedForSystem("editorial", "ikb"), false);
    assert.equal(resolveDeckgenTheme("editorial", "ikb"), "ikb");
    assert.equal(toDeckgenInput({ topic: "x", styleFamily: "editorial", themeId: "ikb" }).themeId, "ink");
    assert.doesNotThrow(() => assertDeckgenBoundary({ topic: "x", systemId: "swiss", themeId: "ink" }));
    const pairing = new DeckgenUserError("pairing", "ColorTheme \"ikb\" cannot pair with VisualSystem \"editorial\".");
    const human = formatDeckgenUserError(pairing);
    assert.match(human, /color theme|visual system/i);
    assert.ok(!looksLikeStackDump(human));
    assert.ok(!/at\s+\S+\s+\(/.test(human));
    assert.ok(!/ColorTheme "ikb" cannot pair/.test(human), "raw engine string must not leak");
  });
});

describe("gate 2 — outline dropdown whitelist-only; illegal values fail Build", () => {
  it("dropdown values are exactly the locked layout/variant table", () => {
    const opts = layoutVariantOptions();
    const values = opts.map((o) => o.value);
    assert.ok(values.length >= LAYOUT_IDS.length);
    for (const layout of LAYOUT_IDS) {
      for (const variant of LAYOUT_VARIANTS[layout]) {
        assert.ok(values.includes(`${layout}/${variant}`), `${layout}/${variant}`);
      }
    }
    assert.ok(!values.includes("masonry/title-5"));
    assert.ok(!values.includes("cards/title-5"));
    assert.ok(!values.includes("bullets/stacked"));
    assert.equal(isWhitelistedLayoutVariant("masonry", "title-5"), false);
    assert.equal(isWhitelistedLayoutVariant("cards", "title-5"), false);
    assert.equal(isWhitelistedLayoutVariant("bullets", "stacked"), false);
    assert.equal(isWhitelistedLayoutVariant("cover", "hero-title"), true);
  });

  it("invented page type / variant fail Build with a human error", async () => {
    const inventedLayout: Outline = {
      ...baseOutline(),
      slides: [{ title: "Masonry dump", deckgenLayout: "masonry", deckgenVariant: "title-5" }],
    };
    await assert.rejects(
      () => generateFromOutline(inventedLayout, { topic: "x", styleFamily: "editorial", themeId: "ink" }, { wallClock: false }),
      (e: unknown) =>
        e instanceof DeckgenUserError &&
        e.kind === "invented-page-type" &&
        !looksLikeStackDump(formatDeckgenUserError(e)),
    );

    const inventedVariant: Outline = {
      ...baseOutline(),
      slides: [{ title: "Stacked", deckgenLayout: "bullets", deckgenVariant: "stacked" }],
    };
    await assert.rejects(
      () => generateFromOutline(inventedVariant, { topic: "x", styleFamily: "editorial" }, { wallClock: false }),
      (e: unknown) => e instanceof DeckgenUserError && e.kind === "invented-variant",
    );

    const overSlots: Outline = {
      ...baseOutline(),
      slides: [
        {
          title: "Too many",
          deckgenLayout: "bullets",
          deckgenVariant: "title-5",
          bullets: ["a", "b", "c", "d", "e", "f"],
        },
      ],
    };
    await assert.rejects(
      () => generateFromOutline(overSlots, { topic: "x", styleFamily: "editorial" }, { wallClock: false }),
      (e: unknown) => e instanceof DeckgenUserError && e.kind === "over-slots",
    );
  });

  it("whitelist locks on the outline become the emitted page plan", () => {
    const o = baseOutline();
    applyOutlinePageLock(o.slides[1]!, { layout: "statement", variant: "single-line" });
    const pages = pagesFromOutline(o);
    assert.equal(pages[1]?.layout, "statement");
    assert.equal(pages[1]?.variant, "single-line");
  });
});

describe("gate 3 — errors have no stack traces in UI", () => {
  it("maps pairing / invent / over-slots to a single human line", () => {
    const pairing = new DeckgenUserError("pairing", "ColorTheme \"ikb\" cannot pair with VisualSystem \"editorial\".");
    const invented = new Error("Unknown Layout \"cards\". Whitelist: cover, section…\n    at resolveLayout (layouts.ts:151:9)\n    at generateDeck (pipeline.ts:53:5)");
    const over = new Error("statement claim exceeds 18 chars");
    assert.equal(formatDeckgenUserError(pairing).includes("\n"), false);
    assert.equal(formatDeckgenUserError(invented).includes("\n"), false);
    assert.equal(formatDeckgenUserError(over).includes("\n"), false);
    assert.ok(!looksLikeStackDump(formatDeckgenUserError(invented)));
    assert.ok(!/layouts\.ts|pipeline\.ts|at resolveLayout/.test(formatDeckgenUserError(invented)));
    const dumped = sanitizeDeckgenErrorCopy(`${invented.message}\n    at Object.<anonymous> (foo.ts:1:1)`);
    assert.ok(!looksLikeStackDump(dumped));
    assert.ok(!/at Object/.test(dumped));
    assert.equal(dumped.split("\n").length, 1);
  });

  it("never forwards Error.stack to the user string", () => {
    const err = new Error("Unknown Layout \"cards\".");
    err.stack = "Error: Unknown Layout \"cards\".\n    at generatePresentationViaDeckgen (deckgen-adapter.ts:1:1)";
    const copy = formatDeckgenUserError(err);
    assert.ok(!copy.includes("deckgen-adapter.ts"));
    assert.ok(!copy.includes(err.stack!.split("\n")[1]!));
    assert.match(copy, /page layout|allowed list/i);
  });
});

describe("gate 4 — result badges match generation metadata", () => {
  it("formats system · layout · theme from slide tags", async () => {
    const pres = await generatePresentationViaDeckgen(
      { topic: "Badge check", styleFamily: "swiss", themeId: "signal" },
      baseOutline(),
    );
    assert.equal((pres.meta as { deckgen: { system: string; theme: string } }).deckgen.system, "swiss");
    assert.equal((pres.meta as { deckgen: { theme: string } }).deckgen.theme, "signal");
    for (const slide of pres.slides) {
      const tags = slide.customData?.tags ?? {};
      const badge = formatResultBadge(badgeFromSlideTags(tags));
      assert.equal(badge, `${tags.system} · ${tags.layout} · ${tags.theme}`);
      assert.match(badge, /^swiss · (cover|section|statement|quote|bullets|steps|timeline|cards|bars|loop|split|figure|gallery|kpi|compare|banner|close) · signal$/);
    }
    const deckBadge = formatResultBadge({
      system: (pres.meta as { deckgen: { system: string } }).deckgen.system,
      theme: (pres.meta as { deckgen: { theme: string } }).deckgen.theme,
    });
    assert.equal(deckBadge, "swiss · signal");
  });

  it("badge foreground keeps ≥ 60% of body contrast", () => {
    const swiss = pickBadgeForeground({ bg: "#FFFFFF", ink: "#111111", muted: "#666666" });
    assert.ok(swiss.ratio + 1e-6 >= swiss.bodyRatio * 0.6, `ratio=${swiss.ratio} body=${swiss.bodyRatio}`);
    const kraft = pickBadgeForeground({ bg: "#EEDFC7", ink: "#2A1E13", muted: "#6B5744" });
    assert.ok(kraft.ratio + 1e-6 >= kraft.bodyRatio * 0.6);
  });
});
