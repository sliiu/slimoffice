import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatVbaBasExport, parseVbaModuleProcedures } from "./vba-project-parse.js";

describe("parseVbaModuleProcedures", () => {
  it("collects unique Sub / Function / Property names", () => {
    const src = [
      "Public Sub Foo()",
      "End Sub",
      "Private Function Bar() As Long",
      "End Function",
      "Property Get Baz() As String",
      "End Property",
      "Sub Foo()",
      "End Sub",
    ].join("\n");
    assert.deepEqual(parseVbaModuleProcedures(src), ["Foo", "Bar", "Baz"]);
  });
});

describe("formatVbaBasExport", () => {
  it("prepends VB_Name when missing and normalizes CRLF", () => {
    assert.equal(
      formatVbaBasExport("Mod1", "Sub A()\nEnd Sub\n"),
      'Attribute VB_Name = "Mod1"\r\nSub A()\r\nEnd Sub\r\n',
    );
    assert.equal(formatVbaBasExport("X", 'Attribute VB_Name = "X"\nSub A()\n'), 'Attribute VB_Name = "X"\r\nSub A()\r\n');
  });
});
