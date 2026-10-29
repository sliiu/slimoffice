import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildXml, localName, parseXmlPreserveOrder } from "./raw-xml.js";

describe("raw-xml", () => {
  it("strips namespace and round-trips a simple element", () => {
    assert.equal(localName("p:sld"), "sld");
    assert.equal(localName("sld"), "sld");
    const xml = '<p:sld xmlns:p="ns" id="1"><a:t>hi</a:t></p:sld>';
    const tree = parseXmlPreserveOrder(xml);
    const out = buildXml(tree);
    assert.match(out, /<p:sld/);
    assert.match(out, />hi</);
  });
});
