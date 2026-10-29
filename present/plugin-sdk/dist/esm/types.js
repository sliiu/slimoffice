// @sliiu/present-plugin-sdk —— 类型定义
//
// 这些类型是 SDK 与 player 之间的契约。player 直接复用这些类型，确保 SDK
// 用户写的插件 100% 与 player 运行时兼容。
//
// 关键设计：
//   - 完全不依赖任何 @sliiu/present-core / animation / renderer 的内部类型。
//   - 用 SDK 自己声明的、稳定的"扁平快照"类型，让插件作者不需要懂 OOXML 内部。
export {};
