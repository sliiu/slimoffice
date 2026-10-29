import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertShapeInScope, extractShapeTarget } from "./guard.js";
import type { DocumentPort } from "../kernel/port.js";

describe("shape scope guard", () => {
  it("extracts ids and blocks out-of-selection mutations", () => {
    assert.deepEqual(extractShapeTarget({ shapeId: "a", shapeIds: ["b", 1] }), {
      shapeId: "a",
      shapeIds: ["b"],
    });
    const port = { getSelectedShapeIds: () => ["a"] } as unknown as DocumentPort;
    assert.equal(assertShapeInScope(port, { shapeId: "a" }), null);
    assert.ok(assertShapeInScope(port, { shapeId: "z" })?.error.includes("BLOCKED"));
    const empty = { getSelectedShapeIds: () => [] } as unknown as DocumentPort;
    assert.equal(assertShapeInScope(empty, { shapeId: "z" }), null);
  });
});
