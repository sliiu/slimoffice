import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decorationRoleForKind, hashKind } from "./compile.js";

describe("compile helpers", () => {
  it("hashes layout kinds stably and classifies decoration roles", () => {
    assert.equal(hashKind(1, "cover"), hashKind(1, "cover"));
    assert.notEqual(hashKind(1, "cover"), hashKind(1, "bullets"));
    assert.equal(decorationRoleForKind("hero"), "feature");
    assert.equal(decorationRoleForKind("table"), "content");
    assert.equal(decorationRoleForKind(undefined), "content");
  });
});
