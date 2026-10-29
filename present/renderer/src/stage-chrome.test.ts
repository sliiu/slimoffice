import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { stageChromeBackground } from "./stage-chrome.js";

describe("stageChromeBackground", () => {
  it("uses white only when there is no painted slide background", () => {
    assert.equal(stageChromeBackground(undefined), "#ffffff");
    assert.equal(stageChromeBackground({ background: { kind: "none" } } as never), "#ffffff");
    assert.equal(stageChromeBackground({ background: { kind: "solid", color: "#111" } } as never), "transparent");
  });
});
