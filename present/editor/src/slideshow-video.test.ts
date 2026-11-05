import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Slide } from "@ppt/core";
import {
  DEFAULT_VIDEO_OPTIONS,
  framesFor,
  narrationClips,
  slideFadeSeconds,
  slideHoldSeconds,
  slideshowVideoSlides,
  videoOutputSize,
} from "./slideshow-video.js";
import { sanitizeVideoSettings, videoTimingCheckboxState } from "./slideshow-video-dialog.js";

function slide(over: Partial<Slide> = {}): Slide {
  return { id: "s", layers: [], ...over } as Slide;
}

describe("slideshow video timing", () => {
  it("holds for advAfter and fades non-cut transitions", () => {
    assert.equal(slideHoldSeconds(slide({ transition: { kind: "fade", duration: 0.4, params: { advAfter: 3 } } })), 3);
    assert.equal(slideHoldSeconds(slide()), 2);
    assert.equal(slideFadeSeconds(slide({ transition: { kind: "fade", duration: 0.8 } })), 0.8);
    assert.equal(slideFadeSeconds(slide({ transition: { kind: "cut", duration: 0.5 } })), 0);
  });

  it("ignores rehearsed timings when asked and never holds below 0.4s", () => {
    const timed = slide({ transition: { kind: "fade", duration: 0.4, params: { advAfter: 3 } } });
    assert.equal(slideHoldSeconds(timed, 5, false), 5);
    assert.equal(slideHoldSeconds(slide(), 0.1), 0.4);
  });

  it("skips hidden slides", () => {
    const pres = {
      size: { width: 10, height: 10 },
      slides: [slide({ id: "a" }), slide({ id: "b", show: false }), slide({ id: "c" })],
    };
    assert.deepEqual(slideshowVideoSlides(pres as never).map((s) => s.id), ["a", "c"]);
  });
});

describe("slideshow video sampling", () => {
  it("counts frames after applying speed and keeps at least one frame for positive spans", () => {
    assert.equal(framesFor(2, 24, 1), 48);
    assert.equal(framesFor(2, 24, 2), 24);
    assert.equal(framesFor(0.01, 12, 1), 1);
    assert.equal(framesFor(0, 30, 1), 0);
  });

  it("scales output to the requested height with even dimensions", () => {
    assert.deepEqual(videoOutputSize({ width: 1280, height: 720 }, 0), { width: 1280, height: 720, scale: 1 });
    assert.deepEqual(videoOutputSize({ width: 1280, height: 720 }, 1080), { width: 1920, height: 1080, scale: 1.5 });
    const odd = videoOutputSize({ width: 961, height: 540 }, 720);
    assert.equal(odd.height, 720);
    assert.equal(odd.width % 2, 0);
  });
});

describe("slideshow video settings", () => {
  it("falls back to defaults for unknown choices and clamps free-form numbers", () => {
    assert.deepEqual(sanitizeVideoSettings({}), DEFAULT_VIDEO_OPTIONS);
    const s = sanitizeVideoSettings({ fps: 60, height: 480, speed: 3, slideHold: -1, clickGap: 999, useTimings: false });
    assert.equal(s.fps, DEFAULT_VIDEO_OPTIONS.fps);
    assert.equal(s.height, DEFAULT_VIDEO_OPTIONS.height);
    assert.equal(s.speed, DEFAULT_VIDEO_OPTIONS.speed);
    assert.equal(s.slideHold, 0.4);
    assert.equal(s.clickGap, 60);
    assert.equal(s.useTimings, false);
    assert.equal(sanitizeVideoSettings({ format: "webm" }).format, "webm");
    assert.equal(sanitizeVideoSettings({ format: "avi" as never }).format, "mp4");
  });

  it("leaves the rehearsed-timing box unchecked when the deck has none", () => {
    assert.deepEqual(videoTimingCheckboxState(false, true), { checked: false, disabled: true });
    assert.deepEqual(videoTimingCheckboxState(true, true), { checked: true, disabled: false });
    assert.deepEqual(videoTimingCheckboxState(undefined, false), { checked: false, disabled: false });
  });

  it("keeps valid choices", () => {
    assert.deepEqual(sanitizeVideoSettings({ fps: 30, height: 720, speed: 1.5, slideHold: 4, clickGap: 0.2 }), {
      fps: 30,
      height: 720,
      speed: 1.5,
      slideHold: 4,
      clickGap: 0.2,
      useTimings: true,
      format: "mp4",
    });
  });
});

describe("slideshow narration clips", () => {
  it("keeps narration audio and skips other media", () => {
    const timed = slide({
      layers: [
        {
          id: "l",
          shapes: [
            { id: "n", kind: "audio", src: "data:audio/webm;base64,AA", isNarration: true, volume: 0.5 },
            { id: "m", kind: "audio", src: "data:audio/webm;base64,BB" },
            { id: "v", kind: "video", src: "data:video/webm;base64,CC" },
            { id: "rid", kind: "audio", src: "rId3", isNarration: true },
          ],
        },
      ],
    } as Partial<Slide>);
    assert.deepEqual(narrationClips(timed), [{ src: "data:audio/webm;base64,AA", volume: 0.5 }]);
  });
});
