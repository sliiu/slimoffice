import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { identityTransform, type Presentation, type Shape, type TextShape } from "@ppt/core";
import { imageFrame, readCrop } from "@ppt/editor/commands";
import { createHeadlessPort } from "../../kernel/port";
import { defaultConfig } from "../../config/types";
import { createToolRuntime } from "../types";
import { effectTools } from "./effects";
import { iconTools } from "./icons";
import { shapeBasicTools } from "./shapes-basic";

type AnyTool = { name: string; execute: (rt: ReturnType<typeof createToolRuntime>, input: unknown) => unknown };

function tool(name: string): AnyTool {
  const all = [...effectTools, ...iconTools, ...shapeBasicTools] as unknown as AnyTool[];
  const found = all.find((item) => item.name === name);
  if (!found) throw new Error(`missing tool ${name}`);
  return found;
}

function rtFor(shapes: Shape[]) {
  const pres = {
    id: "p",
    size: { width: 960, height: 540 },
    slides: [
      {
        id: "s",
        name: "s",
        index: 0,
        layers: [{ id: "l", name: "Main", visible: true, locked: false, shapes }],
      },
    ],
  } as Presentation;
  const port = createHeadlessPort(pres);
  return { rt: createToolRuntime({ port, getConfig: () => defaultConfig() }), port };
}

const base = {
  name: "s",
  zIndex: 0,
  visible: true,
  locked: false,
  opacity: 1,
  transform: identityTransform(),
};

describe("setImageCrop", () => {
  it("shrinks the window and keeps the picture rectangle", async () => {
    const picture: Shape = {
      ...base,
      id: "pic",
      kind: "image",
      src: "data:,x",
      bbox: { x: 0, y: 0, w: 200, h: 100 },
    };
    const { rt, port } = rtFor([picture]);
    const res = (await tool("setImageCrop").execute(rt, { slideIdx: 0, shapeId: "pic", r: 0.25 })) as {
      ok: boolean;
      error?: string;
    };
    assert.equal(res.ok, true, res.error ?? "");
    const shaped = port.getPres().slides[0]!.layers[0]!.shapes[0]!;
    assert.equal(shaped.bbox.w, 150);
    assert.deepEqual(readCrop(shaped), { l: 0, t: 0, r: 0.25, b: 0 });
    assert.equal(imageFrame(shaped.bbox, readCrop(shaped)).w, 200);
  });

  it("crops a stretched image fill and can clear it", async () => {
    const box: Shape = {
      ...base,
      id: "box",
      kind: "rect",
      bbox: { x: 0, y: 0, w: 100, h: 80 },
      fill: { kind: "image", src: "data:,x", fit: "cover" },
    };
    const { rt, port } = rtFor([box]);
    const cropped = (await tool("setImageCrop").execute(rt, { slideIdx: 0, shapeId: "box", l: 0.1 })) as {
      ok: boolean;
      error?: string;
    };
    assert.equal(cropped.ok, true, cropped.error ?? "");
    const shaped = port.getPres().slides[0]!.layers[0]!.shapes[0]!;
    assert.equal(shaped.fill?.kind, "image");
    if (shaped.fill?.kind === "image") assert.equal(shaped.fill.fit, "fill");
    const cleared = (await tool("setImageCrop").execute(rt, { slideIdx: 0, shapeId: "box", clear: true })) as {
      ok: boolean;
    };
    assert.equal(cleared.ok, true);
    const after = port.getPres().slides[0]!.layers[0]!.shapes[0]!;
    assert.deepEqual(readCrop(after), { l: 0, t: 0, r: 0, b: 0 });
    assert.equal(after.bbox.w, 100);
  });
});

describe("replaceIcon", () => {
  it("swaps the glyph and keeps the box", async () => {
    const icon: Shape = {
      ...base,
      id: "ico",
      kind: "image",
      src: "data:,old",
      bbox: { x: 12, y: 34, w: 48, h: 48 },
      descr: "ppt-icon:star|#112233",
    };
    const { rt, port } = rtFor([icon]);
    const res = (await tool("replaceIcon").execute(rt, { slideIdx: 0, shapeId: "ico", icon: "heart" })) as {
      ok: boolean;
      error?: string;
    };
    assert.equal(res.ok, true, res.error ?? "");
    const shaped = port.getPres().slides[0]!.layers[0]!.shapes[0]!;
    assert.equal(shaped.kind, "image");
    if (shaped.kind === "image") {
      assert.equal(shaped.descr, "ppt-icon:heart|#112233");
      assert.ok(shaped.svgSrc?.includes("data:image/svg+xml"));
    }
    assert.deepEqual(shaped.bbox, { x: 12, y: 34, w: 48, h: 48 });
  });

  it("refuses a photo", async () => {
    const photo: Shape = { ...base, id: "pic", kind: "image", src: "data:,x", bbox: { x: 0, y: 0, w: 10, h: 10 } };
    const { rt } = rtFor([photo]);
    const res = (await tool("replaceIcon").execute(rt, { slideIdx: 0, shapeId: "pic", icon: "heart" })) as {
      ok: boolean;
    };
    assert.equal(res.ok, false);
  });
});

describe("setShapeTextStyle character range", () => {
  it("restyles only the matched phrase", () => {
    const text: TextShape = {
      ...base,
      id: "t",
      kind: "text",
      bbox: { x: 0, y: 0, w: 200, h: 40 },
      wrap: true,
      vAlign: "top",
      paragraphs: [{ align: "start", runs: [{ text: "SlimPPT", fontSize: 20, fontFamily: "Arial" }] }],
    };
    const { rt, port } = rtFor([text]);
    const res = tool("setShapeTextStyle").execute(rt, {
      slideIdx: 0,
      shapeId: "t",
      phrase: "PPT",
      fontFamily: "Georgia",
      fontSize: 28,
    }) as { ok: boolean; error?: string };
    assert.equal(res.ok, true, res.error ?? "");
    const shaped = port.getPres().slides[0]!.layers[0]!.shapes[0] as TextShape;
    const runs = shaped.paragraphs[0]!.runs;
    assert.deepEqual(
      runs.map((run) => ({ text: run.text, fontFamily: run.fontFamily, fontSize: run.fontSize })),
      [
        { text: "Slim", fontFamily: "Arial", fontSize: 20 },
        { text: "PPT", fontFamily: "Georgia", fontSize: 28 },
      ],
    );
  });
});
