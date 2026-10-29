"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.definePlugin = definePlugin;
exports.composePlugins = composePlugins;
exports.withErrorBoundary = withErrorBoundary;
const GLOBAL_QUEUE_KEY = "__PPTPlayerPluginQueue";
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
function definePlugin(plugin) {
    if (!plugin || typeof plugin !== "object") {
        throw new TypeError("definePlugin: plugin must be an object");
    }
    if (typeof plugin.id !== "string" || plugin.id.length === 0) {
        throw new TypeError("definePlugin: plugin.id is required");
    }
    if (typeof plugin.activate !== "function") {
        throw new TypeError(`definePlugin: plugin '${plugin.id}' must implement activate()`);
    }
    // 仅在浏览器环境注册到全局队列。"是否在浏览器"通过 globalThis.window 判断 —
    // SSR / Node / Workers 下 window 为 undefined，此时只返回 plugin 不触发副作用。
    const g = globalThis;
    if (g.window && typeof g.window === "object") {
        if (!g.window[GLOBAL_QUEUE_KEY])
            g.window[GLOBAL_QUEUE_KEY] = [];
        g.window[GLOBAL_QUEUE_KEY].push(plugin);
    }
    return plugin;
}
/**
 * 把多个插件合成一个。activate 顺序按数组顺序，cleanup 顺序相反（LIFO）。
 * 适合把一组功能打包成一个可发布插件。
 */
function composePlugins(id, plugins) {
    return {
        id,
        name: `composed:${id}`,
        activate: async (ctx) => {
            const cleanups = [];
            for (const p of plugins) {
                try {
                    const ret = await p.activate(ctx);
                    if (typeof ret === "function")
                        cleanups.push(ret);
                }
                catch (e) {
                    // 单个子插件失败不中断其它子插件。
                    console.error(`[plugin:${id}] sub-plugin '${p.id}' activate threw`, e);
                }
            }
            return () => {
                for (let i = cleanups.length - 1; i >= 0; i--) {
                    try {
                        cleanups[i]();
                    }
                    catch (e) {
                        console.error(`[plugin:${id}] cleanup threw`, e);
                    }
                }
            };
        },
    };
}
/**
 * 包装一个插件：activate 抛错时被吞掉，避免影响其它插件。常用于第三方插件。
 */
function withErrorBoundary(plugin) {
    return {
        ...plugin,
        activate: async (ctx) => {
            try {
                return await plugin.activate(ctx);
            }
            catch (e) {
                console.error(`[plugin:${plugin.id}] activate threw (suppressed)`, e);
                return undefined;
            }
        },
    };
}
