import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LAYOUT_IDS } from "./ids.js";
import { paletteOf, seedColorTheme } from "./color-theme.js";
import { resolveVisualSystem } from "./visual-system.js";
import { buildDeckgenMasters, deckgenLayoutId, deckgenMasterId, ooxmlTypeForLayout } from "./masters.js";

describe("deckgen masters", () => {
  it("builds one master with catalog layouts, blank, extras, and no dec_ ids", () => {
    const system = resolveVisualSystem("editorial");
    const theme = seedColorTheme("editorial", "ink");
    const pal = paletteOf(theme);
    const masters = buildDeckgenMasters(system, theme, ["cover", "data", ""]);
    assert.equal(masters.length, 1);
    const master = masters[0]!;
    assert.equal(master.id, deckgenMasterId("editorial", "ink"));
    assert.equal(master.background?.kind, "solid");
    if (master.background?.kind === "solid") assert.equal(master.background.color, pal.bg);
    assert.ok(master.txStyles?.title?.length);
    assert.ok(master.txStyles?.body?.length);
    const ids = (master.layouts ?? []).map((l) => l.id);
    for (const layout of LAYOUT_IDS) {
      assert.ok(ids.includes(deckgenLayoutId(master.id, layout)), layout);
    }
    assert.ok(ids.includes(deckgenLayoutId(master.id, "blank")));
    assert.ok(ids.includes(deckgenLayoutId(master.id, "data")));
    assert.equal(ids.filter((id) => id.endsWith("__cover")).length, 1);
    assert.ok(!master.shapes.some((s) => s.id.startsWith("dec_")));
    assert.ok(!master.shapes.some((s) => s.id === "chrome_spine"), "light systems have no spine");
    const ph = master.shapes.filter((s) => s.placeholder);
    assert.ok(ph.some((s) => s.placeholder?.type === "title"));
    assert.ok(ph.some((s) => s.placeholder?.type === "body"));
    const cover = master.layouts?.find((l) => l.id === deckgenLayoutId(master.id, "cover"));
    assert.equal(cover?.type, "title");
    assert.ok(cover?.shapes.some((s) => s.placeholder?.type === "ctrTitle"));
    const blank = master.layouts?.find((l) => l.type === "blank");
    assert.equal(blank?.shapes.length, 0);
  });

  it("puts a userDrawn spine on dark-tone masters, still not dec_", () => {
    const system = resolveVisualSystem("dark-tech");
    const theme = seedColorTheme("dark-tech");
    const master = buildDeckgenMasters(system, theme)[0]!;
    const spine = master.shapes.find((s) => s.id === "chrome_spine");
    assert.ok(spine);
    assert.equal(spine!.userDrawn, true);
    assert.ok(!spine!.placeholder);
    assert.ok(!spine!.id.startsWith("dec_"));
  });

  it("maps layout names to OOXML types", () => {
    assert.equal(ooxmlTypeForLayout("cover"), "title");
    assert.equal(ooxmlTypeForLayout("section"), "secHead");
    assert.equal(ooxmlTypeForLayout("compare"), "twoObj");
    assert.equal(ooxmlTypeForLayout("gallery"), "picTx");
    assert.equal(ooxmlTypeForLayout("bullets"), "obj");
    assert.equal(ooxmlTypeForLayout("blank"), "blank");
  });
});
