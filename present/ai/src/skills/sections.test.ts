import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractChecklistSections, filterSkillBody, parseSkillSections } from "./sections.js";

const body = `Preamble here.

## Swiss
<!-- applies: swiss -->
Only swiss.

## Checklist
<!-- checklist -->
Must pass.
`;

const staged = `Keep both.

## Generate only
<!-- stage: generate -->
Outline arc.

## Chat only
<!-- stage: chat -->
Ripple loop.
`;

describe("skill sections", () => {
  it("parses annotations and filters by family", () => {
    const secs = parseSkillSections(body);
    assert.equal(secs.some((s) => s.applies?.includes("swiss")), true);
    assert.ok(filterSkillBody(body, { styleFamily: "swiss" }).includes("Only swiss"));
    assert.equal(filterSkillBody(body, { styleFamily: "memphis" }).includes("Only swiss"), false);
    assert.equal(extractChecklistSections(body).length, 1);
  });

  it("filters by stage even without family/layout", () => {
    const chat = filterSkillBody(staged, { stage: "chat" });
    assert.ok(chat.includes("Keep both"));
    assert.ok(chat.includes("Ripple loop"));
    assert.equal(chat.includes("Outline arc"), false);
    const gen = filterSkillBody(staged, { stage: "generate" });
    assert.ok(gen.includes("Outline arc"));
    assert.equal(gen.includes("Ripple loop"), false);
  });
});
