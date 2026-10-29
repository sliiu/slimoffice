import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeAliases } from "./aliases.js";

describe("normalizeAliases", () => {
  it("rewrites known alias keys without clobbering canonical fields", () => {
    assert.deepEqual(normalizeAliases({ bulletPoints: ["a"], theme: "swiss" }), {
      bullets: ["a"],
      themeId: "swiss",
    });
    assert.deepEqual(normalizeAliases({ bullets: ["keep"], items: ["drop"] }), { bullets: ["keep"] });
    assert.deepEqual(normalizeAliases([{ layout: "hero" }]), [{ layoutHint: "hero" }]);
    assert.deepEqual(
      normalizeAliases({
        kind: "agenda",
        title: "t",
        bullets: [
          { number: "01", label: "a", caption: "c" },
          { number: "02", label: "b" },
          { number: "03", label: "d" },
        ],
      }),
      {
        kind: "agenda",
        title: "t",
        items: [
          { number: "01", label: "a", caption: "c" },
          { number: "02", label: "b" },
          { number: "03", label: "d" },
        ],
      },
    );
    assert.deepEqual(
      normalizeAliases({ kind: "agenda", title: "t", items: [{ label: "a" }, { label: "b" }, { label: "c" }] }),
      { kind: "agenda", title: "t", items: [{ label: "a" }, { label: "b" }, { label: "c" }] },
    );
  });
});
