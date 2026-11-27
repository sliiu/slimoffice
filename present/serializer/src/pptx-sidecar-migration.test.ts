import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { setPresentationProtectionMeta } from "@sliiu/present-core";
import { patchSlimPptSidecarTags } from "./pptx-comment-meta.js";

const TAG_XML = (name: string, val: string): string =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:tagLst xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:tag name="${name}" val="${val}"/></p:tagLst>`;

function makePres(sourcePath: string): any {
  const pres: any = { slides: [], meta: undefined, sections: undefined, comments: [] };
  setPresentationProtectionMeta(pres, { kind: "restricted", setAt: 1_700_000_000_000, passwordHash: "abc123" });
  Object.defineProperty(pres, "__source", { value: { tagsPartPath: sourcePath } });
  return pres;
}

function makeArchive(sourcePath: string, xml: string): any {
  return { files: new Map([[sourcePath, new TextEncoder().encode(xml)]]) };
}

const encode = (o: object): string =>
  JSON.stringify(o).replace(/"/g, "&quot;");

/** 保存含 Pavera 旧键的文稿时，tags 部件应迁移到 Parchon 键，并保留用户标签。 */
describe("sidecar tag migration", () => {
  it("rewrites a Pavera legacy protection key to Parchon on save", () => {
    const pres = makePres("ppt/tags/tag3.xml");
    const archive = makeArchive(
      "ppt/tags/tag3.xml",
      TAG_XML("Pavera.Protection.v1", encode({ v: 1, kind: "restricted", setAt: 1_700_000_000_000, passwordHash: "abc123" })) +
        '<p:tag name="X-User" val="hi"/>',
    );
    patchSlimPptSidecarTags(pres, archive);
    const out = new TextDecoder().decode(archive.files.get("ppt/tags/tag3.xml"));
    assert.ok(out.includes('name="Parchon.Protection.v1"'), "writes Parchon key");
    assert.ok(!out.includes("Pavera.Protection.v1"), "drops the Pavera legacy key");
    assert.ok(!out.includes("SlimPPT.Protection.v1"), "drops any SlimPPT legacy key");
    assert.ok(out.includes('name="X-User" val="hi"'), "keeps user tags");
  });

  it("rewrites a SlimPPT legacy protection key to Parchon on save", () => {
    const pres = makePres("ppt/tags/tag3.xml");
    const archive = makeArchive(
      "ppt/tags/tag3.xml",
      TAG_XML("SlimPPT.Protection.v1", encode({ v: 1, kind: "restricted", setAt: 1_700_000_000_000, passwordHash: "abc123" })),
    );
    patchSlimPptSidecarTags(pres, archive);
    const out = new TextDecoder().decode(archive.files.get("ppt/tags/tag3.xml"));
    assert.ok(out.includes('name="Parchon.Protection.v1"'), "writes Parchon key for SlimPPT input");
    assert.ok(!out.includes("SlimPPT.Protection.v1"), "drops the SlimPPT legacy key");
  });

  it("re-save of a Parchon-keyed archive stays byte-identical", () => {
    const pres = makePres("ppt/tags/tag3.xml");
    const archive = makeArchive(
      "ppt/tags/tag3.xml",
      TAG_XML("Parchon.Protection.v1", encode({ v: 1, kind: "restricted", setAt: 1_700_000_000_000, passwordHash: "abc123" })),
    );
    const before = new TextDecoder().decode(archive.files.get("ppt/tags/tag3.xml"));
    patchSlimPptSidecarTags(pres, archive);
    const out = new TextDecoder().decode(archive.files.get("ppt/tags/tag3.xml"));
    assert.equal(out, before);
  });
});