import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mediaTrimBounds } from "./media-trim.js";

describe("mediaTrimBounds", () => {
  it("leaves an untrimmed recording with an unknown duration open-ended", () => {
    assert.deepEqual(mediaTrimBounds(undefined, undefined), { start: 0, end: Number.POSITIVE_INFINITY });
    assert.deepEqual(mediaTrimBounds(undefined, Number.POSITIVE_INFINITY), {
      start: 0,
      end: Number.POSITIVE_INFINITY,
    });
  });

  it("uses a finite duration as the end", () => {
    assert.deepEqual(mediaTrimBounds(undefined, 12.5), { start: 0, end: 12.5 });
  });

  it("keeps an explicit trim end", () => {
    assert.deepEqual(mediaTrimBounds({ start: 1, end: 4 }, undefined), { start: 1, end: 4 });
  });
});
