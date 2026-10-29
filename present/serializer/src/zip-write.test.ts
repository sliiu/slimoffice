import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dataUrlToBytes, ensureContentTypesDefault, mimeToExt, packZip } from "./zip-write.js";

describe("dataUrlToBytes", () => {
  it("decodes base64 and percent-encoded payloads", () => {
    const b64 = dataUrlToBytes("data:image/png;base64,AQID");
    assert.equal(b64?.mime, "image/png");
    assert.deepEqual(Array.from(b64!.bytes), [1, 2, 3]);
    const svg = dataUrlToBytes("data:image/svg+xml;charset=utf-8,%3Csvg/%3E");
    assert.equal(svg?.mime, "image/svg+xml");
    assert.equal(new TextDecoder().decode(svg!.bytes), "<svg/>");
    assert.equal(dataUrlToBytes("https://x"), null);
  });
});

describe("mimeToExt / ensureContentTypesDefault / packZip", () => {
  it("maps mime, inserts missing Default, and packs a zip", () => {
    assert.equal(mimeToExt("image/jpeg"), "jpg");
    assert.equal(mimeToExt("application/x-unknown"), "bin");
    const xml = '<Types xmlns="ct"></Types>';
    const next = ensureContentTypesDefault(xml, "svg");
    assert.match(next, /Extension="svg"/);
    assert.equal(ensureContentTypesDefault(next, ".svg"), next);
    const zip = packZip({ "hello.txt": "hi" });
    assert.ok(zip.byteLength > 0);
  });
});
