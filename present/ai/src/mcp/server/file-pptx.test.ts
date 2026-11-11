import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { identityTransform, type Presentation, type Shape } from "@ppt/core";
import { writePptx } from "@ppt/serializer";
import { writeFile } from "node:fs/promises";
import { screenshotTools } from "../../tools/domains/screenshot";
import { shapeBasicTools } from "../../tools/domains/shapes-basic";
import { createToolRuntime } from "../../tools/types";
import { createHeadlessPort } from "../../kernel/port";
import { defaultConfig } from "../../config/types";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { findChromeBrowser, screenshotSlidesViaBrowser } from "@ppt/player/browser-screenshot";
import { readPptxFile, writePptxFile } from "./file-pptx";
import { PRESENT_AGENT_INSTRUCTIONS } from "./workflow";

function textShape(text: string): Shape {
  return {
    id: "title",
    name: "title",
    kind: "text",
    zIndex: 0,
    visible: true,
    locked: false,
    opacity: 1,
    transform: identityTransform(),
    bbox: { x: 80, y: 80, w: 800, h: 120 },
    paragraphs: [{ align: "middle", runs: [{ text, fontSize: 48, color: "#ffffff" }] }],
  } as Shape;
}

function deck(label: string): Presentation {
  return {
    id: "p",
    size: { width: 1280, height: 720 },
    slides: [
      {
        id: "s0",
        name: "s0",
        index: 0,
        background: { kind: "solid", color: "#1e3a5f" },
        layers: [{ id: "l", name: "Main", visible: true, locked: false, shapes: [textShape(label)] }],
      },
    ],
  } as Presentation;
}

function shapeText(pres: Presentation): string {
  const chunks: string[] = [];
  const walk = (shape: Shape): void => {
    if (shape.kind === "text") chunks.push(shape.paragraphs.map((p) => p.runs.map((r) => r.text).join("")).join("\n"));
    if (shape.kind === "group") shape.children.forEach(walk);
  };
  pres.slides[0]?.layers.forEach((layer) => layer.shapes.forEach(walk));
  return chunks.join("\n");
}

function textShapeId(pres: Presentation): string {
  const walk = (shape: Shape): string | undefined => {
    if (shape.kind === "text") return shape.id;
    if (shape.kind === "group") {
      for (const child of shape.children) {
        const id = walk(child);
        if (id) return id;
      }
    }
    return undefined;
  };
  for (const layer of pres.slides[0]?.layers ?? []) {
    for (const shape of layer.shapes) {
      const id = walk(shape);
      if (id) return id;
    }
  }
  throw new Error("no text shape");
}

describe("pptx file round-trip for an agent", () => {
  it("opens a file, edits the text, and writes the same path", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ppt-agent-"));
    const file = path.join(dir, "deck.pptx");
    await writeFile(file, writePptx(deck("BEFORE")));

    const opened = await readPptxFile(file);
    assert.match(shapeText(opened.pres), /BEFORE/);
    const port = createHeadlessPort(opened.pres);
    const rt = createToolRuntime({ port, getConfig: () => defaultConfig() });
    const tool = shapeBasicTools.find((item) => item.name === "replaceShapeText") as {
      execute: (rt: ReturnType<typeof createToolRuntime>, input: { slideIdx: number; shapeId: string; paragraphs: string[] }) => Promise<{ ok: boolean }>;
    } | undefined;
    assert.ok(tool);
    const edited = await tool.execute(rt, { slideIdx: 0, shapeId: textShapeId(opened.pres), paragraphs: ["AFTER"] });
    assert.equal((edited as { ok: boolean }).ok, true);
    const saved = await writePptxFile(file, port.getPres());
    const again = await readPptxFile(saved);
    assert.equal(shapeText(again.pres), "AFTER");
  });

  it("screenshots the saved deck when a browser is installed", async () => {
    const bin = await findChromeBrowser();
    if (!bin) return;
    const dir = await mkdtemp(path.join(tmpdir(), "ppt-agent-shot-"));
    const file = path.join(dir, "deck.pptx");
    await writeFile(file, writePptx(deck("AFTER")));
    const opened = await readPptxFile(file);
    const req = createRequire(import.meta.url);
    let playerScript: string;
    try {
      playerScript = readFileSync(req.resolve("@ppt/player/iife"), "utf8");
    } catch {
      return;
    }
    const shots = await screenshotSlidesViaBrowser(opened.pres, playerScript, {
      slideIndices: [0],
      width: 960,
    });
    assert.ok(shots[0] && shots[0].png.byteLength > 1000);
    assert.equal(shots[0].png[0], 0x89);
    await writeFile("/tmp/agent-after.png", shots[0].png);
  });

  it("tells the agent to open, screenshot, and save", () => {
    assert.match(PRESENT_AGENT_INSTRUCTIONS, /open_pptx/);
    assert.match(PRESENT_AGENT_INSTRUCTIONS, /screenshot_slide/);
    assert.match(PRESENT_AGENT_INSTRUCTIONS, /save_pptx/);
    assert.equal(screenshotTools[0]?.name, "screenshot_slide");
  });
});
