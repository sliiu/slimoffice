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
import path from "node:path";
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { envConfigStore } from "../../config/store.js";
import { createFileDeckStore } from "./file-store.js";
import { existsSync } from "node:fs";
import { createPptMcpServer, createPptMcpSession } from "./index.js";
function monorepoRoot(start) {
    let dir = start;
    for (let i = 0; i < 8; i++) {
        if (existsSync(path.join(dir, "pnpm-workspace.yaml")) && existsSync(path.join(dir, "packages/ai")))
            return dir;
        const parent = path.dirname(dir);
        if (parent === dir)
            return undefined;
        dir = parent;
    }
    return undefined;
}
/** Headless-Chromium slide renderer from the SlimPPT checkout, or undefined in the published package. */
function localSlideRenderer() {
    const repo = monorepoRoot(path.dirname(fileURLToPath(import.meta.url)));
    if (!repo)
        return undefined;
    const lib = path.join(repo, "scripts/lib/render-slides.mjs");
    if (!existsSync(lib) || !existsSync(path.join(repo, "packages/player/dist/player.iife.js")))
        return undefined;
    let opened;
    process.once("exit", () => void opened?.then((r) => r.close()));
    return async (pres, slideIdx, opts) => {
        opened ??= import(lib).then((m) => m.openSlideRenderer());
        const [shot] = await (await opened).render(pres, { width: opts.width, pages: [slideIdx] });
        if (!shot)
            throw new Error(`slide ${slideIdx} did not render`);
        return shot.data;
    };
}
export async function serveLocalPptx(rootDir) {
    const root = path.resolve(rootDir?.trim() || process.env.SLIMPPT_ROOT?.trim() || process.cwd());
    const renderSlide = localSlideRenderer();
    const server = createPptMcpServer({
        decks: createFileDeckStore(root),
        session: createPptMcpSession(),
        getConfig: () => envConfigStore().load(),
        enableGenerate: true,
        ...(renderSlide ? { renderSlide } : {}),
        serverInfo: { name: "slimppt-local", version: "2.0.0" },
    });
    const transport = new StdioServerTransport();
    await server.connect(transport);
    const repo = monorepoRoot(path.dirname(fileURLToPath(import.meta.url)));
    const renderNote = renderSlide ? "" : repo ? " (render_slide off: build packages/player first)" : " (render_slide off)";
    console.error(`[slimppt-local] stdio MCP ready, folder ${root}${renderNote}`);
}
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
    serveLocalPptx().catch((err) => {
        console.error("[slimppt-local]", err instanceof Error ? err.message : err);
        process.exitCode = 1;
    });
}
