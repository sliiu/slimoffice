import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TimeNode } from "../types";
import { expandPresetTemplate, presetTemplateSubtypeKind, presetTemplateSubtypes } from "./expand";
import { findPresetTemplate } from "./registry";

function directionTokens(node: unknown, out: string[] = []): string[] {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const n of node) directionTokens(n, out);
    return out;
  }
  const n = node as Record<string, unknown> & { kind?: string };
  if (n.kind === "animEffect" && typeof n.filter === "string") out.push(n.filter);
  if (n.kind === "anim") {
    const attrs = (n.cBhvr as { attrNameLst?: string[] }).attrNameLst ?? [];
    const vals = ((n.tavLst as Array<{ val?: { val?: unknown } }>) ?? []).map((t) => String(t.val?.val));
    out.push(`${attrs.join(",")}:${vals.join("→")}`);
  }
  for (const v of Object.values(n)) if (v && typeof v === "object") directionTokens(v, out);
  return out;
}

function expand(cls: "entr" | "exit", id: number, presetSubtype: number): string[] {
  const tpl = findPresetTemplate(cls, id);
  assert.ok(tpl, `${cls} ${id} template`);
  return [...new Set(directionTokens(expandPresetTemplate(tpl, { tgtSpid: "9", presetSubtype }) as TimeNode))];
}

describe("preset subtype derivation", () => {
  it("derives Fly In directions missing from the extracted samples", () => {
    assert.deepEqual(expand("entr", 2, 1), ["ppt_x:#ppt_x→#ppt_x", "ppt_y:0-#ppt_h/2→#ppt_y"]);
    assert.deepEqual(expand("entr", 2, 3), ["ppt_x:1+#ppt_w/2→#ppt_x", "ppt_y:0-#ppt_h/2→#ppt_y"]);
    assert.deepEqual(expand("exit", 2, 9), ["ppt_x:ppt_x→0-ppt_w/2", "ppt_y:ppt_y→0-ppt_h/2"]);
  });

  it("keeps extracted variants untouched", () => {
    assert.deepEqual(expand("exit", 2, 3), ["ppt_x:ppt_x→1+ppt_w/2", "ppt_y:ppt_y→0-ppt_h/2"]);
    assert.deepEqual(expand("entr", 22, 4), ["wipe(down)"]);
  });

  it("rewrites filter direction parameters", () => {
    assert.deepEqual(expand("entr", 22, 2), ["wipe(right)"]);
    assert.deepEqual(expand("entr", 3, 5), ["blinds(vertical)"]);
    assert.deepEqual(expand("exit", 18, 6), ["strips(downRight)"]);
    assert.deepEqual(expand("entr", 16, 42), ["barn(outHorizontal)"]);
    assert.deepEqual(expand("entr", 4, 32), ["box(out)"]);
  });

  it("picks a donor it can rewrite when another variant is not rewritable", () => {
    assert.deepEqual(expand("exit", 12, 2), ["slide(fromRight)"]);
  });

  it("lists only subtypes the template can produce, with their meaning", () => {
    const blinds = findPresetTemplate("entr", 3)!;
    assert.deepEqual(presetTemplateSubtypes(blinds), [5, 10]);
    assert.equal(presetTemplateSubtypeKind(blinds), "axis");
    const fly = findPresetTemplate("entr", 2)!;
    assert.deepEqual(presetTemplateSubtypes(fly), [1, 2, 3, 4, 6, 8, 9, 12]);
    assert.equal(presetTemplateSubtypeKind(fly), "compass");
    assert.deepEqual(presetTemplateSubtypes(findPresetTemplate("entr", 17)!), [1, 2, 4, 5, 8, 10]);
    assert.equal(presetTemplateSubtypeKind(findPresetTemplate("entr", 17)!), "stretch");
    assert.deepEqual(presetTemplateSubtypes(findPresetTemplate("entr", 19)!), [5, 10]);
    assert.equal(presetTemplateSubtypeKind(findPresetTemplate("entr", 19)!), "axis");
  });

  it("rewrites stretch toward an edge or toward the center, and swaps swivel axes", () => {
    assert.deepEqual(expand("entr", 17, 1), [
      "ppt_y:#ppt_y-#ppt_h/2→#ppt_y",
      "ppt_x:#ppt_x→#ppt_x",
      "ppt_h:0→#ppt_h",
      "ppt_w:#ppt_w→#ppt_w",
    ]);
    assert.deepEqual(expand("entr", 17, 8), [
      "ppt_x:#ppt_x-#ppt_w/2→#ppt_x",
      "ppt_y:#ppt_y→#ppt_y",
      "ppt_w:0→#ppt_w",
      "ppt_h:#ppt_h→#ppt_h",
    ]);
    assert.deepEqual(expand("entr", 17, 10), [
      "ppt_x:#ppt_x→#ppt_x",
      "ppt_y:#ppt_y→#ppt_y",
      "ppt_w:0→#ppt_w",
      "ppt_h:#ppt_h→#ppt_h",
    ]);
    assert.ok(expand("exit", 17, 2).includes("ppt_x:ppt_x→ppt_x+ppt_w/2"));
    assert.ok(expand("exit", 17, 2).includes("ppt_w:ppt_w→0"));
    assert.deepEqual(expand("entr", 19, 5), ["ppt_h:0→1", "ppt_w:#ppt_w→#ppt_w"]);
  });
});
