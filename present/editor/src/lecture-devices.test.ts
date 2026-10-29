import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { captureProbeNeeded } from "./lecture-devices";

const named = (kind: "audioinput" | "videoinput", label: string) => ({ kind, label });
const blank = (kind: "audioinput" | "videoinput") => ({ kind, label: "" });

describe("lecture device list", () => {
  it("does not open a camera or mic whose name is already readable", () => {
    assert.deepEqual(
      captureProbeNeeded(
        [named("audioinput", "MacBook Pro麦克风"), named("videoinput", "Lucas’s iPhone的相机")],
        { microphone: "unknown", camera: "unknown" },
      ),
      { mic: false, camera: false },
    );
  });

  it("does not open a device the page is already allowed to use", () => {
    assert.deepEqual(captureProbeNeeded([blank("audioinput"), blank("videoinput")], { microphone: "granted", camera: "granted" }), {
      mic: false,
      camera: false,
    });
  });

  it("asks once when names are still hidden", () => {
    assert.deepEqual(captureProbeNeeded([blank("videoinput")], { microphone: "prompt", camera: "prompt" }), {
      mic: true,
      camera: true,
    });
  });

  it("does not ask again after a refusal", () => {
    assert.deepEqual(captureProbeNeeded([], { microphone: "denied", camera: "denied" }), { mic: false, camera: false });
  });
});
