"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPptMcpSession = createPptMcpSession;
exports.createPptMcpServer = createPptMcpServer;
const mcp_js_1 = require("@modelcontextprotocol/sdk/server/mcp.js");
const zod_1 = require("zod");
const port_1 = require("../../kernel/port");
const tools_1 = require("../../tools");
const types_1 = require("../../tools/types");
const types_2 = require("../../config/types");
const presets_1 = require("../../config/presets");
const index_1 = require("../../generate/index");
function createPptMcpSession() {
    return { deckId: null, port: null, dirty: false, lastActiveAt: Date.now() };
}
function toBase64(bytes) {
    return Buffer.from(bytes).toString("base64");
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
    if (schema instanceof zod_1.z.ZodObject) {
        return schema.shape;
    }
    // 理论上不会走到：所有 ToolDef 的顶层 schema 都是 z.object。
    return {};
}
function createPptMcpServer(opts) {
    const { decks, session } = opts;
    const getConfig = opts.getConfig ?? (() => (0, types_2.defaultConfig)());
    const server = new mcp_js_1.McpServer({
        name: opts.serverInfo?.name ?? "slimppt",
        version: opts.serverInfo?.version ?? "2.0.0",
    });
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
            deckId: zod_1.z.string().min(1).describe("Deck id from list_presentations."),
        },
    }, async ({ deckId }) => {
        touch();
        try {
            const pres = await decks.load(deckId);
            session.deckId = deckId;
            session.port = (0, port_1.createHeadlessPort)(pres);
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
            return jsonResult({ ok: false, error: "No presentation open. Call open_presentation first." });
        }
        try {
            await decks.save(session.deckId, session.port.getPres());
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
                slideIdx: zod_1.z.number().int().min(0).describe("0-based slide index."),
                width: zod_1.z.number().int().min(320).max(1920).optional().describe("Output width in px (default 960)."),
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
                topic: zod_1.z.string().min(2).describe("What the deck is about."),
                deckId: zod_1.z.string().min(1).describe("Id for the new deck. For a local folder, a new file name such as \"talk.pptx\"."),
                slideCount: zod_1.z.number().int().min(3).max(30).optional().describe("Target number of slides (default 8)."),
                language: zod_1.z.string().optional().describe("Deck language, e.g. zh-CN or en."),
                audience: zod_1.z.string().optional(),
                notes: zod_1.z.string().optional().describe("Extra requirements: tone, must-include facts, brand color, page numbers…"),
                sourceMaterial: zod_1.z.string().optional().describe("Source text the numbers and claims must come from."),
            },
        }, async (args) => {
            touch();
            const config = getConfig();
            if (!(0, presets_1.isConfigUsable)(config))
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
                const outline = await (0, index_1.generateOutline)(guidance, { config });
                let review;
                const pres = await (0, index_1.generateFromOutline)(outline, guidance, {
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
                session.port = (0, port_1.createHeadlessPort)(pres);
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
    // ---- 编辑工具（与浏览器对话共用同一套 ToolDef）------------------------------
    for (const def of (0, tools_1.buildEditToolDefs)()) {
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
                    error: "No presentation open. Call list_presentations then open_presentation first.",
                });
            }
            const rt = (0, types_1.createToolRuntime)({ port: session.port, getConfig });
            try {
                const result = await def.execute(rt, args);
                if (!def.tags.includes("read"))
                    session.dirty = true;
                return jsonResult(result);
            }
            catch (e) {
                return jsonResult({ ok: false, error: e.message ?? String(e) });
            }
        });
    }
    return server;
}
