import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  lectureCameraSlideId,
  lectureTailSlideIds,
  nextLectureClickMs,
  replaceLectureSlide,
  replaceLectureTail,
  withLectureClick,
  withLectureFrame,
  withoutLectureCamera,
} from "./lecture.js";

describe("replaceLectureTail", () => {
  const ids = ["a", "b", "c", "d"];

  it("keeps slides before the start and replaces the tail", () => {
    const prev = {
      takes: [
        { slideId: "a", durationMs: 1000, clicksMs: [200] },
        { slideId: "b", durationMs: 1000, clicksMs: [100] },
        { slideId: "c", durationMs: 1000, clicksMs: [50] },
      ],
    };
    const next = replaceLectureTail(prev, ids, "c", [
      { slideId: "c", durationMs: 800, clicksMs: [300, 100] },
    ]);
    assert.deepEqual(
      next.takes.map((t) => t.slideId),
      ["a", "b", "c"],
    );
    assert.deepEqual(next.takes[2]?.clicksMs, [100, 300]);
    assert.equal(next.takes[0]?.durationMs, 1000);
  });

  it("replaces the whole lecture when starting at the first slide", () => {
    const prev = { takes: [{ slideId: "a", durationMs: 500, clicksMs: [] }] };
    const next = replaceLectureTail(prev, ids, "a", [
      { slideId: "b", durationMs: 400, clicksMs: [] },
    ]);
    assert.deepEqual(
      next.takes.map((t) => t.slideId),
      ["b"],
    );
  });

  it("drops an unrecorded tail", () => {
    const prev = {
      takes: [
        { slideId: "c", durationMs: 500, clicksMs: [] },
        { slideId: "d", durationMs: 500, clicksMs: [] },
      ],
    };
    const next = replaceLectureTail(prev, ids, "c", [
      { slideId: "c", durationMs: 200, clicksMs: [] },
    ]);
    assert.deepEqual(
      next.takes.map((t) => t.slideId),
      ["c"],
    );
    assert.deepEqual(lectureTailSlideIds(ids, "c"), ["c", "d"]);
  });
});

describe("nextLectureClickMs", () => {
  it("returns the next click after the current moment", () => {
    assert.equal(nextLectureClickMs([100, 400, 900], 400), 900);
    assert.equal(nextLectureClickMs([100, 400], 900), null);
  });
});

describe("replaceLectureSlide", () => {
  const prev = {
    takes: [
      { slideId: "a", durationMs: 1000, clicksMs: [200], cameraRef: "idb:a" },
      { slideId: "b", durationMs: 800, clicksMs: [100] },
    ],
    frame: { corner: "br" as const, size: "m" as const },
  };

  it("replaces one slide and keeps the others and the frame", () => {
    const next = replaceLectureSlide(prev, "b", {
      slideId: "b",
      durationMs: 500,
      clicksMs: [400, 10],
      cameraRef: "idb:b",
    });
    assert.deepEqual(
      next.takes.map((t) => t.slideId),
      ["a", "b"],
    );
    assert.equal(next.takes[0]?.cameraRef, "idb:a");
    assert.deepEqual(next.takes[1]?.clicksMs, [10, 400]);
    assert.deepEqual(next.frame, { corner: "br", size: "m" });
  });

  it("inserts a slide that had no take", () => {
    const next = replaceLectureSlide(prev, "c", { slideId: "c", durationMs: 300, clicksMs: [] });
    assert.deepEqual(
      next.takes.map((t) => t.slideId),
      ["a", "b", "c"],
    );
  });

  it("drops a take that has no duration", () => {
    const next = replaceLectureSlide(prev, "b", { slideId: "b", durationMs: 0, clicksMs: [1] });
    assert.deepEqual(
      next.takes.map((t) => t.slideId),
      ["a"],
    );
  });
});

describe("withLectureClick", () => {
  const lecture = {
    takes: [{ slideId: "a", durationMs: 1000, clicksMs: [100, 400] }],
    frame: { corner: "tl" as const, size: "s" as const },
  };

  it("clamps and sorts a click inside the recorded duration", () => {
    const next = withLectureClick(lecture, "a", 0, 1500);
    assert.deepEqual(next.takes[0]?.clicksMs, [400, 999]);
    assert.deepEqual(next.frame, lecture.frame);
    assert.deepEqual(lecture.takes[0]?.clicksMs, [100, 400]);
  });
});

describe("lecture frame and camera", () => {
  const lecture = {
    takes: [{ slideId: "a", durationMs: 1000, clicksMs: [100], cameraRef: "idb:a", cameraMime: "video/webm" }],
    frame: { corner: "br" as const, size: "m" as const },
  };

  it("changes the shared frame", () => {
    const next = withLectureFrame(lecture, { corner: "bl", size: "l" });
    assert.deepEqual(next.frame, { corner: "bl", size: "l" });
    assert.equal(next.takes[0]?.cameraRef, "idb:a");
  });

  it("removes the camera and keeps the clicks", () => {
    const next = withoutLectureCamera(lecture, "a");
    assert.equal(next.takes[0]?.cameraRef, undefined);
    assert.deepEqual(next.takes[0]?.clicksMs, [100]);
    assert.equal(lecture.takes[0]?.cameraRef, "idb:a");
  });
});

describe("lectureCameraSlideId", () => {
  it("reads the slide id out of an idb ref", () => {
    assert.equal(lectureCameraSlideId("idb:slide%201"), "slide 1");
    assert.equal(lectureCameraSlideId("/api/share/camera/x/y"), null);
  });
});
