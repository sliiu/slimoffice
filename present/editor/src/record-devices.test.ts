import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import {
  cameraCanFlip,
  exactFacingConstraints,
  modeUsesCamera,
  micCanBeDisabled,
  modeUsesMic,
  recordPreviewVisible,
  otherCameraId,
  recordAudioConstraints,
  recordPreviewMirrored,
  recordVideoConstraints,
} from "./record-devices";

describe("record media devices", () => {
  it("asks for a mic except when recording the screen alone", () => {
    assert.equal(modeUsesMic("audio"), true);
    assert.equal(modeUsesMic("camera"), true);
    assert.equal(modeUsesMic("screen-camera"), true);
    assert.equal(modeUsesMic("screen"), false);
    assert.equal(modeUsesCamera("camera"), true);
    assert.equal(modeUsesCamera("screen-camera"), true);
    assert.equal(modeUsesCamera("audio"), false);
    assert.equal(modeUsesCamera("screen"), false);
  });

  it("does not show a camera preview for screen-only or audio-only before recording", () => {
    assert.equal(recordPreviewVisible({ mode: "screen", recording: false, hasTake: false }), false);
    assert.equal(recordPreviewVisible({ mode: "audio", recording: false, hasTake: false }), false);
    assert.equal(recordPreviewVisible({ mode: "audio", recording: true, hasTake: false }), false);
    assert.equal(recordPreviewVisible({ mode: "camera", recording: false, hasTake: false }), true);
    assert.equal(recordPreviewVisible({ mode: "screen", recording: true, hasTake: false }), true);
  });

  it("lets a flip pick front or back without locking the previous camera", () => {
    assert.deepEqual(recordVideoConstraints({ deviceId: "cam-a", facing: "environment", useFacing: true }), {
      facingMode: "environment",
    });
    assert.deepEqual(recordVideoConstraints({ deviceId: "", facing: "user", useFacing: false }), {
      facingMode: "user",
    });
  });

  it("hides the flip control when this camera cannot switch", () => {
    assert.equal(cameraCanFlip({ cameraIds: ["iphone"], facingModes: [] }), false);
    assert.equal(cameraCanFlip({ cameraIds: ["iphone"] }), false);
    assert.equal(cameraCanFlip({ cameraIds: ["front", "back"] }), true);
    assert.equal(cameraCanFlip({ cameraIds: ["iphone"], facingModes: ["user", "environment"] }), true);
  });

  it("asks the browser to switch lenses exactly, and otherwise moves to the next camera", () => {
    assert.deepEqual(exactFacingConstraints("environment"), { facingMode: { exact: "environment" } });
    assert.equal(otherCameraId(["front"], "front"), null);
    assert.equal(otherCameraId(["front", "back"], "front"), "back");
    assert.equal(otherCameraId(["front", "back"], "back"), "front");
    assert.equal(otherCameraId(["front", "back"], ""), "front");
  });

  it("uses the camera chosen in the list", () => {
    assert.deepEqual(recordVideoConstraints({ deviceId: "cam-a", facing: "user", useFacing: false }), {
      deviceId: { exact: "cam-a" },
    });
  });

  it("uses the chosen microphone, or the default when none is chosen", () => {
    assert.deepEqual(recordAudioConstraints("mic-1"), { deviceId: { exact: "mic-1" } });
    assert.equal(recordAudioConstraints(""), true);
    assert.equal(recordAudioConstraints("mic-1", false), false);
  });

  it("lets the microphone be turned off only when a picture is still recorded", () => {
    assert.equal(micCanBeDisabled("camera"), true);
    assert.equal(micCanBeDisabled("screen-camera"), true);
    assert.equal(micCanBeDisabled("audio"), false);
    assert.equal(micCanBeDisabled("screen"), false);
  });

  it("mirrors only the front camera inside a screen recording", () => {
    assert.equal(recordPreviewMirrored({ mode: "camera", facing: "user", pipMirror: true }), false);
    assert.equal(recordPreviewMirrored({ mode: "screen-camera", facing: "user", pipMirror: true }), true);
    assert.equal(recordPreviewMirrored({ mode: "screen-camera", facing: "environment", pipMirror: true }), false);
    assert.equal(recordPreviewMirrored({ mode: "screen-camera", facing: undefined, pipMirror: false }), false);
  });
});