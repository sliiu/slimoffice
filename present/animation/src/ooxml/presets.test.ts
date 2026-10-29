import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compilePresetTracks } from "./presets";

const ctx = { duration: 1, bbox: { x: 0, y: 0, w: 100, h: 50 }, slideWidth: 1000, slideHeight: 500 };

function startOffset(cls: "entr" | "exit", id: number, subtype: number): { tx: number; ty: number } {
  const tracks = compilePresetTracks(cls, id, subtype, ctx);
  const at = (prop: string, i: number): number => {
    const t = tracks.find((tr) => tr.kind === "prop" && tr.property === prop);
    const keys = t && t.kind === "prop" ? t.keys : [];
    return Number(keys.at(i)?.value ?? 0);
  };
  return cls === "entr" ? { tx: at("tx", 0), ty: at("ty", 0) } : { tx: at("tx", -1), ty: at("ty", -1) };
}

// presetSubtype 是位标志：1 上、2 右、4 下、8 左（与 presets-template/data/extracted.json 里 PowerPoint 自己的子树一致）。
describe("compilePresetTracks presetSubtype direction bits", () => {
  it("Fly In starts on the side named by the subtype bit", () => {
    assert.deepEqual(startOffset("entr", 2, 1), { tx: 0, ty: -500 });
    assert.deepEqual(startOffset("entr", 2, 2), { tx: 1000, ty: 0 });
    assert.deepEqual(startOffset("entr", 2, 4), { tx: 0, ty: 500 });
    assert.deepEqual(startOffset("entr", 2, 8), { tx: -1000, ty: 0 });
  });

  it("combines bits for corners", () => {
    const tr = startOffset("entr", 2, 3);
    assert.ok(tr.tx > 0 && tr.ty < 0);
    const bl = startOffset("entr", 2, 12);
    assert.ok(bl.tx < 0 && bl.ty > 0);
  });

  it("Fly Out leaves toward the subtype side", () => {
    assert.deepEqual(startOffset("exit", 2, 8), { tx: -1000, ty: 0 });
    assert.deepEqual(startOffset("exit", 2, 4), { tx: 0, ty: 500 });
    const tr = startOffset("exit", 2, 3);
    assert.ok(tr.tx > 0 && tr.ty < 0);
  });

  it("Flash Once exit blinks and then stays hidden", () => {
    const track = compilePresetTracks("exit", 11, undefined, ctx).find(
      (t) => t.kind === "prop" && t.property === "opacity",
    );
    assert.equal(track?.kind, "prop");
    if (track?.kind !== "prop") return;
    const values = track.keys.map((k) => k.value);
    assert.equal(values[0], 1);
    assert.ok(values.includes(0));
    assert.ok(values.indexOf(0) < values.lastIndexOf(1));
    assert.equal(values.at(-1), 0);
  });

  it("maps axis subtypes 5 / 10 to vertical / horizontal Blinds", () => {
    const prLst = (sub: number): string | undefined => {
      const f = compilePresetTracks("entr", 3, sub, ctx).find((t) => t.kind === "filter");
      return f && f.kind === "filter" ? f.prLst : undefined;
    };
    assert.equal(prLst(5), "vert(in)");
    assert.equal(prLst(10), "horz(in)");
  });

  it("reads in/out, checkerboard down, and strip corners on the fallback table", () => {
    const pr = (id: number, sub: number): string | undefined => {
      const f = compilePresetTracks("entr", id, sub, ctx).find((t) => t.kind === "filter");
      return f && f.kind === "filter" ? f.prLst : undefined;
    };
    assert.equal(pr(4, 16), "in");
    assert.equal(pr(4, 32), "out");
    assert.equal(pr(6, 32), "out");
    assert.equal(pr(5, 5), "down(in)");
    assert.equal(pr(5, 10), "across(in)");
    assert.equal(pr(18, 9), "upLeft");
    assert.equal(pr(18, 6), "downRight");
    const exitBox = compilePresetTracks("exit", 4, 16, ctx).find((t) => t.kind === "filter");
    assert.equal(exitBox && exitBox.kind === "filter" ? exitBox.prLst : undefined, "in");
  });
});
