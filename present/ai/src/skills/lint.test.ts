import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { lintSkill } from "./lint.js";

describe("lintSkill", () => {
  it("warns on missing checklist and unknown applies", () => {
    const noCheck = lintSkill({
      stage: "generate",
      body: "## Hello\ntext",
    });
    assert.ok(noCheck.some((w) => w.includes("no checklist")));
    const unknown = lintSkill({
      stage: "chat",
      body: "## X\n<!-- applies: not-a-family -->\n",
    });
    assert.ok(unknown.some((w) => w.includes("unknown style family")));
    const ok = lintSkill({
      stage: "chat",
      body: "## Hello\ntext",
    });
    assert.deepEqual(ok, []);
  });
});
