import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { autoAdvanceAfterSec, autoAdvanceWaitSec, autoplayTimelineSec, clickAdvancesSlide } from "./slide-advance.js";

describe("slide advance", () => {
  it("lets a click change slides unless advClick is explicitly false", () => {
    assert.equal(clickAdvancesSlide(undefined), true);
    assert.equal(clickAdvancesSlide({ kind: "push", duration: 0.75 }), true);
    assert.equal(clickAdvancesSlide({ kind: "cut", duration: 0, params: { advClick: true } }), true);
    assert.equal(clickAdvancesSlide({ kind: "cut", duration: 0, params: { advClick: false, advAfter: 4 } }), false);
  });

  it("treats advTm 0 as a timer that waits out autoplay, and omits the timer when unset", () => {
    assert.equal(autoAdvanceAfterSec(undefined), null);
    assert.equal(autoAdvanceAfterSec({ kind: "push", duration: 0.75 }), null);
    assert.equal(autoAdvanceAfterSec({ kind: "cut", duration: 0, params: { advAfter: 0 } }), 0);
    assert.equal(autoAdvanceAfterSec({ kind: "push", duration: 0.75, params: { advAfter: 4 } }), 4);
    assert.equal(autoAdvanceAfterSec({ kind: "cut", duration: 0, params: { advAfter: Number.NaN } }), null);
    assert.equal(autoAdvanceWaitSec(0, 4.8), 4.8);
    assert.equal(autoAdvanceWaitSec(0, 0), 0);
    assert.equal(autoAdvanceWaitSec(4, 9), 4);
    assert.equal(
      autoplayTimelineSec([
        { trigger: "onLoad", delay: 0, duration: 1, autoReverse: true, iterations: 1 },
        { trigger: "onClick", delay: 0, duration: 1, autoReverse: false, iterations: 1 },
      ]),
      2,
    );
  });
});
