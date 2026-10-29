import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canonicalSlideLayoutType,
  filterLayoutsToWhitelist,
  isWhitelistedSlideLayout,
  SLIDE_LAYOUT_WHITELIST,
} from "./slide-layout-whitelist.js";

describe("slide layout whitelist", () => {
  it("has exactly 9 locked types", () => {
    assert.equal(SLIDE_LAYOUT_WHITELIST.length, 9);
  });

  it("maps template-master aliases onto the 9", () => {
    assert.equal(canonicalSlideLayoutType("sectionHead"), "secHead");
    assert.equal(canonicalSlideLayoutType("titleAndContent"), "obj");
    assert.equal(canonicalSlideLayoutType("comparison"), "twoTxTwoObj");
    assert.ok(isWhitelistedSlideLayout("sectionHead"));
    assert.ok(isWhitelistedSlideLayout("obj"));
    assert.equal(isWhitelistedSlideLayout("cust"), false);
  });

  it("keeps only whitelist entries when any match", () => {
    const layouts = [
      { id: "a", type: "title" },
      { id: "b", type: "cust" },
      { id: "c", type: "blank" },
    ];
    assert.deepEqual(
      filterLayoutsToWhitelist(layouts).map((l) => l.id),
      ["a", "c"],
    );
  });

  it("falls back to the full list when nothing matches", () => {
    const layouts = [
      { id: "x", type: "cust" },
      { id: "y", type: "weird" },
    ];
    assert.deepEqual(filterLayoutsToWhitelist(layouts), layouts);
  });
});
