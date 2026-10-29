import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fromScratchSldIds, sectionIdToGuid } from "./pptx-sections.js";

describe("pptx-sections", () => {
  it("keeps GUID ids and hashes others; sldIds start at 256", () => {
    assert.equal(sectionIdToGuid("{aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee}"), "{AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE}");
    const hashed = sectionIdToGuid("sec_open");
    assert.match(hashed, /^\{[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-A[0-9A-F]{3}-[0-9A-F]{12}\}$/);
    assert.notEqual(hashed, sectionIdToGuid("sec_other"));
    assert.deepEqual(fromScratchSldIds(3), [256, 257, 258]);
  });
});
