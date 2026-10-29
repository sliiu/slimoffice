import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildStoredZip } from "./zip-store.js";

describe("buildStoredZip", () => {
  it("emits a stored zip with local file signature", () => {
    const zip = buildStoredZip([{ name: "a.txt", data: new Uint8Array([65]) }]);
    assert.equal(zip[0], 0x50);
    assert.equal(zip[1], 0x4b);
    assert.equal(zip[2], 0x03);
    assert.equal(zip[3], 0x04);
    assert.ok(zip.byteLength > 30);
  });
});
