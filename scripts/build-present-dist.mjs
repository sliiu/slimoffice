import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const tsc = join(process.cwd(), "node_modules/typescript/lib/tsc.js");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

function compile(dir, options) {
  const configPath = resolve(dir, "tsconfig.present.json");
  writeFileSync(
    configPath,
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: options.module,
          moduleResolution: "Bundler",
          lib: ["ES2022", "DOM", "DOM.Iterable"],
          strict: true,
          noUncheckedIndexedAccess: true,
          esModuleInterop: true,
          resolveJsonModule: true,
          isolatedModules: true,
          skipLibCheck: true,
          useDefineForClassFields: true,
          types: ["node"],
          noEmit: false,
          declaration: options.declaration,
          declarationMap: false,
          sourceMap: false,
          outDir: options.outDir,
          ...(options.declarationDir ? { declarationDir: options.declarationDir } : {}),
          rootDir: "src",
        },
        include: ["src/**/*"],
        exclude: ["src/**/*.test.ts", "src/**/*.test.tsx", "dist"],
      },
      null,
      2,
    ),
  );
  const args = [tsc, "-p", configPath, "--pretty", "false"];
  if (options.noCheck) args.push("--noCheck");
  const result = spawnSync(process.execPath, args, {
    cwd: dir,
    encoding: "utf8",
  });
  rmSync(configPath, { force: true });
  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
    process.exit(result.status || 1);
  }
}

function specifier(fromFile, spec, ext) {
  if (/\.(js|mjs|cjs|json|css|node)$/.test(spec)) return spec;
  const base = join(dirname(fromFile), spec);
  if (existsSync(base + ext) && statSync(base + ext).isFile()) return spec + ext;
  if (existsSync(join(base, `index${ext}`))) return `${spec}/index${ext}`;
  return spec + ext;
}

function rewriteRelative(code, fromFile, ext) {
  const apply = (spec) => specifier(fromFile, spec, ext);
  const quoted = (q, spec, dynamic) => {
    const next = apply(spec);
    if (!next.endsWith(".json")) return `${q}${next}${q}`;
    return dynamic ? `${q}${next}${q}, { with: { type: "json" } }` : `${q}${next}${q} with { type: "json" }`;
  };
  return code
    .replace(/(from\s+)(["'])(\.[^"']+)\2/g, (_, lead, q, spec) => `${lead}${quoted(q, spec, false)}`)
    .replace(/(import\s*\(\s*)(["'])(\.[^"']+)\2/g, (_, lead, q, spec) => `${lead}${quoted(q, spec, true)}`);
}

function rewritePackageSpecifiers(code) {
  return code
    .replaceAll("@ppt/", "@sliiu/present-")
    .replaceAll("@document/", "@sliiu/document-")
    .replaceAll("@sheet/", "@sliiu/sheet-");
}

// tsc 用 module:CommonJS 时拒绝 import.meta。ESM 产物先编完，再把源码里的
// import.meta.url 换成 __filename，编完 CJS 后把源码改回去。公开仓库里的 .ts 仍是原来的写法。
const CJS_IMPORT_META_URL = `(require("node:url").pathToFileURL(__filename).href)`;

function rewriteImportMeta(dir, nextFor) {
  const saved = [];
  for (const file of walk(join(dir, "src"))) {
    if (!file.endsWith(".ts")) continue;
    const text = readFileSync(file, "utf8");
    if (!text.includes("import.meta.url")) continue;
    saved.push([file, text]);
    writeFileSync(file, text.replaceAll("import.meta.url", nextFor));
  }
  return saved;
}

function buildPlayerIife(dir) {
  const pkgPath = join(dir, "package.json");
  if (!existsSync(pkgPath) || !existsSync(join(dir, "vite.config.ts"))) return;
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  if (pkg.name !== "@sliiu/present-player") return;
  // pnpm does not hoist vite to the workspace root, and vite does not export ./bin.
  // Resolve the package, then follow its bin field.
  const vitePkg = createRequire(join(dir, "package.json")).resolve("vite/package.json");
  const viteBin = JSON.parse(readFileSync(vitePkg, "utf8")).bin;
  const vite = join(dirname(vitePkg), typeof viteBin === "string" ? viteBin : viteBin.vite);
  const result = spawnSync(process.execPath, [vite, "build"], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, PRESENT_KEEP_DIST: "1" },
  });
  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
    process.exit(result.status || 1);
  }
  if (!existsSync(join(dir, "dist/player.iife.js"))) {
    console.error("player iife was not written to dist/player.iife.js");
    process.exit(1);
  }
}

export function buildPresentDist(dir) {
  rmSync(join(dir, "dist"), { recursive: true, force: true });
  compile(dir, {
    module: "ESNext",
    declaration: true,
    outDir: "dist/esm",
    declarationDir: "dist/types",
  });
  const saved = rewriteImportMeta(dir, CJS_IMPORT_META_URL);
  try {
    compile(dir, {
      module: "CommonJS",
      declaration: false,
      outDir: "dist/cjs",
      noCheck: true,
    });
  } finally {
    for (const [file, text] of saved) writeFileSync(file, text);
  }
  writeFileSync(join(dir, "dist/cjs/package.json"), '{"type":"commonjs"}\n');
  for (const file of walk(join(dir, "dist/esm"))) {
    if (!file.endsWith(".js")) continue;
    writeFileSync(file, rewriteRelative(readFileSync(file, "utf8"), file, ".js"));
  }
  for (const file of walk(join(dir, "dist/types"))) {
    if (!file.endsWith(".d.ts")) continue;
    const rewritten = rewriteRelative(readFileSync(file, "utf8"), file, ".d.ts").replaceAll(
      ".d.ts",
      ".js",
    );
    writeFileSync(file, rewritten);
  }
  for (const file of walk(join(dir, "dist"))) {
    if (!/\.(js|d\.ts|cjs)$/.test(file)) continue;
    const text = readFileSync(file, "utf8");
    const next = rewritePackageSpecifiers(text);
    if (next !== text) writeFileSync(file, next);
  }
  buildPlayerIife(dir);
}

function sourceOf(value) {
  if (typeof value === "string") return value.endsWith(".ts") ? value : null;
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      if (typeof item === "string" && item.endsWith(".ts")) return item;
    }
  }
  return null;
}

export function distExports(exportsMap) {
  const next = {};
  for (const [key, value] of Object.entries(exportsMap ?? {})) {
    if (key === "./dist/*") continue;
    const source = sourceOf(value);
    if (!source) {
      next[key] = value;
      continue;
    }
    const rel = source.replace(/^\.\//, "").replace(/^src\//, "").replace(/\.ts$/, "");
    next[key] = {
      types: `./dist/types/${rel}.d.ts`,
      import: `./dist/esm/${rel}.js`,
      require: `./dist/cjs/${rel}.js`,
    };
  }
  return next;
}

if (process.argv[1] && process.argv[1].endsWith("build-present-dist.mjs")) {
  const dir = process.argv[2];
  if (!dir) {
    console.error("missing package dir");
    process.exit(1);
  }
  buildPresentDist(dir);
  console.log(relative(process.cwd(), dir));
}
