"use strict";
// 本地 stdio MCP。工具集与网关 /api/mcp 相同（createPptMcpServer）。
// 文稿在 SLIMPPT_ROOT（缺省为当前目录）这一层。保存写回 .pptx。
// 任意路径也可以 open_pptx → 编辑 → screenshot_slide → save_pptx。
//
//   SLIMPPT_ROOT=/path/to/decks pnpm exec tsx packages/ai/src/mcp/server/stdio.ts
//
// stdout 只留给 MCP。日志走 stderr。
//
// 本地额外开两样网关没有的工具：
//   - generate_presentation：用本机 AI 配置（AI_API_KEY 等）整份生成，花的是用户自己的额度。
//   - render_slide：无头 Chromium 截一页给 Agent 看。需要仓库里的 player 构建
//     （pnpm --filter @sliiu/present-player build）和 playwright 的 Chromium；缺了就不注册这个工具。
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.serveLocalPptx = serveLocalPptx;
const node_path_1 = __importDefault(require("node:path"));
const node_url_1 = require("node:url");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const store_1 = require("../../config/store");
const file_store_1 = require("./file-store");
const node_fs_1 = require("node:fs");
const index_1 = require("./index");
function monorepoRoot(start) {
    let dir = start;
    for (let i = 0; i < 8; i++) {
        if ((0, node_fs_1.existsSync)(node_path_1.default.join(dir, "pnpm-workspace.yaml")) && (0, node_fs_1.existsSync)(node_path_1.default.join(dir, "packages/ai")))
            return dir;
        const parent = node_path_1.default.dirname(dir);
        if (parent === dir)
            return undefined;
        dir = parent;
    }
    return undefined;
}
/** Headless-Chromium slide renderer from the SlimPPT checkout, or undefined in the published package. */
function localSlideRenderer() {
    const repo = monorepoRoot(node_path_1.default.dirname((0, node_url_1.fileURLToPath)((require("node:url").pathToFileURL(__filename).href))));
    if (!repo)
        return undefined;
    const lib = node_path_1.default.join(repo, "scripts/lib/render-slides.mjs");
    if (!(0, node_fs_1.existsSync)(lib) || !(0, node_fs_1.existsSync)(node_path_1.default.join(repo, "packages/player/dist/player.iife.js")))
        return undefined;
    let opened;
    process.once("exit", () => void opened?.then((r) => r.close()));
    return async (pres, slideIdx, opts) => {
        opened ??= Promise.resolve(`${lib}`).then(s => __importStar(require(s))).then((m) => m.openSlideRenderer());
        const [shot] = await (await opened).render(pres, { width: opts.width, pages: [slideIdx] });
        if (!shot)
            throw new Error(`slide ${slideIdx} did not render`);
        return shot.data;
    };
}
async function serveLocalPptx(rootDir) {
    const root = node_path_1.default.resolve(rootDir?.trim() || process.env.SLIMPPT_ROOT?.trim() || process.cwd());
    const renderSlide = localSlideRenderer();
    const server = (0, index_1.createPptMcpServer)({
        decks: (0, file_store_1.createFileDeckStore)(root),
        session: (0, index_1.createPptMcpSession)(),
        getConfig: () => (0, store_1.envConfigStore)().load(),
        enableGenerate: true,
        ...(renderSlide ? { renderSlide } : {}),
        serverInfo: { name: "slimppt-local", version: "2.0.0" },
    });
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
    const repo = monorepoRoot(node_path_1.default.dirname((0, node_url_1.fileURLToPath)((require("node:url").pathToFileURL(__filename).href))));
    const renderNote = renderSlide ? "" : repo ? " (render_slide off: build packages/player first)" : " (render_slide off)";
    console.error(`[slimppt-local] stdio MCP ready, folder ${root}${renderNote}`);
}
const isDirectRun = process.argv[1] && node_path_1.default.resolve(process.argv[1]) === (0, node_url_1.fileURLToPath)((require("node:url").pathToFileURL(__filename).href));
if (isDirectRun) {
    serveLocalPptx().catch((err) => {
        console.error("[slimppt-local]", err instanceof Error ? err.message : err);
        process.exitCode = 1;
    });
}
