// 验证 @ppt/plugin-sdk 可在纯 Node 环境（无 window / 无 DOM）正常使用。
// 用法：node --import tsx packages/plugin-sdk/test/sdk-node.test.mjs

import assert from "node:assert";
import {
  definePlugin,
  composePlugins,
  withErrorBoundary,
  createMockPluginContext,
  SDK_VERSION,
} from "../src/index.ts";

console.log("SDK_VERSION:", SDK_VERSION);

// 1) definePlugin 校验
assert.throws(() => definePlugin(null), /plugin must be an object/);
assert.throws(() => definePlugin({}), /plugin.id is required/);
assert.throws(() => definePlugin({ id: "x" }), /must implement activate/);

const p1 = definePlugin({
  id: "p1",
  activate(ctx) {
    ctx.log("hello from p1");
  },
});
assert.equal(p1.id, "p1");

// 2) Node 下 window 应为 undefined，definePlugin 不应抛错也不应有副作用
assert.equal(typeof globalThis.window, "undefined");

// 3) createMockPluginContext 测试 ctx 接口完备
const ctx = createMockPluginContext({ slideCount: 5, title: "Test Deck" });
assert.equal(ctx.presentation.slides.length, 5);
assert.equal(ctx.presentation.title, "Test Deck");
assert.equal(ctx.player.current(), 0);

// 模拟激活 plugin
await p1.activate(ctx);

// 4) 控制 API 调用历史
ctx.player.next();
ctx.player.next();
ctx.player.goto(0);
assert.equal(ctx.calls.next, 2);
assert.deepEqual(ctx.calls.goto, [0]);
assert.equal(ctx.player.current(), 0);

// 5) 事件订阅
let slideChanges = 0;
const off = ctx.events.on("slidechange", (e) => {
  console.log("  slide ->", e.visibleIndex, e.slide.name);
  slideChanges++;
});
ctx.fireSlideChange(2);
ctx.fireSlideChange(3);
off();
ctx.fireSlideChange(4);
assert.equal(slideChanges, 2, "after off() no more events should fire");

// 6) stepchange
let lastStep = null;
ctx.events.on("stepchange", (e) => { lastStep = e; });
ctx.fireStepChange(2, 5);
assert.equal(lastStep.currentStep, 2);
assert.equal(lastStep.totalSteps, 5);

// 7) composePlugins
let order = [];
const composed = composePlugins("group", [
  { id: "a", activate: () => { order.push("a"); return () => order.push("a-cleanup"); } },
  { id: "b", activate: () => { order.push("b"); return () => order.push("b-cleanup"); } },
]);
const ctx2 = createMockPluginContext({ slideCount: 1 });
const cleanup = await composed.activate(ctx2);
assert.deepEqual(order, ["a", "b"]);
cleanup();
assert.deepEqual(order, ["a", "b", "b-cleanup", "a-cleanup"], "LIFO cleanup");

// 8) withErrorBoundary 吞错
const bad = withErrorBoundary({
  id: "bad",
  activate: () => { throw new Error("boom"); },
});
// 应该不抛错（console.error 会被打出来）
const consoleErrors = [];
const origErr = console.error;
console.error = (...a) => consoleErrors.push(a.join(" "));
try {
  await bad.activate(createMockPluginContext({ slideCount: 1 }));
} finally {
  console.error = origErr;
}
assert.ok(consoleErrors.some((s) => /boom/.test(s)), "error should be reported");

console.log("\n✅ All SDK Node tests passed.");
