import { defineConfig } from "vite";
import { resolve } from "node:path";

// 多格式输出：
//   - ESM (dist/index.js) — 浏览器 import / Node ESM
//   - CJS (dist/index.cjs) — Node CJS require
//   - IIFE (dist/plugin-sdk.iife.js) — 浏览器 <script>，全局 window.PPTPluginSDK
//
// SDK 是纯类型 + 极小运行时（definePlugin / composePlugins / 测试桩），
// gzipped 应小于 2 KB；不内联任何 player/core/renderer 代码。
export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "PPTPluginSDK",
      formats: ["es", "cjs", "iife"],
      fileName: (format) => {
        if (format === "iife") return "plugin-sdk.iife.js";
        if (format === "cjs") return "index.cjs";
        return "index.js";
      },
    },
    minify: "esbuild",
    sourcemap: true,
    emptyOutDir: true,
    target: "es2020",
    rollupOptions: {
      // SDK 没有外部依赖；保留默认行为即可。
    },
  },
});
