import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultConfig, parseConfig } from "./types.js";
import {
  applyProxyUrl,
  clampImageGenConcurrency,
  clampTextRequestConcurrency,
  isConfigUsable,
  reviewTextConfig,
  visionReviewTextConfig,
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

describe("vision review config", () => {
  const deepseek = { provider: "deepseek", model: "deepseek-chat", apiKey: "sk-ds" };

  it("is unset when no review model is configured", () => {
    const c = parseConfig({ text: deepseek });
    assert.equal(reviewTextConfig(c), undefined);
    // a text-only model gets no screenshots
    assert.equal(visionReviewTextConfig(c), undefined);
  });

  it("uses a vision-capable text model when no review model is set", () => {
    const c = parseConfig({ text: { provider: "anthropic", model: "claude-sonnet-5-5", apiKey: "sk-a" } });
    assert.equal(visionReviewTextConfig(c), c.text);
  });

  it("recognises vision models behind an OpenAI-compatible gateway by name", () => {
    const gw = (model: string) => parseConfig({ text: { provider: "openai", model, apiKey: "k", baseURL: "http://127.0.0.1:3425/v1" } });
    assert.equal(visionReviewTextConfig(gw("cursor/grok-4.7@500k"))?.model, "cursor/grok-4.7@500k");
    assert.ok(visionReviewTextConfig(gw("moonshot-cn/kimi-k3.1-pro")));
    assert.equal(visionReviewTextConfig(gw("deepseek-chat")), undefined);
    // the official endpoint keeps its own list
    assert.equal(visionReviewTextConfig(parseConfig({ text: { provider: "openai", model: "grok-4", apiKey: "k" } })), undefined);
  });

  it("prefers a configured review model that can see, with its own key", () => {
    const c = parseConfig({ text: deepseek, review: { provider: "google", model: "gemini-2.5-flash", apiKey: "g-key" } });
    const r = visionReviewTextConfig(c);
    assert.equal(r?.provider, "google");
    assert.equal(r?.model, "gemini-2.5-flash");
    assert.equal(r?.apiKey, "g-key");
    assert.notEqual(r?.baseURL, "");
  });

  it("borrows the text key only on the same provider, and skips a review model without a key", () => {
    const same = parseConfig({ text: { provider: "openai", model: "gpt-4o-mini", apiKey: "sk-o" }, review: { model: "gpt-4o" } });
    assert.equal(reviewTextConfig(same)?.apiKey, "sk-o");
    const other = parseConfig({ text: deepseek, review: { provider: "google", model: "gemini-2.5-flash" } });
    assert.equal(reviewTextConfig(other)?.apiKey, "");
    assert.equal(visionReviewTextConfig(other), undefined);
  });

  it("skips a review model that cannot see", () => {
    const c = parseConfig({ text: deepseek, review: { provider: "deepseek", model: "deepseek-reasoner" } });
    assert.equal(visionReviewTextConfig(c), undefined);
  });
});
