import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultConfig } from "./types.js";
import {
  applyProxyUrl,
  clampImageGenConcurrency,
  clampTextRequestConcurrency,
  isConfigUsable,
} from "./presets.js";
import {
  IMAGE_GEN_CONCURRENCY_DEFAULT,
  IMAGE_GEN_CONCURRENCY_MAX,
  IMAGE_GEN_CONCURRENCY_MIN,
  TEXT_REQUEST_CONCURRENCY_DEFAULT,
  TEXT_REQUEST_CONCURRENCY_MAX,
  TEXT_REQUEST_CONCURRENCY_MIN,
} from "./types.js";

describe("ai config helpers", () => {
  it("clamps concurrency, prefixes proxy URLs, and rejects empty keys", () => {
    assert.equal(clampImageGenConcurrency(undefined), IMAGE_GEN_CONCURRENCY_DEFAULT);
    assert.equal(clampImageGenConcurrency(0), IMAGE_GEN_CONCURRENCY_MIN);
    assert.equal(clampImageGenConcurrency(99), IMAGE_GEN_CONCURRENCY_MAX);
    assert.equal(clampTextRequestConcurrency(undefined), TEXT_REQUEST_CONCURRENCY_DEFAULT);
    assert.equal(clampTextRequestConcurrency(0), TEXT_REQUEST_CONCURRENCY_MIN);
    assert.equal(clampTextRequestConcurrency(99), TEXT_REQUEST_CONCURRENCY_MAX);
    assert.equal(
      applyProxyUrl("https://api.openai.com/v1", "https://proxy.example/"),
      "https://proxy.example/https://api.openai.com/v1",
    );
    assert.equal(applyProxyUrl("https://api.openai.com/v1", "  "), "https://api.openai.com/v1");
    assert.equal(isConfigUsable(defaultConfig()), false);
  });
});
