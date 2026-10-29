import type { Plugin } from "./types.js";
/**
 * `definePlugin` —— 三个作用：
 *
 * 1. **类型推导**：让 TS 推出 `Plugin` 类型，避免插件 activate 形参为 `any`。
 * 2. **运行时校验**：检查 id / activate 必填。
 * 3. **浏览器自动注册**：如果当前在浏览器环境，会把插件压入
 *    `window.__PPTPlayerPluginQueue`；后续 `PPTPlayer.mount()` 会消费该队列。
 *    Node / SSR 环境下不会触发副作用，只是返回原对象。
 *
 * @example browser
 * ```js
 * import { definePlugin } from "@sliiu/present-plugin-sdk";
 *
 * definePlugin({
 *   id: "my-plugin",
 *   activate(ctx) {
 *     ctx.ui.addPanel({ title: "Hi", render: (b) => (b.textContent = "Hello") });
 *   },
 * });
 * ```
 *
 * @example node — 编写 / 测试插件
 * ```ts
 * import { definePlugin, createMockPluginContext } from "@sliiu/present-plugin-sdk";
 *
 * const myPlugin = definePlugin({
 *   id: "my-plugin",
 *   activate(ctx) {
 *     // 用 ctx 干活
 *   },
 * });
 *
 * // 单元测试
 * const ctx = createMockPluginContext({ slideCount: 3 });
 * await myPlugin.activate(ctx);
 * ```
 */
export declare function definePlugin(plugin: Plugin): Plugin;
/**
 * 把多个插件合成一个。activate 顺序按数组顺序，cleanup 顺序相反（LIFO）。
 * 适合把一组功能打包成一个可发布插件。
 */
export declare function composePlugins(id: string, plugins: Plugin[]): Plugin;
/**
 * 包装一个插件：activate 抛错时被吞掉，避免影响其它插件。常用于第三方插件。
 */
export declare function withErrorBoundary(plugin: Plugin): Plugin;
