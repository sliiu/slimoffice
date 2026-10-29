import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clearDirty,
  getDirty,
  getOrigin,
  isDirty,
  markDirty,
  preserveOrigin,
  setOrigin,
} from "./origin.js";

describe("origin / dirty markers", () => {
  it("stores origin as a non-enumerable merge", () => {
    const obj: { fill?: string } = { fill: "red" };
    setOrigin(obj, { opacity: 1 });
    setOrigin(obj, { src: "a.png" });
    assert.deepEqual(getOrigin(obj), { opacity: 1, src: "a.png" });
    assert.equal(JSON.stringify(obj).includes("__origin"), false);
    const clone = { fill: "red" };
    preserveOrigin(clone, obj);
    assert.deepEqual(getOrigin(clone), { opacity: 1, src: "a.png" });
  });

  it("tracks dirty fields independently of JSON", () => {
    const obj = { name: "s" };
    assert.equal(isDirty(obj, "fill"), false);
    markDirty(obj, "fill");
    markDirty(obj, "bbox");
    assert.equal(isDirty(obj, "fill"), true);
    assert.deepEqual([...(getDirty(obj) ?? [])].sort(), ["bbox", "fill"]);
    clearDirty(obj, "fill");
    assert.equal(isDirty(obj, "fill"), false);
    assert.equal(isDirty(obj, "bbox"), true);
    clearDirty(obj);
    assert.equal(isDirty(obj, "bbox"), false);
  });
});
