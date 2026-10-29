import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parsePptx, PptxOpenError } from "./parse";

const CFB_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

function compoundFile(streamName: string): Uint8Array {
  const name = Array.from(streamName).flatMap((c) => [c.charCodeAt(0), 0]);
  return new Uint8Array([...CFB_MAGIC, ...new Array(504).fill(0), ...name, 0, 0]);
}

describe("parsePptx compound-file rejection", () => {
  it("reports password-protected .pptx separately from legacy .ppt", async () => {
    await assert.rejects(parsePptx(compoundFile("EncryptedPackage")), (e: unknown) => {
      assert.ok(e instanceof PptxOpenError);
      assert.equal(e.code, "ENCRYPTED_PPTX");
      return true;
    });
    await assert.rejects(parsePptx(compoundFile("PowerPoint Document")), (e: unknown) => {
      assert.ok(e instanceof PptxOpenError);
      assert.equal(e.code, "LEGACY_PPT");
      return true;
    });
  });
});
