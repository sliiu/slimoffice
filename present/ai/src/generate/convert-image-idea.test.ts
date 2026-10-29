import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { convertImageIdeaToEnglish } from "./convert-image-idea";
import { defaultConfig } from "../config/types";

describe("convertImageIdeaToEnglish", () => {
  it("returns empty for blank input", async () => {
    assert.equal(await convertImageIdeaToEnglish({ text: "   ", config: defaultConfig() }), null);
  });

  it("keeps latin imagery direction without calling the model", async () => {
    const out = await convertImageIdeaToEnglish({
      text: "harbour at dawn, calm water, soft morning light",
      config: defaultConfig(),
    });
    assert.equal(out, "harbour at dawn, calm water, soft morning light");
  });

  it("trims and caps length for latin input", async () => {
    const long = "a".repeat(120);
    const out = await convertImageIdeaToEnglish({ text: `  ${long}  `, config: defaultConfig() });
    assert.equal(out?.length, 80);
  });
});
