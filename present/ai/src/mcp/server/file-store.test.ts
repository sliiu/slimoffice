import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import type { Presentation } from "@ppt/core";
import { parsePptx } from "@ppt/parser";
import { writePptx } from "@ppt/serializer";
import { createFileDeckStore, resolveDeckFile } from "./file-store.js";

function tinyPres(name: string): Presentation {
  return {
    id: "t",
    size: { width: 1280, height: 720 },
    slides: [
      {
        id: "s1",
        name,
        background: { kind: "solid", color: "#ffffff" },
        layers: [{ id: "l1", name: "main", shapes: [] }],
      },
    ],
  } as unknown as Presentation;
}

describe("local file deck store", () => {
  it("lists, loads, and writes back a pptx in the folder", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "slimppt-local-"));
    await writeFile(path.join(root, "talk.pptx"), writePptx(tinyPres("Opening")));
    await writeFile(path.join(root, "notes.txt"), "ignore");

    const store = createFileDeckStore(root);
    const listed = await store.list();
    assert.deepEqual(
      listed.map((d) => ({ deckId: d.deckId, slideCount: d.slideCount })),
      [{ deckId: "talk.pptx", slideCount: 1 }],
    );

    const opened = await store.load("talk.pptx");
    assert.equal(opened.slides.length, 1);
    opened.slides[0]!.name = "Renamed";
    await store.save("talk.pptx", opened);

    const again = await parsePptx(await readFile(path.join(root, "talk.pptx")), { mediaMode: "data" });
    assert.equal(again.slides.length, 1);
    assert.equal(again.slides[0]!.name, "Renamed");
    const bytes = await readFile(path.join(root, "talk.pptx"));
    assert.equal(bytes[0], 0x50);
    assert.equal(bytes[1], 0x4b);
  });

  it("rejects paths outside the folder and non-pptx names", () => {
    const root = path.resolve("/tmp/slimppt-root");
    assert.throws(() => resolveDeckFile(root, "../secret.pptx"), /not a file name/);
    assert.throws(() => resolveDeckFile(root, "nested/talk.pptx"), /not a file name/);
    assert.throws(() => resolveDeckFile(root, "notes.txt"), /must be a \.pptx/);
  });
});
