import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { convertMetafileToSvgDataUrl } from "emf-converter";
import { isMetafileBytes, isMetafileDataUrl, METAFILE_MARKER_SRC } from "./metafile-preview.js";

function minimalEmf(): Uint8Array {
  const header = 88;
  const eof = 20;
  const bytes = new Uint8Array(header + eof);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 1, true);
  view.setUint32(4, header, true);
  view.setInt32(8, 0, true);
  view.setInt32(12, 0, true);
  view.setInt32(16, 100, true);
  view.setInt32(20, 80, true);
  view.setInt32(24, 0, true);
  view.setInt32(28, 0, true);
  view.setInt32(32, 2646, true);
  view.setInt32(36, 2117, true);
  view.setUint32(40, 0x464d4520, true);
  view.setUint32(44, 0x00010000, true);
  view.setUint32(48, bytes.length, true);
  view.setUint32(52, 2, true);
  view.setUint16(56, 1, true);
  view.setUint16(58, 0, true);
  view.setUint32(60, 0, true);
  view.setUint32(64, 0, true);
  view.setUint32(68, 0, true);
  view.setUint32(72, 1920, true);
  view.setUint32(76, 1080, true);
  view.setUint32(80, 508, true);
  view.setUint32(84, 286, true);
  const eofAt = header;
  view.setUint32(eofAt, 14, true);
  view.setUint32(eofAt + 4, eof, true);
  view.setUint32(eofAt + 8, 0, true);
  view.setUint32(eofAt + 12, 0, true);
  view.setUint32(eofAt + 16, eof, true);
  return bytes;
}

describe("metafile preview", () => {
  it("recognizes an EMF signature and a metafile data URL", () => {
    const bytes = minimalEmf();
    assert.equal(isMetafileBytes(bytes), true);
    assert.equal(isMetafileBytes(new Uint8Array([1, 2, 3, 4])), false);
    assert.equal(isMetafileDataUrl("data:image/x-emf;base64,QQ=="), true);
    assert.equal(isMetafileDataUrl("data:image/png;base64,QQ=="), false);
    assert.match(METAFILE_MARKER_SRC, /^data:image\/svg\+xml/);
  });

  it("turns a minimal EMF into an SVG data URL", async () => {
    const bytes = minimalEmf();
    const copy = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(copy).set(bytes);
    const svg = await convertMetafileToSvgDataUrl(copy);
    assert.equal(typeof svg, "string");
    assert.match(svg ?? "", /^data:image\/svg\+xml/);
  });
});
