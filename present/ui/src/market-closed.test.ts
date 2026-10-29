import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { marketStatusUrl } from "./market-closed.js";

describe("marketStatusUrl", () => {
  it("uses an explicit API base and otherwise stays closed only on known hosts", () => {
    assert.equal(marketStatusUrl("https://api.slimppt.cn/api/"), "https://api.slimppt.cn/api/market");
    assert.equal(marketStatusUrl(""), null);
  });
});
