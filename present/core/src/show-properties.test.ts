import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyUiToShowProperties,
  clampSlideIndexToOrder,
  showPropertiesHasContent,
  showPropertiesSlideOrder,
  showPropertiesSnapshot,
  showPropertiesToUi,
} from "./show-properties.js";

describe("showPropertiesToUi / applyUiToShowProperties", () => {
  it("uses present-mode defaults when undefined", () => {
    assert.deepEqual(showPropertiesToUi(undefined), {
      loop: false,
      windowed: false,
      useTimings: true,
      playNarrations: true,
      showMediaControls: true,
    });
    assert.equal(showPropertiesHasContent(undefined), false);
    assert.equal(showPropertiesSnapshot(undefined), "");
  });

  it("maps browse kind to windowed and preserves kiosk when leaving windowed", () => {
    assert.equal(showPropertiesToUi({ kind: "browse" }).windowed, true);
    const kiosk = applyUiToShowProperties({ kind: "kiosk" }, {
      loop: true,
      windowed: false,
      useTimings: false,
      playNarrations: false,
      showMediaControls: false,
    });
    assert.equal(kiosk.kind, "kiosk");
    assert.equal(kiosk.loop, true);
    const browse = applyUiToShowProperties(undefined, {
      loop: false,
      windowed: true,
      useTimings: true,
      playNarrations: true,
      showMediaControls: true,
    });
    assert.equal(browse.kind, "browse");
  });
});

describe("showPropertiesSlideOrder", () => {
  it("returns undefined for all slides", () => {
    assert.equal(showPropertiesSlideOrder(undefined, 5), undefined);
    assert.equal(showPropertiesSlideOrder({ slides: "all" }, 5), undefined);
  });

  it("expands a 1-based range and custom show ids", () => {
    assert.deepEqual(showPropertiesSlideOrder({ slides: { start: 2, end: 4 } }, 6), [1, 2, 3]);
    assert.deepEqual(
      showPropertiesSlideOrder({ customShowId: 2 }, 5, [
        { id: "2", slideIndices: [0, 4, 9] },
      ]),
      [0, 4],
    );
  });
});

describe("clampSlideIndexToOrder", () => {
  it("keeps the index when it is in the order, otherwise snaps to the first", () => {
    assert.equal(clampSlideIndexToOrder(3, undefined), 3);
    assert.equal(clampSlideIndexToOrder(2, [0, 2, 4]), 2);
    assert.equal(clampSlideIndexToOrder(1, [0, 2, 4]), 0);
  });
});
