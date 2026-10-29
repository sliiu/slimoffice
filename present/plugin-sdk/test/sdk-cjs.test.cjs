// 测试 CJS 包导出
const sdk = require("../dist/index.cjs");

const assert = require("node:assert");

assert.equal(sdk.SDK_VERSION, "0.1.0");
assert.equal(typeof sdk.definePlugin, "function");
assert.equal(typeof sdk.composePlugins, "function");
assert.equal(typeof sdk.withErrorBoundary, "function");
assert.equal(typeof sdk.createMockPluginContext, "function");

const ctx = sdk.createMockPluginContext({ slideCount: 2 });
assert.equal(ctx.presentation.slides.length, 2);

console.log("✅ CJS import works:", Object.keys(sdk).sort().join(", "));
