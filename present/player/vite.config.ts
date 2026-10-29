import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/iife.ts"),
      name: "PPTPlayer",
      formats: ["iife"],
      fileName: () => "player.iife.js",
    },
    minify: "esbuild",
    sourcemap: false,
    emptyOutDir: true,
    target: "es2020",
  },
});
