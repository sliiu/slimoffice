import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inspectMathMarkup } from "./omml.js";
import { parseXml } from "./xml.js";

describe("inspectMathMarkup", () => {
  it("flags OMML, plain text, and pictures", () => {
    const math = parseXml(`<a14:m><m:oMath><m:r><m:t>x</m:t></m:r></m:oMath></a14:m>`);
    assert.deepEqual(inspectMathMarkup(math["a14:m"]), {
      hasOmml: true,
      hasPlainText: false,
      hasPicture: false,
    });
    const text = parseXml(`<a:p><a:r><a:t>hi</a:t></a:r></a:p>`);
    assert.equal(inspectMathMarkup(text["a:p"]).hasPlainText, true);
    const pic = parseXml(`<p:sp><p:pic/></p:sp>`);
    assert.equal(inspectMathMarkup(pic["p:sp"]).hasPicture, true);
    assert.deepEqual(inspectMathMarkup(undefined), {
      hasOmml: false,
      hasPlainText: false,
      hasPicture: false,
    });
  });
});
