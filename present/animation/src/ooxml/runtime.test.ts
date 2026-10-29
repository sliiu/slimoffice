import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TimingRuntime } from "./runtime.js";
import type { CompiledStep, CompiledTiming } from "./compile/types.js";
import type { TimeNode } from "./types.js";
import type { Ticker } from "./ticker.js";

const idleTicker: Ticker = {
  add: () => () => {
    /* never tick: keep the started step "running" */
  },
};

function clickStep(id: string, duration = 5): CompiledStep {
  return {
    id,
    trigger: "onClick",
    delay: 0,
    duration,
    iterations: 1,
    hold: true,
    autoReverse: false,
    source: { kind: "seq" } as unknown as TimeNode,
    atoms: [],
  };
}

function timing(...mainSteps: CompiledStep[]): CompiledTiming {
  return { mainSteps, shapeSteps: [] };
}

describe("TimingRuntime.seekMainCursor live skip", () => {
  it("freezes the current step when playLast is false and cursor is unchanged", () => {
    const rt = new TimingRuntime({
      timing: timing(clickStep("a")),
      resolve: () => null,
      ticker: idleTicker,
    });
    assert.equal(rt.click(), true);
    assert.equal(rt.currentStep(), 1);
    assert.equal(rt.isPlaying(), true);

    rt.seekMainCursor(1, true);
    assert.equal(rt.isPlaying(), true);

    rt.seekMainCursor(1, false);
    assert.equal(rt.currentStep(), 1);
    assert.equal(rt.isPlaying(), false);
  });

  it("click during a running step jumps to the end without advancing cursor", () => {
    const rt = new TimingRuntime({
      timing: timing(clickStep("a"), clickStep("b")),
      resolve: () => null,
      ticker: idleTicker,
    });
    assert.equal(rt.click(), true);
    assert.equal(rt.currentStep(), 1);
    assert.equal(rt.isPlaying(), true);

    assert.equal(rt.click(), true);
    assert.equal(rt.currentStep(), 1);
    assert.equal(rt.isPlaying(), false);
  });

  it("seeks backward when the viewer is ahead of the host cursor", () => {
    const rt = new TimingRuntime({
      timing: timing(clickStep("a"), clickStep("b"), clickStep("c")),
      resolve: () => null,
      ticker: idleTicker,
    });
    assert.equal(rt.click(), true);
    assert.equal(rt.currentStep(), 1);

    rt.seekMainCursor(0, false);
    assert.equal(rt.currentStep(), 0);
    assert.equal(rt.isPlaying(), false);
  });
});

describe("TimingRuntime click with no remaining steps", () => {
  it("returns false on an empty timeline", () => {
    const rt = new TimingRuntime({
      timing: timing(),
      resolve: () => null,
      ticker: idleTicker,
    });
    assert.equal(rt.click(), false);
    assert.equal(rt.currentStep(), 0);
    assert.equal(rt.isPlaying(), false);
  });

  it("returns false after the last step has finished", () => {
    const rt = new TimingRuntime({
      timing: timing(clickStep("a")),
      resolve: () => null,
      ticker: idleTicker,
    });
    assert.equal(rt.click(), true);
    assert.equal(rt.click(), true);
    assert.equal(rt.click(), false);
    assert.equal(rt.currentStep(), 1);
  });
});

describe("TimingRuntime shape gestures", () => {
  it("keeps double-click, hover, and nav off the click cursor and the main sequence", () => {
    const step = (
      id: string,
      trigger: CompiledStep["trigger"],
      target?: string,
    ): CompiledStep => ({
      ...clickStep(id),
      trigger,
      triggerTargetId: target,
    });
    const rt = new TimingRuntime({
      timing: {
        mainSteps: [clickStep("main")],
        shapeSteps: [
          step("click", "onShapeClick", "sp_1"),
          step("dbl", "onShapeDblClick", "sp_1"),
          step("hover", "onShapeHover", "sp_1"),
          step("out", "onShapeMouseOut", "sp_1"),
          step("prev", "onPrev"),
          step("next", "onNext"),
        ],
      },
      resolve: () => null,
      ticker: idleTicker,
    });

    assert.equal(rt.shapeClick("sp_1"), true);
    assert.equal(rt.shapeClick("sp_1"), false);
    assert.equal(rt.hasQueuedShape("sp_1", "onShapeDblClick"), true);
    assert.equal(rt.shapeDblClick("sp_1"), true);
    assert.equal(rt.hasQueuedShape("sp_1", "onShapeDblClick"), false);
    assert.equal(rt.shapeHover("sp_1"), true);
    assert.equal(rt.shapeHover("sp_1"), true);
    assert.equal(rt.shapeMouseOut("sp_1"), true);
    assert.equal(rt.shapeClick("sp_1"), false);
    assert.equal(rt.playNav("onNext"), true);
    assert.equal(rt.playNav("onPrev"), true);
    assert.equal(rt.playNav("onPrev"), true);
    assert.equal(rt.currentStep(), 0);
  });
});
