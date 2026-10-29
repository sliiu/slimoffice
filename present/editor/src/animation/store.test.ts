import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Slide } from "@ppt/core";
import { ooxml } from "@ppt/animation";
import { buildEffectList, ensureTiming, insertEffect, setEffectProperty } from "./store.js";

function leafDurs(node: ooxml.TimeNode): number[] {
  if (ooxml.isBehavior(node)) {
    const d = ooxml.getCTn(node).dur;
    return typeof d === "number" && d > 1 ? [d] : [];
  }
  if (ooxml.isContainer(node)) return (node.ctn.childTnLst ?? []).flatMap(leafDurs);
  return [];
}

describe("insertEffect", () => {
  it("scales template behaviours to the requested duration, not only the effect root", () => {
    const slide = { id: "s", name: "s", background: { kind: "none" }, layers: [] } as unknown as Slide;
    const timing = ensureTiming(slide);
    const effect = insertEffect(timing, { targetShapeId: "sp_1", presetClass: "entr", presetId: 10, durationMs: 400 });
    assert.ok(effect);
    const durs = leafDurs(effect);
    assert.ok(durs.length > 0, "fade template has a timed behaviour");
    assert.deepEqual([...new Set(durs)], [400]);
  });

  it("writes a gesture trigger onto an interactive sequence and reads it back", () => {
    const slide = { id: "s", name: "s", background: { kind: "none" }, layers: [] } as unknown as Slide;
    const timing = ensureTiming(slide);
    insertEffect(timing, { targetShapeId: "sp_1", presetClass: "entr", presetId: 10, durationMs: 400 });
    const before = buildEffectList(timing);
    assert.equal(before.length, 1);
    assert.equal(before[0]!.trigger, "onClick");

    setEffectProperty(timing, before[0]!.path, { trigger: "onShapeDblClick" });
    const gestured = buildEffectList(timing);
    assert.equal(gestured.length, 1);
    assert.equal(gestured[0]!.trigger, "onShapeDblClick");
    assert.equal(gestured[0]!.triggerShapeId, "sp_1");

    setEffectProperty(timing, gestured[0]!.path, { trigger: "onShapeMouseOut" });
    const out = buildEffectList(timing);
    assert.equal(out[0]!.trigger, "onShapeMouseOut");

    setEffectProperty(timing, out[0]!.path, { trigger: "onClick" });
    const back = buildEffectList(timing);
    assert.equal(back.length, 1);
    assert.equal(back[0]!.trigger, "onClick");
  });
});
