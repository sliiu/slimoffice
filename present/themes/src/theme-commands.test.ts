import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { identityTransform, type Presentation, type Shape, type TextRun } from "@ppt/core";
import { ApplyCustomThemeCmd } from "./theme-commands.js";
import { getTheme } from "./themes.js";

function textShape(id: string, runs: TextRun[]): Shape {
  return {
    id,
    name: id,
    zIndex: 0,
    visible: true,
    locked: false,
    opacity: 1,
    kind: "text",
    bbox: { x: 0, y: 0, w: 200, h: 40 },
    transform: identityTransform(),
    paragraphs: [{ runs }],
  };
}

function deck(shapes: Shape[]): Presentation {
  return {
    id: "p",
    size: { width: 1280, height: 720 },
    slides: [
      {
        id: "s1",
        name: "Slide 1",
        index: 0,
        layers: [{ id: "content", name: "Content", visible: true, locked: false, shapes }],
      },
    ],
  } as Presentation;
}

describe("ApplyCustomThemeCmd text color", () => {
  it("paints solid text fills to the theme text color and restores them on undo", () => {
    const body = textShape("title", [
      { text: "Title", color: "#1d1d1f", fill: { kind: "solid", color: "#1d1d1f" } },
    ]);
    const nested = textShape("nested", [
      { text: "Body", color: "#6e6e73", fill: { kind: "solid", color: "#6e6e73" } },
    ]);
    const group: Shape = {
      id: "g",
      name: "g",
      zIndex: 1,
      visible: true,
      locked: false,
      opacity: 1,
      kind: "group",
      bbox: { x: 0, y: 0, w: 200, h: 80 },
      transform: identityTransform(),
      children: [nested],
    };
    const chip: Shape = {
      id: "chip",
      name: "chip",
      zIndex: 2,
      visible: true,
      locked: false,
      opacity: 1,
      kind: "rect",
      bbox: { x: 0, y: 0, w: 40, h: 20 },
      transform: identityTransform(),
      fill: { kind: "solid", color: "#0071e3" },
    };
    const pres = deck([body, group, chip]);
    const theme = getTheme("business");
    const cmd = new ApplyCustomThemeCmd(theme, { preserveImageBackgrounds: true });

    cmd.apply(pres);

    const title = body.kind === "text" ? body.paragraphs[0]?.runs[0] : undefined;
    const inner = nested.kind === "text" ? nested.paragraphs[0]?.runs[0] : undefined;
    assert.equal(title?.color, theme.palette.text);
    assert.equal(title?.fill?.kind === "solid" ? title.fill.color : undefined, theme.palette.text);
    assert.equal(inner?.color, theme.palette.text);
    assert.equal(inner?.fill?.kind === "solid" ? inner.fill.color : undefined, theme.palette.text);
    assert.equal(chip.kind === "rect" ? chip.fill?.kind === "solid" && chip.fill.color : undefined, "#0071e3");

    cmd.revert(pres);

    assert.equal(title?.color, "#1d1d1f");
    assert.equal(title?.fill?.kind === "solid" ? title.fill.color : undefined, "#1d1d1f");
    assert.equal(inner?.color, "#6e6e73");
    assert.equal(inner?.fill?.kind === "solid" ? inner.fill.color : undefined, "#6e6e73");
  });
});
