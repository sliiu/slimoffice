import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  arr,
  attr,
  findAllByLocalName,
  findByLocalName,
  parseXml,
  pickAlternateContentChildren,
  stripNs,
} from "./xml.js";

describe("parseXml / stripNs", () => {
  it("keeps namespaced tags, attributes, and duplicate children", () => {
    const root = parseXml(`<p:sld xmlns:p="ns"><a:r>hi</a:r><a:r>lo</a:r></p:sld>`);
    const sld = root["p:sld"];
    assert.equal(stripNs("p:sld"), "sld");
    assert.equal(findByLocalName(sld, "r")?.["#text"], "hi");
    assert.equal(findAllByLocalName(sld, "r").length, 2);
    assert.deepEqual(arr(undefined), []);
    assert.equal(attr({ "@_id": "x" }, "id"), "x");
  });

  it("prefers AlternateContent Choice over Fallback", () => {
    const root = parseXml(
      `<mc:AlternateContent xmlns:mc="mc"><mc:Choice><p:x/></mc:Choice><mc:Fallback><p:y/></mc:Fallback></mc:AlternateContent>`,
    );
    const kids = pickAlternateContentChildren(root["mc:AlternateContent"]);
    assert.equal(stripNs(kids[0]!.tag), "x");
  });
});
