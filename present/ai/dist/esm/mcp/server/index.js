// MCP server（对外方向，Node-only）：把 PPT 编辑能力暴露给外部 Agent
//（Cursor / Claude / 任何 MCP 客户端）。
//
// 架构：
//   - 工具集 = tools/ 的 ToolDef 全集（与浏览器对话共用同一套定义）+ 会话工具
//     （list/open/save/close presentation）。
//   - 文档通道 = createHeadlessPort：deck 由宿主 DeckStore 载入内存，编辑经
//     EditCommand 命令栈执行，save 时由宿主写回（gateway 场景 = 加密后写云存储）。
//   - 无状态传输友好：McpServer 实例可每请求新建（Streamable HTTP stateless
//     模式），"当前打开的 deck"存在宿主注入的 PptMcpSession 里（gateway 按
//     用户持有 + 空闲 TTL），与 server 实例生命周期解耦。
//
// 不暴露 capability 工具（list_capabilities 等）——那是浏览器宿主的能力管理心智；
// 外部 Agent 的能力发现走 MCP 协议本身的 tools/list。
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { composeContactSheet, SCREENSHOT_SHEET_LIMIT, screenshotSlidesViaBrowser, } from "@sliiu/present-player/browser-screenshot";
import { createHeadlessPort } from "../../kernel/port.js";
import { buildEditToolDefs } from "../../tools/index.js";
import { createToolRuntime } from "../../tools/types.js";
import { defaultConfig } from "../../config/types.js";
import { isConfigUsable } from "../../config/presets.js";
import { generateFromOutline, generateOutline } from "../../generate/index.js";
import { readPptxFile, writePptxFile } from "./file-pptx.js";
import { PRESENT_AGENT_INSTRUCTIONS } from "./workflow.js";
export function createPptMcpSession() {
    return { deckId: null, filePath: null, port: null, dirty: false, lastActiveAt: Date.now() };
}
function toBase64(bytes) {
    return Buffer.from(bytes).toString("base64");
}
function imageResult(text, slides) {
    return {
        content: [
            { type: "text", text },
            ...slides.map((s) => ({ type: "image", data: s.pngBase64, mimeType: "image/png" })),
        ],
    };
}
function promoteSlideImages(result) {
    const slides = result && typeof result === "object" ? result.slides : undefined;
    if (!Array.isArray(slides) || !slides.some((s) => typeof s?.pngBase64 === "string"))
        return null;
    const brief = {
        ...result,
        slides: slides.map((s) => ({ slideIdx: s.slideIdx, bytes: typeof s.pngBase64 === "string" ? s.pngBase64.length : 0 })),
    };
    return {
        content: [
            { type: "text", text: JSON.stringify(brief, null, 2) },
            ...slides
                .filter((s) => typeof s?.pngBase64 === "string")
                .map((s) => ({ type: "image", data: s.pngBase64, mimeType: "image/png" })),
        ],
    };
}
function loadBundledPlayerScript() {
    const req = createRequire(import.meta.url);
    try {
        return readFileSync(req.resolve("@sliiu/present-player/iife"), "utf8");
    }
    catch {
        throw new Error("Player bundle is missing. Build @sliiu/present-player so dist/player.iife.js exists.");
    }
}
function jsonResult(v) {
    const isErr = !!v && typeof v === "object" && v.ok === false;
    return {
        content: [{ type: "text", text: typeof v === "string" ? v : JSON.stringify(v, null, 2) }],
        ...(isErr ? { isError: true } : {}),
    };
}
/** 从 ToolDef 的 z.object schema 取 raw shape（MCP SDK registerTool 需要）。 */
function rawShapeOf(def) {
    const schema = def.inputSchema;
    if (schema instanceof z.ZodObject) {
        return schema.shape;
    }
    // 理论上不会走到：所有 ToolDef 的顶层 schema 都是 z.object。
    return {};
}
export function createPptMcpServer(opts) {
    const { decks, session } = opts;
    const getConfig = opts.getConfig ?? (() => defaultConfig());
    const server = new McpServer({
        name: opts.serverInfo?.name ?? "slimppt",
        version: opts.serverInfo?.version ?? "2.0.0",
    }, { instructions: PRESENT_AGENT_INSTRUCTIONS });
    const touch = () => {
        session.lastActiveAt = Date.now();
    };
    // ---- 会话工具 -------------------------------------------------------------
    server.registerTool("list_presentations", {
        description: "List the user's cloud presentations (deckId, name, slideCount). Call this first, then open_presentation with a deckId.",
        inputSchema: {},
        annotations: { readOnlyHint: true },
    }, async () => {
        touch();
        try {
            const items = await decks.list();
            return jsonResult({ ok: true, count: items.length, decks: items });
        }
        catch (e) {
            return jsonResult({ ok: false, error: e.message });
        }
    });
    server.registerTool("open_presentation", {
        description: "Open a cloud presentation for editing (loads it into this session). All edit tools operate on the currently open presentation. Unsaved changes of a previously open deck are discarded — call save_presentation first if needed.",
        inputSchema: {
            deckId: z.string().min(1).describe("Deck id from list_presentations."),
        },
    }, async ({ deckId }) => {
        touch();
        try {
            const pres = await decks.load(deckId);
            session.deckId = deckId;
            session.filePath = null;
            session.port = createHeadlessPort(pres);
            session.dirty = false;
            return jsonResult({
                ok: true,
                deckId,
                slideCount: pres.slides.length,
                size: pres.size,
                themeId: pres.theme?.id,
                note: "Presentation loaded. Use getPresentationSummary to inspect, then edit tools. Call save_presentation to persist changes.",
            });
        }
        catch (e) {
            return jsonResult({ ok: false, error: `open failed: ${e.message}` });
        }
    });
    server.registerTool("save_presentation", {
        description: "Persist the currently open presentation back to cloud storage. Call after finishing your edits.",
        inputSchema: {},
    }, async () => {
        touch();
        if (!session.deckId || !session.port) {
            return jsonResult({ ok: false, error: "No presentation open. Call open_pptx or open_presentation first." });
        }
        try {
            if (session.filePath) {
                await writePptxFile(session.filePath, session.port.getPres());
            }
            else {
                await decks.save(session.deckId, session.port.getPres());
            }
            session.dirty = false;
            return jsonResult({ ok: true, deckId: session.deckId, saved: true });
        }
        catch (e) {
            return jsonResult({ ok: false, error: `save failed: ${e.message}` });
        }
    });
    server.registerTool("close_presentation", {
        description: "Close the currently open presentation WITHOUT saving (discards unsaved changes). Use save_presentation first to persist.",
        inputSchema: {},
    }, async () => {
        touch();
        const had = session.deckId;
        session.deckId = null;
        session.filePath = null;
        session.port = null;
        session.dirty = false;
        return jsonResult({ ok: true, closed: had ?? null });
    });
    // ---- 看效果 / 整份生成 ------------------------------------------------------
    const renderSlide = opts.renderSlide;
    if (renderSlide) {
        server.registerTool("render_slide", {
            description: "Render one slide of the open presentation to a PNG and return the image. Use it after edits to check the result the way a viewer sees it: overlap, empty areas, stranded words, contrast. Edit, render, look, fix.",
            inputSchema: {
                slideIdx: z.number().int().min(0).describe("0-based slide index."),
                width: z.number().int().min(320).max(1920).optional().describe("Output width in px (default 960)."),
            },
            annotations: { readOnlyHint: true },
        }, async ({ slideIdx, width }) => {
            touch();
            if (!session.port)
                return jsonResult({ ok: false, error: "No presentation open. Call open_presentation first." });
            const pres = session.port.getPres();
            if (slideIdx >= pres.slides.length)
                return jsonResult({ ok: false, error: `slideIdx ${slideIdx} out of range (0–${pres.slides.length - 1}).` });
            try {
                const png = await renderSlide(pres, slideIdx, { width: width ?? 960 });
                return {
                    content: [
                        { type: "image", data: toBase64(png), mimeType: "image/png" },
                        { type: "text", text: `slide ${slideIdx} of ${pres.slides.length}` },
                    ],
                };
            }
            catch (e) {
                return jsonResult({ ok: false, error: `render failed: ${e.message}` });
            }
        });
    }
    if (opts.enableGenerate) {
        server.registerTool("generate_presentation", {
            description: "Generate a complete designed presentation from a topic with SlimPPT's own pipeline (outline → research → per-page layout → layout gates → repair → visual review), and open it in this session as a new deck. Prefer this over building a deck shape by shape. Takes one to a few minutes. Then inspect with getPresentationSummary / render_slide, refine with edit tools, and call save_presentation to write it.",
            inputSchema: {
                topic: z.string().min(2).describe("What the deck is about."),
                deckId: z.string().min(1).describe("Id for the new deck. For a local folder, a new file name such as \"talk.pptx\"."),
                slideCount: z.number().int().min(3).max(30).optional().describe("Target number of slides (default 8)."),
                language: z.string().optional().describe("Deck language, e.g. zh-CN or en."),
                audience: z.string().optional(),
                notes: z.string().optional().describe("Extra requirements: tone, must-include facts, brand color, page numbers…"),
                sourceMaterial: z.string().optional().describe("Source text the numbers and claims must come from."),
            },
        }, async (args) => {
            touch();
            const config = getConfig();
            if (!isConfigUsable(config))
                return jsonResult({ ok: false, error: "Text model is not configured (AI_API_KEY / provider settings)." });
            const guidance = {
                topic: args.topic,
                slideCount: args.slideCount ?? 8,
                ...(args.language ? { language: args.language } : {}),
                ...(args.audience ? { audience: args.audience } : {}),
                ...(args.notes ? { extraNotes: args.notes } : {}),
                ...(args.sourceMaterial ? { sourceMaterial: args.sourceMaterial, sourceBound: true } : {}),
            };
            try {
                const outline = await generateOutline(guidance, { config });
                let review;
                const pres = await generateFromOutline(outline, guidance, {
                    config,
                    onArtDirectorReport: (r) => {
                        review = r;
                    },
                    ...(renderSlide
                        ? {
                            captureReviewShots: async (p) => {
                                const out = [];
                                for (let i = 0; i < Math.min(p.slides.length, 16); i++) {
                                    out.push({ slideIdx: i, dataUrl: `data:image/png;base64,${toBase64(await renderSlide(p, i, { width: 640 }))}` });
                                }
                                return out;
                            },
                        }
                        : {}),
                });
                touch();
                session.deckId = args.deckId;
                session.filePath = null;
                session.port = createHeadlessPort(pres);
                session.dirty = true;
                const deckgen = pres.meta?.deckgen;
                return jsonResult({
                    ok: true,
                    deckId: args.deckId,
                    slideCount: pres.slides.length,
                    titles: outline.slides.map((s) => s.title),
                    gatesPassed: deckgen?.passed ?? null,
                    ...(review
                        ? {
                            review: {
                                score: review.score,
                                overall: review.overall,
                                findings: review.findings.slice(0, 12).map((f) => `#${f.slideIdx} [${f.severity}/${f.category}] ${f.issue} → ${f.suggestion}`),
                            },
                        }
                        : {}),
                    note: `Not saved yet. ${renderSlide ? "Look at pages with render_slide, fix" : "Fix"} what the review lists with the edit tools, then call save_presentation.`,
                });
            }
            catch (e) {
                return jsonResult({ ok: false, error: `generate failed: ${e.message}` });
            }
        });
    }
    server.registerTool("open_pptx", {
        description: "Open a .pptx file from disk into this session. path is absolute or relative to the server process. Discards unsaved changes of the previously open deck. Then use getPresentationSummary and the edit tools. Save with save_pptx.",
        inputSchema: {
            path: z.string().min(1).describe("Path to a .pptx file."),
        },
    }, async ({ path: filePath }) => {
        touch();
        try {
            const opened = await readPptxFile(filePath);
            session.deckId = opened.path;
            session.filePath = opened.path;
            session.port = createHeadlessPort(opened.pres);
            session.dirty = false;
            return jsonResult({
                ok: true,
                path: opened.path,
                slideCount: opened.pres.slides.length,
                size: opened.pres.size,
                note: "Opened. Use getPresentationSummary, edit, screenshot_slide, then save_pptx.",
            });
        }
        catch (e) {
            return jsonResult({ ok: false, error: `open failed: ${e.message}` });
        }
    });
    server.registerTool("save_pptx", {
        description: "Write the open presentation to a .pptx file. Omit path to overwrite the file from open_pptx. Returns saved:true only after the bytes are on disk.",
        inputSchema: {
            path: z.string().min(1).optional().describe("Destination .pptx path. Defaults to the opened file."),
        },
    }, async ({ path: filePath }) => {
        touch();
        if (!session.port) {
            return jsonResult({ ok: false, error: "No presentation open. Call open_pptx first." });
        }
        const dest = filePath ?? session.filePath;
        if (!dest) {
            return jsonResult({ ok: false, error: "No file path. Pass path, or open_pptx first." });
        }
        try {
            const abs = await writePptxFile(dest, session.port.getPres());
            session.filePath = abs;
            session.deckId = abs;
            session.dirty = false;
            return jsonResult({ ok: true, path: abs, saved: true });
        }
        catch (e) {
            return jsonResult({ ok: false, error: `save failed: ${e.message}` });
        }
    });
    server.registerTool("screenshot_sheet", {
        description: `Render up to ${SCREENSHOT_SHEET_LIMIT} slides into one contact-sheet PNG using a local headless Chrome, Edge, or Chromium. Use this to scan a deck for overlap and overflow. The pictures are designed slides, not a click-through. Call open_pptx first.`,
        inputSchema: {
            limit: z.number().int().min(1).max(SCREENSHOT_SHEET_LIMIT).optional().describe("How many slides from the start. Default 8."),
        },
        annotations: { readOnlyHint: true },
    }, async ({ limit }) => {
        touch();
        if (!session.port) {
            return jsonResult({ ok: false, error: "No presentation open. Call open_pptx first." });
        }
        const pres = session.port.getPres();
        const n = Math.min(pres.slides.length, limit ?? SCREENSHOT_SHEET_LIMIT);
        if (n === 0)
            return jsonResult({ ok: false, error: "Presentation has no slides." });
        try {
            const shots = await screenshotSlidesViaBrowser(pres, loadBundledPlayerScript(), {
                slideIndices: Array.from({ length: n }, (_, i) => i),
                width: 640,
            });
            const sheet = composeContactSheet(shots.map((s) => s.png), { cellWidth: 480 });
            return imageResult(`Contact sheet of slides 0–${n - 1}${pres.slides.length > n ? ` (${pres.slides.length - n} later slides omitted)` : ""}.`, [{ slideIdx: -1, pngBase64: Buffer.from(sheet).toString("base64") }]);
        }
        catch (e) {
            return jsonResult({ ok: false, error: e.message ?? String(e) });
        }
    });
    // ---- 编辑工具（与浏览器对话共用同一套 ToolDef）------------------------------
    for (const def of buildEditToolDefs()) {
        const isRead = def.tags.includes("read");
        server.registerTool(def.name, {
            description: def.description,
            inputSchema: rawShapeOf(def),
            annotations: isRead ? { readOnlyHint: true } : { destructiveHint: true },
        }, async (args) => {
            touch();
            if (!session.port) {
                return jsonResult({
                    ok: false,
                    error: "No presentation open. Call open_pptx with a .pptx path, or open_presentation.",
                });
            }
            if (def.name === "screenshot_slide" && typeof document === "undefined") {
                const slideIdx = args.slideIdx;
                if (typeof slideIdx !== "number") {
                    return jsonResult({ ok: false, error: "slideIdx is required." });
                }
                try {
                    const shots = await screenshotSlidesViaBrowser(session.port.getPres(), loadBundledPlayerScript(), {
                        slideIndices: [slideIdx],
                    });
                    return imageResult(shots.map((s) => `Slide ${s.slideIdx} rendered.`).join(" "), shots.map((s) => ({ slideIdx: s.slideIdx, pngBase64: Buffer.from(s.png).toString("base64") })));
                }
                catch (e) {
                    return jsonResult({ ok: false, error: e.message ?? String(e) });
                }
            }
            const rt = createToolRuntime({ port: session.port, getConfig });
            try {
                const result = await def.execute(rt, args);
                if (!def.tags.includes("read"))
                    session.dirty = true;
                return promoteSlideImages(result) ?? jsonResult(result);
            }
            catch (e) {
                return jsonResult({ ok: false, error: e.message ?? String(e) });
            }
        });
    }
    return server;
}
