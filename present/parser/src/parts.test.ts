import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findPresentationPath, loadContentTypes, loadRels } from "./parts.js";
import type { PptxArchive } from "./zip.js";

function archive(files: Record<string, string>): PptxArchive {
  const map = new Map<string, Uint8Array>();
  const enc = new TextEncoder();
  for (const [k, v] of Object.entries(files)) map.set(k, enc.encode(v));
  return {
    files: map,
    getText: (p) => {
      const b = map.get(p);
      return b ? new TextDecoder().decode(b) : undefined;
    },
    getBytes: (p) => map.get(p),
    has: (p) => map.has(p),
    list: (prefix) => [...map.keys()].filter((k) => !prefix || k.startsWith(prefix)),
  };
}

describe("findPresentationPath", () => {
  it("reads officeDocument from package rels, else defaults", () => {
    const withRels = archive({
      "_rels/.rels": `<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="/ppt/presentation.xml"/></Relationships>`,
    });
    assert.equal(findPresentationPath(withRels), "ppt/presentation.xml");
    assert.equal(findPresentationPath(archive({})), "ppt/presentation.xml");
  });
});

describe("loadRels", () => {
  it("resolves relative targets against the owner part", () => {
    const ar = archive({
      "ppt/_rels/presentation.xml.rels": `<Relationships><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/><Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="https://cdn.example/a.png" TargetMode="External"/></Relationships>`,
    });
    const rels = loadRels(ar, "ppt/presentation.xml");
    assert.equal(rels.resolve("rId2"), "ppt/slides/slide1.xml");
    assert.equal(rels.resolve("rId9"), "https://cdn.example/a.png");
    assert.equal(rels.resolve("missing"), undefined);
  });
});

describe("loadContentTypes", () => {
  it("maps Default extension and Override part name", () => {
    const ar = archive({
      "[Content_Types].xml": `<Types><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>`,
    });
    const ct = loadContentTypes(ar);
    assert.equal(ct.find("foo.xml"), "application/xml");
    assert.equal(ct.find("ppt/slides/slide1.xml"), "application/vnd.openxmlformats-officedocument.presentationml.slide+xml");
  });
});
