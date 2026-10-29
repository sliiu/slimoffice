"use strict";
// MCP 客户端注册表：builtin 工具组 + 用户远端 MCP 的统一管理。
//
//   - listServers(config)       → UI 视图（Capabilities tab 渲染）
//   - getEnabledTools(rt, opts) → 本轮对话可用的 MCP 侧工具（Vercel Tool 格式），
//                                 builtin 组经 toVercelTools 适配、远端读连接池缓存
//   - addUserMcpServer / removeUserMcpServer / reconnectUserMcpServer /
//     testUserMcpConnection     → 用户远端 server 生命周期
//   - setEnabled / toggleEnabled → 开关持久化（builtin / user 共用）
//
// 合并策略：先到先得（builtin 组先注册；远端同名工具跳过并 console.warn），
// 内置编辑工具与 capability 工具的冲突由 chat 组装层保证（built-in 永远优先）。
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadUserServers = exports.toggleEnabled = exports.setEnabled = exports.BUILTIN_TOOL_GROUPS = void 0;
exports.listServers = listServers;
exports.getServerView = getServerView;
exports.getEnabledTools = getEnabledTools;
exports.addUserMcpServer = addUserMcpServer;
exports.testUserMcpConnection = testUserMcpConnection;
exports.removeUserMcpServer = removeUserMcpServer;
exports.reconnectUserMcpServer = reconnectUserMcpServer;
exports.getUserMcpToolNames = getUserMcpToolNames;
exports.isUserMcpConnected = isUserMcpConnected;
const vercel_1 = require("../../tools/adapters/vercel");
const settings_1 = require("./settings");
const remote_1 = require("./remote");
const stock_images_1 = require("./builtin/stock-images");
const stock_fonts_1 = require("./builtin/stock-fonts");
const chat_history_1 = require("./builtin/chat-history");
/**
 * 当前内置的工具组列表（编译期常量）。改动这里 = 增删 builtin 能力。
 * 顺序决定 UI 上的展示顺序（常用的放前面）。
 */
exports.BUILTIN_TOOL_GROUPS = [
    stock_images_1.stockImagesGroup,
    stock_fonts_1.stockFontsGroup,
    chat_history_1.chatHistoryGroup,
];
function builtinView(group, config) {
    const missing = group.requirements?.(config) ?? [];
    return {
        id: group.id,
        name: group.name,
        description: group.description,
        detail: group.detail,
        icon: group.icon,
        runtime: "builtin",
        enabled: (0, settings_1.resolveEnabled)(group.id, group.defaultEnabled),
        ready: missing.length === 0,
        missing,
        chatOnly: !!group.chatOnly,
        privacySensitive: !!group.privacySensitive,
    };
}
function userView(cfg) {
    const connected = remote_1.userMcpPool.isConnected(cfg.id);
    const missing = !cfg.url.trim() ? ["url"] : connected ? [] : ["connection"];
    return {
        id: cfg.id,
        name: cfg.name,
        description: cfg.description ?? `Remote ${cfg.transport.toUpperCase()} MCP: ${cfg.url}`,
        detail: [
            `Transport: ${cfg.transport.toUpperCase()}`,
            `URL: ${cfg.url}`,
            cfg.headers && Object.keys(cfg.headers).length > 0 ? `Headers: ${Object.keys(cfg.headers).join(", ")}` : null,
            "",
            "User-defined remote MCP. Connection state and tool list are pulled live via @ai-sdk/mcp; edit / reconnect / delete from the Capabilities tab card.",
        ]
            .filter(Boolean)
            .join("\n"),
        icon: cfg.icon ?? "puzzle",
        runtime: "user",
        userConfig: cfg,
        enabled: (0, settings_1.resolveEnabled)(cfg.id, false),
        ready: missing.length === 0,
        missing,
        chatOnly: false,
        privacySensitive: false,
        toolNames: remote_1.userMcpPool.getCachedToolNames(cfg.id),
    };
}
/**
 * 解析当前所有能力项的「视图」：UI 拿这个渲染 Capabilities tab。
 * 每次调用都现读 localStorage —— 廉价，避免缓存不一致。
 */
function listServers(config) {
    return [
        ...exports.BUILTIN_TOOL_GROUPS.map((g) => builtinView(g, config)),
        ...(0, settings_1.loadUserServers)().map(userView),
    ];
}
/** 取单个能力项视图（capability 工具用）。 */
function getServerView(id, config) {
    return listServers(config).find((v) => v.id === id);
}
/**
 * 合并所有「开启 + ready」能力项的工具，作为额外 tool 注入给模型。
 *
 * 失败的项直接跳过（registry 永远不抛错，保持模型可用）；原因走 console.warn。
 */
function getEnabledTools(rt, options = {}) {
    const result = {};
    const config = rt.getConfig();
    const extraOn = new Set(options.extraEnabled ?? []);
    const extraOff = new Set(options.extraDisabled ?? []);
    const merge = (tools, from) => {
        for (const [name, tool] of Object.entries(tools)) {
            if (result[name]) {
                // 不覆盖已有同名（先注册优先；防止远端 MCP 用同名误导模型）。
                console.warn(`[mcp] tool name collision: ${name} (from ${from}); skipping.`);
                continue;
            }
            result[name] = tool;
        }
    };
    for (const view of listServers(config)) {
        let enabled = view.enabled;
        if (extraOn.has(view.id))
            enabled = true;
        if (extraOff.has(view.id))
            enabled = false;
        if (!enabled || !view.ready)
            continue;
        try {
            if (view.runtime === "builtin") {
                const group = exports.BUILTIN_TOOL_GROUPS.find((g) => g.id === view.id);
                if (group)
                    merge((0, vercel_1.toVercelTools)(group.tools, rt), view.id);
            }
            else {
                merge(remote_1.userMcpPool.getCachedTools(view.id), view.id);
            }
        }
        catch (e) {
            console.warn(`[mcp] ${view.id} tools failed`, e);
        }
    }
    return result;
}
// ===========================================================================
// 用户态远端 MCP server 管理 API
// ===========================================================================
//
// 所有写操作都同时维护 settings.localStorage 和 userMcpPool 的 in-memory client
// cache —— 让两边不可能漂移。
/**
 * 新增 / 更新一个用户 MCP server。
 *
 * 流程：先 await pool.connect 拉取远端 tools；只有连接成功才写入持久化 list。
 * 失败时不入库（避免"显示存在但永远连不上"的死状态）。
 */
async function addUserMcpServer(cfg) {
    if (!cfg.id.startsWith("user_")) {
        return { ok: false, error: `User MCP id must start with "user_": got "${cfg.id}"` };
    }
    if (exports.BUILTIN_TOOL_GROUPS.some((g) => g.id === cfg.id)) {
        return { ok: false, error: `id "${cfg.id}" is reserved by a built-in capability.` };
    }
    const result = await remote_1.userMcpPool.connect(cfg);
    if (!result.ok)
        return result;
    (0, settings_1.upsertUserServer)(cfg);
    return result;
}
/** 测试用户填的配置能否连上、能拉到哪些工具 —— 不入库不缓存。 */
async function testUserMcpConnection(cfg) {
    return remote_1.userMcpPool.test(cfg);
}
/** 删除一个用户 MCP server：close client + 清持久化 + 清 enabled flag。 */
async function removeUserMcpServer(id) {
    await remote_1.userMcpPool.disconnect(id);
    (0, settings_1.removeUserServer)(id);
    (0, settings_1.clearEnabled)(id);
}
/** 用最新持久化里的 cfg 重新连接某个用户 MCP（不改 cfg 内容）。 */
async function reconnectUserMcpServer(id) {
    const cfg = (0, settings_1.loadUserServers)().find((c) => c.id === id);
    if (!cfg)
        return { ok: false, error: `No user MCP with id "${id}"` };
    return remote_1.userMcpPool.connect(cfg);
}
/** UI 用：查 cache 里当前已连接的 tool 名（卡片副标题渲染）。 */
function getUserMcpToolNames(id) {
    return remote_1.userMcpPool.getCachedToolNames(id);
}
/** UI 用：是否已经连上（卡片上的"已连接 / 未连接"徽章）。 */
function isUserMcpConnected(id) {
    return remote_1.userMcpPool.isConnected(id);
}
var settings_2 = require("./settings");
Object.defineProperty(exports, "setEnabled", { enumerable: true, get: function () { return settings_2.setEnabled; } });
Object.defineProperty(exports, "toggleEnabled", { enumerable: true, get: function () { return settings_2.toggleEnabled; } });
Object.defineProperty(exports, "loadUserServers", { enumerable: true, get: function () { return settings_2.loadUserServers; } });
