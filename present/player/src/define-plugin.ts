// 历史 re-export。`definePlugin` 实际定义在 @ppt/plugin-sdk；这里只是为了让
// `import { definePlugin } from "@ppt/player"` 仍然有效（向后兼容）。
//
// 推荐新代码改从 @ppt/plugin-sdk 直接 import —— SDK 无运行时依赖、bundle 更小、
// 可在 Node 中使用。

export { definePlugin, composePlugins, withErrorBoundary } from "@ppt/plugin-sdk";
