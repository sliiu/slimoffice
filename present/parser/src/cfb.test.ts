import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CFB_MAGIC, isCfb } from "./cfb.js";

describe("isCfb", () => {
  it("accepts the OLE compound-file magic and rejects short or wrong bytes", () => {
    assert.equal(isCfb(new Uint8Array(CFB_MAGIC)), true);
    assert.equal(isCfb(new Uint8Array([0xd0, 0xcf])), false);
    assert.equal(isCfb(new Uint8Array(8)), false);
  });
});
