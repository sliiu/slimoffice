// @sliiu/present-plugin-sdk —— PPT 播放器插件 SDK
//
// 零运行时依赖，可在浏览器（ESM/IIFE）和 Node（ESM/CJS）使用。
//
// 提供：
//   - 完整的 Plugin / PluginContext 类型
//   - definePlugin / composePlugins / withErrorBoundary 辅助
//   - createMockPluginContext —— Node 中单元测试插件用的桩
//
// 不提供：
//   - 任何 PPT 渲染、动画运行时（那是 @sliiu/present-player 的事）
//   - 任何对 OOXML 内部结构的直接访问（保证 ABI 稳定）
export * from "./types.js";
export { definePlugin, composePlugins, withErrorBoundary } from "./define.js";
export { createMockPluginContext } from "./testing.js";
// SDK 版本号，方便检测使用了哪个版本。
// 0.2.0：新增 `ctx.scene`（shape 模型查询/命中测试/显隐/触发动画）与
//        `ctx.player.setNavigationLocked()`（交互期间锁定内置翻页/触发）。
export const SDK_VERSION = "0.3.0";
