import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TimeNode } from "../types.js";
import { hasOnClick, shapeClickTarget, triggerOf } from "./trigger.js";

describe("hasOnClick / shapeClickTarget", () => {
  it("treats click-like events as onClick", () => {
    assert.equal(hasOnClick(undefined), false);
    assert.equal(hasOnClick([{ evt: "onClick" }]), true);
    assert.equal(hasOnClick([{ evt: "onNext" }]), true);
    assert.equal(hasOnClick([{ evt: "onBegin" }]), false);
    assert.equal(
      shapeClickTarget([{ evt: "onClick", tgtEl: { spTgt: { spid: "12" } } }]),
      "sp_12",
    );
    assert.equal(shapeClickTarget([{ evt: "onClick" }]), undefined);
  });
});

describe("triggerOf", () => {
  it("maps nodeType to step triggers", () => {
    const node = (nodeType: string): TimeNode => ({ kind: "seq", ctn: { nodeType: nodeType as never } });
    assert.equal(triggerOf(node("clickEffect")), "onClick");
    const auto = {
      kind: "par" as const,
      ctn: {
        nodeType: "clickPar" as const,
        stCondLst: [{ delay: "indefinite" as const }, { evt: "onBegin" as const, delay: 0, tn: "2" }],
      },
    };
    assert.equal(triggerOf(auto), "onLoad");
    assert.equal(triggerOf(node("withEffect")), "withPrevious");
    assert.equal(triggerOf(node("afterEffect")), "afterPrevious");
    assert.equal(triggerOf(node("interactiveSeq")), "onShapeClick");
    assert.equal(triggerOf(node("mainSeq")), "onLoad");
  });

  it("splits interactive gestures and keeps a main-sequence next as a forward click", () => {
    const interactive = (evt: string): TimeNode => ({
      kind: "seq",
      ctn: {
        nodeType: "interactiveSeq" as never,
        stCondLst: [{ evt: evt as never, tgtEl: { spTgt: { spid: "3" } } }],
      },
    });
    assert.equal(triggerOf(interactive("onClick")), "onShapeClick");
    assert.equal(triggerOf(interactive("onDblClick")), "onShapeDblClick");
    assert.equal(triggerOf(interactive("onMouseOver")), "onShapeHover");
    assert.equal(triggerOf(interactive("onMouseOut")), "onShapeMouseOut");
    assert.equal(triggerOf(interactive("onPrev")), "onPrev");
    assert.equal(triggerOf(interactive("onNext")), "onNext");

    const main = (evt: string): TimeNode => ({
      kind: "par",
      ctn: { stCondLst: [{ evt: evt as never }] },
    });
    assert.equal(triggerOf(main("onNext")), "onClick");
    assert.equal(triggerOf(main("onClick")), "onClick");
    assert.equal(triggerOf(main("onPrev")), "onPrev");
    assert.equal(triggerOf(main("onDblClick")), "onShapeDblClick");
    assert.equal(triggerOf(main("onMouseOver")), "onShapeHover");
    assert.equal(triggerOf(main("onMouseOut")), "onShapeMouseOut");
    assert.equal(hasOnClick([{ evt: "onDblClick" }]), true);
    assert.equal(hasOnClick([{ evt: "onPrev" }]), true);
  });
});
