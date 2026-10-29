import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Presentation } from "@ppt/core";
import { ensureSlideMasters } from "./aux-master-utils.js";

function emptyPres(): Presentation {
  return {
    id: "p1",
    size: { width: 960, height: 540 },
    slides: [],
  };
}

describe("ensureSlideMasters", () => {
  it("creates a blank master + layout when the deck has none", () => {
    const pres = emptyPres();
    const masters = ensureSlideMasters(pres);
    assert.equal(masters.length, 1);
    assert.equal(pres.masters, masters);
    assert.equal(masters[0]!.id, "slideMaster1");
    assert.equal(masters[0]!.layouts?.length, 1);
    assert.equal(masters[0]!.layouts?.[0]?.type, "blank");
  });

  it("uses theme bg1 for the synthetic master background", () => {
    const pres = emptyPres();
    pres.theme = { id: "t", name: "Dark", colors: { bg1: "#0b0e11" } };
    const [master] = ensureSlideMasters(pres);
    assert.equal(master?.background?.kind, "solid");
    if (master?.background?.kind === "solid") {
      assert.equal(master.background.color, "#0b0e11");
    }
  });

  it("does not replace an existing master", () => {
    const pres = emptyPres();
    pres.masters = [{ id: "keep", name: "Keep", shapes: [] }];
    const masters = ensureSlideMasters(pres);
    assert.equal(masters[0]!.id, "keep");
    assert.equal(masters.length, 1);
  });
});
