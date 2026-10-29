import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { buildMcpClientConfig } from "./remote";
import type { UserMcpConfig } from "./types";

const cfg: UserMcpConfig = {
  id: "user_test",
  name: "Test",
  transport: "http",
  url: "http://127.0.0.1:1/mcp",
  headers: { Authorization: "Bearer x" },
};

describe("buildMcpClientConfig", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("passes transport, url, headers and redirect=error through", () => {
    const c = buildMcpClientConfig(cfg);
    const t = c.transport as { type: string; url: string; headers?: Record<string, string>; redirect?: string };
    assert.equal(t.type, "http");
    assert.equal(t.url, cfg.url);
    assert.deepEqual(t.headers, { Authorization: "Bearer x" });
    assert.equal(t.redirect, "error");
  });

  it("omits headers when empty", () => {
    const c = buildMcpClientConfig({ ...cfg, headers: {} });
    assert.equal("headers" in (c.transport as object), false);
  });

  // 浏览器里 window.fetch 要求 this 为 window/undefined；@ai-sdk/mcp 以 this=transport 调用
  // 存下来的 fetch 会抛 "Illegal invocation"。这里用一个严格检查 this 的 fetch 模拟浏览器，
  // 断言我们传给 transport 的 fetch 即使被挂到别的对象上调用也不会把 this 泄漏给 window.fetch。
  it("supplies a fetch wrapper that never forwards a foreign `this` (browser Illegal invocation guard)", async () => {
    const seenThis: unknown[] = [];
    globalThis.fetch = function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
      seenThis.push(this);
      if (this !== undefined && this !== globalThis) {
        throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
      }
      return Promise.resolve(new Response(JSON.stringify({ input: String(input), method: init?.method ?? "GET" })));
    } as typeof fetch;

    const c = buildMcpClientConfig(cfg);
    const transportLike = { fetchFn: (c.transport as { fetch: typeof fetch }).fetch };
    assert.equal(typeof transportLike.fetchFn, "function");
    // 模拟 @ai-sdk/mcp：this.fetchFn(url, init)
    const res = await transportLike.fetchFn(cfg.url, { method: "POST" });
    assert.deepEqual(await res.json(), { input: cfg.url, method: "POST" });
    assert.equal(seenThis.length, 1);
    assert.ok(seenThis[0] === undefined || seenThis[0] === globalThis);
  });
});
