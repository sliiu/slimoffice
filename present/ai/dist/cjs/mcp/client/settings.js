"use strict";
// MCP 能力开关 + 用户远端 server 列表的持久化（localStorage）。
//
// 设计：
//   - `ppt.ai.mcp.enabled` 存 Record<id, { enabled }>：仅记录"开/关"，builtin /
//     user 共用。未出现的 id 走 descriptor 的 defaultEnabled。
//   - `ppt.ai.mcp.user-servers` 存 UserMcpConfig[]：明文存（含 headers/token）——
//     浏览器没有真正"加密 storage"，加层 base64 反而让用户误以为安全；
//     老老实实明文，在 UI 上提示用户。
//   - Node 环境（无 localStorage）一律返回空 / no-op —— headless MCP server
//     不使用用户远端 MCP，也不需要能力开关。
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveEnabled = resolveEnabled;
exports.setEnabled = setEnabled;
exports.toggleEnabled = toggleEnabled;
exports.clearEnabled = clearEnabled;
exports.loadUserServers = loadUserServers;
exports.saveUserServers = saveUserServers;
exports.upsertUserServer = upsertUserServer;
exports.removeUserServer = removeUserServer;
const ENABLED_KEY = "ppt.ai.mcp.enabled";
const USER_SERVERS_KEY = "ppt.ai.mcp.user-servers";
function readStored() {
    if (typeof localStorage === "undefined")
        return {};
    try {
        const raw = localStorage.getItem(ENABLED_KEY);
        if (!raw)
            return {};
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object")
            return {};
        return parsed;
    }
    catch {
        return {};
    }
}
function writeStored(map) {
    if (typeof localStorage === "undefined")
        return;
    try {
        localStorage.setItem(ENABLED_KEY, JSON.stringify(map));
    }
    catch {
        // ignore quota
    }
}
/** 读某 id 的持久化 enabled；未记录时返回 fallback（descriptor 默认值）。 */
function resolveEnabled(id, fallback) {
    return readStored()[id]?.enabled ?? fallback;
}
/** 设置某个能力项的启用状态（持久化）。 */
function setEnabled(id, enabled) {
    const map = readStored();
    map[id] = { enabled };
    writeStored(map);
}
/** toggle（以调用方提供的当前值取反）。 */
function toggleEnabled(id, currentValue) {
    const next = !currentValue;
    setEnabled(id, next);
    return next;
}
/** 删除某 id 的持久化痕迹（user MCP 被 remove 时调用）。 */
function clearEnabled(id) {
    const map = readStored();
    if (id in map) {
        delete map[id];
        writeStored(map);
    }
}
// ===========================================================================
// 用户自定义远端 MCP server 列表
// ===========================================================================
function isValidUserConfig(v) {
    if (!v || typeof v !== "object")
        return false;
    const c = v;
    if (typeof c.id !== "string" || !c.id.startsWith("user_"))
        return false;
    if (typeof c.name !== "string" || !c.name.trim())
        return false;
    if (c.transport !== "http" && c.transport !== "sse")
        return false;
    if (typeof c.url !== "string" || !c.url.trim())
        return false;
    if (c.headers !== undefined) {
        if (!c.headers || typeof c.headers !== "object")
            return false;
        for (const [k, vv] of Object.entries(c.headers)) {
            if (typeof k !== "string" || typeof vv !== "string")
                return false;
        }
    }
    return true;
}
function loadUserServers() {
    if (typeof localStorage === "undefined")
        return [];
    try {
        const raw = localStorage.getItem(USER_SERVERS_KEY);
        if (!raw)
            return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed))
            return [];
        return parsed.filter(isValidUserConfig);
    }
    catch {
        return [];
    }
}
function saveUserServers(list) {
    if (typeof localStorage === "undefined")
        return;
    try {
        localStorage.setItem(USER_SERVERS_KEY, JSON.stringify(list));
    }
    catch {
        // ignore quota
    }
}
/** upsert：按 id 替换或追加；返回最新 list。 */
function upsertUserServer(cfg) {
    const list = loadUserServers();
    const idx = list.findIndex((c) => c.id === cfg.id);
    if (idx >= 0)
        list[idx] = cfg;
    else
        list.push(cfg);
    saveUserServers(list);
    return list;
}
/** 删除某个 user server；返回最新 list。 */
function removeUserServer(id) {
    const list = loadUserServers().filter((c) => c.id !== id);
    saveUserServers(list);
    return list;
}
