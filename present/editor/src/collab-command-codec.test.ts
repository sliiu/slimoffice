import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Presentation } from "@ppt/core";
import { deserializeCollabCommand, serializeCollabCommand } from "./collab-command-codec.js";
import { ReplaceImageSrcCmd, SetSlideSizeCmd, slideTarget, SetBackgroundTargetCmd } from "./commands.js";
import { ApplyThemeVariantCmd } from "./theme-variant-cmd.js";
import { SetProofingLanguageCmd } from "./proofing-language-cmd.js";

function deck(): Presentation {
  return {
    size: { width: 1280, height: 720 },
    slides: [
      {
        id: "s1",
        layers: [{ id: "main", name: "Main", visible: true, locked: false, shapes: [] }],
        background: { kind: "solid", color: "#ffffff" },
      },
    ],
    theme: {
      colors: {
        dk1: "#000000",
        lt1: "#ffffff",
        dk2: "#111111",
        lt2: "#eeeeee",
        accent1: "#112233",
        accent2: "#223344",
        accent3: "#334455",
        accent4: "#445566",
        accent5: "#556677",
        accent6: "#667788",
        hlink: "#0000ff",
        folHlink: "#800080",
        bg1: "#ffffff",
        tx1: "#000000",
        bg2: "#f8fafc",
        tx2: "#0f172a",
      },
    },
  } as unknown as Presentation;
}

describe("collab command codec", () => {
  it("round-trips slide size instead of dropping the command", () => {
    const wire = serializeCollabCommand(new SetSlideSizeCmd({ width: 960, height: 540 }));
    assert.equal(wire?.type, "setSlideSize");
    const cmd = wire ? deserializeCollabCommand(wire) : null;
    assert.ok(cmd);
    const pres = deck();
    cmd.apply(pres);
    assert.deepEqual(pres.size, { width: 960, height: 540 });
  });

  it("round-trips theme variant and proofing language", () => {
    const theme = serializeCollabCommand(new ApplyThemeVariantCmd("cool"));
    assert.equal(theme?.type, "applyThemeVariant");
    const themeCmd = theme ? deserializeCollabCommand(theme) : null;
    assert.ok(themeCmd);
    const pres = deck();
    const before = pres.theme?.colors?.accent1;
    themeCmd.apply(pres);
    assert.notEqual(pres.theme?.colors?.accent1, before);

    const lang = serializeCollabCommand(new SetProofingLanguageCmd("zh-CN"));
    assert.equal(lang?.type, "setProofingLanguage");
    const langCmd = lang ? deserializeCollabCommand(lang) : null;
    assert.ok(langCmd);
    langCmd.apply(pres);
    assert.equal(pres.meta?.proofingLang, "zh-CN");
  });

  it("round-trips a master-or-slide background target", () => {
    const wire = serializeCollabCommand(
      new SetBackgroundTargetCmd(slideTarget(0), { kind: "solid", color: "#111111" }),
    );
    assert.equal(wire?.type, "setBackgroundTarget");
    const cmd = wire ? deserializeCollabCommand(wire) : null;
    assert.ok(cmd);
    const pres = deck();
    cmd.apply(pres);
    assert.equal(pres.slides[0]?.background?.kind, "solid");
    if (pres.slides[0]?.background?.kind === "solid") {
      assert.equal(pres.slides[0].background.color, "#111111");
    }
  });

  it("round-trips an icon swap and restores the previous graphic", () => {
    const pres = deck();
    pres.slides[0]!.layers[0]!.shapes.push({
      id: "ico",
      name: "Icon",
      zIndex: 0,
      visible: true,
      locked: false,
      opacity: 1,
      kind: "image",
      src: "data:image/png;base64,old",
      svgSrc: "data:image/svg+xml,old",
      descr: "ppt-icon:star|#111827",
      bbox: { x: 10, y: 20, w: 96, h: 96 },
      cropRect: { l: 0.1, t: 0, r: 0, b: 0 },
    } as never);
    const cmd = new ReplaceImageSrcCmd(
      0,
      "ico",
      "data:image/png;base64,new",
      { w: 96, h: 96 },
      { svgSrc: "data:image/svg+xml,new", descr: "ppt-icon:heart|#ff0000" },
    );
    const wire = serializeCollabCommand(cmd);
    assert.equal(wire?.type, "replaceImageSrc");
    assert.equal((wire?.payload as { svgSrc?: string } | undefined)?.svgSrc, "data:image/svg+xml,new");
    const again = wire ? deserializeCollabCommand(wire) : null;
    assert.ok(again);
    again.apply(pres);
    const img = pres.slides[0]!.layers[0]!.shapes[0]!;
    assert.equal(img.kind, "image");
    if (img.kind !== "image") return;
    assert.equal(img.src, "data:image/png;base64,new");
    assert.equal(img.svgSrc, "data:image/svg+xml,new");
    assert.equal(img.descr, "ppt-icon:heart|#ff0000");
    assert.equal(img.cropRect, undefined);
    assert.deepEqual(img.bbox, { x: 10, y: 20, w: 96, h: 96 });
    again.revert(pres);
    assert.equal(img.src, "data:image/png;base64,old");
    assert.equal(img.svgSrc, "data:image/svg+xml,old");
    assert.equal(img.descr, "ppt-icon:star|#111827");
    assert.deepEqual(img.cropRect, { l: 0.1, t: 0, r: 0, b: 0 });
  });
});
