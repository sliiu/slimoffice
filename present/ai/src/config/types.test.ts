import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultConfig, parseConfig, parseCustomHeaders } from "./types.js";

describe("parseConfig", () => {
  it("fills defaults and never throws on junk", () => {
    const def = defaultConfig();
    assert.equal(def.text.provider, "openai");
    assert.equal(parseConfig({ text: { provider: "ollama", model: "llama" } }).text.provider, "ollama");
    assert.equal(parseConfig("nope").text.provider, "openai");
    assert.deepEqual(parseCustomHeaders('{"X-A":"1"}').headers, { "X-A": "1" });
    assert.ok(parseCustomHeaders("[1]").error);
  });
});
