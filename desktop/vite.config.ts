import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));

function resolveFromPaddleocr(id: string): string {
  const paddleRoot = fs.realpathSync(
    path.resolve(here, "node_modules/@sliiu/present-editor/node_modules/@paddleocr/paddleocr-js"),
  );
  return createRequire(path.join(paddleRoot, "dist/index.mjs")).resolve(id);
}

function stubPaddleocrWorker(): Plugin {
  return {
    name: "stub-paddleocr-worker",
    enforce: "pre",
    transform(code, id) {
      if (!id.includes("@paddleocr/paddleocr-js")) return null;
      if (!code.includes("worker-entry") || !code.includes("import.meta.url")) return null;
      return {
        code: code.replace(
          /new URL\((["'])[^"']*worker-entry[^"']*\1\s*,\s*import\.meta\.url\)/g,
          "null",
        ),
        map: null,
      };
    },
  };
}

function omitOrtWasm(): Plugin {
  return {
    name: "omit-ort-wasm",
    generateBundle(_opts, bundle) {
      for (const fileName of Object.keys(bundle)) {
        if (/(?:^|\/)ort-wasm[^/]*\.wasm$/i.test(fileName) || /(?:^|\/)worker-entry-[^/]+\.js$/i.test(fileName)) {
          delete bundle[fileName];
        }
      }
    },
  };
}

function cjsDefaultExport(ids: readonly string[]): Plugin {
  const prefix = "\0cjs-default:";
  const idSet = new Set(ids);
  return {
    name: "cjs-default-export",
    enforce: "pre",
    resolveId(id) {
      if (idSet.has(id)) return prefix + id;
    },
    load(id) {
      if (!id.startsWith(prefix)) return;
      const pkg = id.slice(prefix.length);
      const file = resolveFromPaddleocr(pkg);
      const src = fs.readFileSync(file, "utf8");
      return `
const module = { exports: {} };
new Function("module", "exports", ${JSON.stringify(src)})(module, module.exports);
export default module.exports;
`;
    },
  };
}

export default defineConfig({
  root: here,
  base: "./",
  plugins: [stubPaddleocrWorker(), cjsDefaultExport(["clipper-lib", "@techstark/opencv-js"]), omitOrtWasm()],
  resolve: {
    conditions: ["onnxruntime-web-use-extern-wasm", "module", "browser", "import", "development", "production"],
  },
  optimizeDeps: {
    exclude: ["@paddleocr/paddleocr-js", "clipper-lib", "@techstark/opencv-js", "onnxruntime-web", "@ffmpeg/ffmpeg", "@ffmpeg/util"],
  },
  assetsInclude: ["**/*.wasm"],
  worker: { format: "es" },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 8000,
  },
  server: {
    port: 5174,
    strictPort: true,
    fs: { allow: [here] },
  },
});
