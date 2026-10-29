import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Slide } from "@ppt/core";
import { collectMorphCandidatesFromSlide } from "./morph-audit.js";
import { matchMorphShapePairs, type MorphShapeCandidate } from "./morph-match.js";

function box(id: string, left: number, top: number, width: number, height: number, name = id): MorphShapeCandidate {
  return { id, name, tag: "g", rect: { left, top, width, height } };
}

function pairIds(ghost: MorphShapeCandidate[], stage: MorphShapeCandidate[]): Record<string, string> {
  return Object.fromEntries(matchMorphShapePairs(ghost, stage).map((p) => [p.stage.id, p.ghost.id]));
}

describe("matchMorphShapePairs", () => {
  it("pairs unchanged chrome with itself even when an earlier stage shape also fits it", () => {
    const ghost = [box("a_kicker", 80, 60, 200, 24), box("a_title", 80, 110, 900, 80), box("a_folio", 1180, 680, 40, 20)];
    const stage = [box("b_title", 80, 110, 300, 60), box("b_kicker", 80, 60, 200, 24), box("b_folio", 1180, 680, 40, 20)];
    const pairs = pairIds(ghost, stage);
    assert.equal(pairs.b_kicker, "a_kicker");
    assert.equal(pairs.b_folio, "a_folio");
  });

  it("resolves name matches before any geometry pairing can take the ghost", () => {
    const ghost = [box("g1", 100, 100, 50, 50, "!!dot"), box("g2", 600, 100, 50, 50)];
    const stage = [box("s2", 100, 100, 50, 50), box("s1", 900, 400, 80, 80, "!!dot")];
    assert.deepEqual(pairIds(ghost, stage), { s1: "g1", s2: "g2" });
  });

  it("does not pair differently named shapes just because their per-slide ids collide", () => {
    const ghost = [box("sp_2", 80, 60, 200, 24, "Kicker"), box("sp_9", 800, 400, 120, 120, "!!ring")];
    const stage = [box("sp_2", 100, 200, 380, 380, "!!ring"), box("sp_5", 80, 60, 200, 24, "Kicker")];
    assert.deepEqual(pairIds(ghost, stage), { sp_2: "sp_9", sp_5: "sp_2" });
  });

  it("prefers the nearer of two identical ghosts", () => {
    const ghost = [box("far", 900, 500, 100, 40), box("near", 110, 100, 100, 40)];
    const stage = [box("s", 100, 100, 100, 40)];
    assert.deepEqual(pairIds(ghost, stage), { s: "near" });
  });
});

describe("collectMorphCandidatesFromSlide", () => {
  it("offers only top-level shapes; group children move with their group", () => {
    const bbox = { x: 0, y: 0, w: 100, h: 40 };
    const rect = (id: string) => ({ id, name: id, kind: "rect", bbox, transform: {} });
    const slide = {
      layers: [{ visible: true, shapes: [{ ...rect("sp_2"), kind: "group", children: [rect("sp_2_base"), rect("sp_2_text")] }] }],
    } as unknown as Slide;
    assert.deepEqual(collectMorphCandidatesFromSlide(slide).map((c) => c.id), ["sp_2"]);
  });
});
