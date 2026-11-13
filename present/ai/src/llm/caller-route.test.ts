import assert from "node:assert/strict";
import { test } from "node:test";
import { setSystemImageRoute, setSystemTextRoute, systemImageRoute, systemTextRoute } from "./caller-route";

test("text route uses the caller fetch and does not add cookies itself", () => {
  const seen: RequestInit[] = [];
  const fetchImpl: typeof fetch = (_input, init) => {
    seen.push(init ?? {});
    return Promise.resolve(new Response());
  };
  setSystemTextRoute({ model: "auto", baseURL: "https://example.test/v1/", fetchImpl });
  const route = systemTextRoute();
  assert.equal(route?.baseURL, "https://example.test/v1");
  assert.equal(route?.fetchImpl, fetchImpl);
  void route?.fetchImpl("https://example.test/v1/chat", { method: "POST" });
  assert.equal(seen[0]?.credentials, undefined);
  setSystemTextRoute(null);
  assert.equal(systemTextRoute(), null);
});

test("image route keeps the caller fetch", () => {
  const fetchImpl: typeof fetch = () => Promise.resolve(new Response());
  setSystemImageRoute({ model: "auto", endpoint: "https://example.test/images", fetchImpl });
  assert.equal(systemImageRoute()?.fetchImpl, fetchImpl);
  setSystemImageRoute(null);
});
