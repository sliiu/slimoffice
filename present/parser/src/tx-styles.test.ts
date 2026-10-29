import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyTxStyles, pickStyle } from "./tx-styles.js";

describe("pickStyle", () => {
  it("routes title / body / other placeholder families", () => {
    const styles = emptyTxStyles();
    styles.title.push({ pPr: { align: "middle" }, rPr: {} });
    styles.body.push({ pPr: { align: "start" }, rPr: {} });
    styles.other.push({ pPr: { align: "end" }, rPr: {} });
    assert.equal(pickStyle(styles, "title"), styles.title);
    assert.equal(pickStyle(styles, "ctrTitle"), styles.title);
    assert.equal(pickStyle(styles, "body"), styles.body);
    assert.equal(pickStyle(styles, "obj"), styles.body);
    assert.equal(pickStyle(styles, undefined), styles.body);
    assert.equal(pickStyle(styles, "dt"), styles.other);
  });
});
