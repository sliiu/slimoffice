// builtin 工具组: chat-history
//
// 让 AI 能读取 / 检索过往的"PPT × 对话"记录，用于复用上下文。典型场景：
//   - 用户："上次那个产品发布会的对话给我接着改" → chat_history_list 找候选，
//     chat_history_load 加载，然后基于历史继续编辑。
//   - 用户："之前我们怎么决定字体的" → chat_history_search 找涉及"字体"的
//     过往轮次，引用回来。
//
// 设计要点：
//   1. 数据完全来自 rt.hostChatStore（playground 的 local-store 适配）——
//      ai package 不依赖任何宿主存储格式。宿主未注入时返回明确错误。
//   2. 默认 disabled —— 涉及历史会话内容隐私，用户主动开启。
//   3. 返回内容做截断（每条预览 200 char），避免一次性塞爆 prompt。
import { z } from "zod";
import { defineTool } from "../../../tools/types.js";
function preview(text, max = 200) {
    const s = typeof text === "string" ? text : "";
    return s.length > max ? s.slice(0, max) + "…" : s;
}
const NO_STORE_ERROR = "Host does not implement hostChatStore — this build does not support cross-session chat history. Tell the user so.";
const listTool = defineTool({
    name: "chat_history_list",
    description: [
        "List recent chats (newest first). Each presentation can host multiple independent linear chats —",
        "one item per (presentationId, chatId), with chatName and last message timestamp.",
        "Use this first; then call chat_history_load with the picked (presentationId, chatId) to inspect the actual turns.",
    ].join(" "),
    inputSchema: z.object({
        limit: z.number().int().min(1).max(50).optional(),
    }),
    tags: ["read", "capability"],
    execute: (rt, { limit }) => {
        const store = rt.hostChatStore;
        if (!store)
            return { ok: false, error: NO_STORE_ERROR };
        const all = store.list();
        return {
            ok: true,
            count: all.length,
            items: all.slice(0, limit ?? 20).map((e) => ({
                presentationId: e.presentationId,
                presentationName: e.presentationName,
                chatId: e.chatId,
                chatName: e.chatName,
                mtime: e.mtime,
            })),
        };
    },
});
const searchTool = defineTool({
    name: "chat_history_search",
    description: [
        "Substring search across ALL persisted chat turns (user / assistant / tool log) for every chat of every PPT.",
        "Returns matching message previews (200 chars) tagged with (presentationId, chatId).",
        "Case-insensitive; matches partial words.",
    ].join(" "),
    inputSchema: z.object({
        query: z.string().min(1),
        limit: z.number().int().min(1).max(50).optional(),
    }),
    tags: ["read", "capability"],
    execute: (rt, { query, limit }) => {
        const store = rt.hostChatStore;
        if (!store)
            return { ok: false, error: NO_STORE_ERROR };
        const needle = query.toLowerCase();
        const all = store.list();
        const hits = [];
        for (const meta of all) {
            const dump = store.load(meta.presentationId, meta.chatId);
            if (!dump)
                continue;
            const log = Array.isArray(dump.log) ? dump.log : [];
            for (const entry of log) {
                if (!entry || typeof entry.text !== "string")
                    continue;
                if (entry.text.toLowerCase().includes(needle)) {
                    hits.push({
                        presentationId: meta.presentationId,
                        presentationName: meta.presentationName,
                        chatId: meta.chatId,
                        chatName: meta.chatName,
                        role: entry.role ?? "unknown",
                        text: preview(entry.text),
                    });
                    if (hits.length >= (limit ?? 30))
                        break;
                }
            }
            if (hits.length >= (limit ?? 30))
                break;
        }
        return { ok: true, query, count: hits.length, hits };
    },
});
const loadTool = defineTool({
    name: "chat_history_load",
    description: [
        "Load the FULL persisted chat log of one specific chat. Returns up to 200 entries (role + text + toolName).",
        "Use this only after picking a (presentationId, chatId) from chat_history_list / chat_history_search.",
    ].join(" "),
    inputSchema: z.object({
        presentationId: z.string(),
        chatId: z.string(),
        limit: z.number().int().min(1).max(500).optional(),
    }),
    tags: ["read", "capability"],
    execute: (rt, { presentationId, chatId, limit }) => {
        const store = rt.hostChatStore;
        if (!store)
            return { ok: false, error: NO_STORE_ERROR };
        const dump = store.load(presentationId, chatId);
        if (!dump) {
            return { ok: false, error: `No persisted chat for (${presentationId}, ${chatId})` };
        }
        const log = Array.isArray(dump.log)
            ? dump.log
            : [];
        return {
            ok: true,
            presentationId,
            chatId,
            count: log.length,
            entries: log.slice(0, limit ?? 200).map((e) => ({
                role: e.role,
                text: typeof e.text === "string" ? preview(e.text, 400) : "",
                toolName: e.toolName,
            })),
        };
    },
});
export const chatHistoryGroup = {
    id: "chat_history",
    name: "Chat History",
    description: "查询 / 加载过往 PPT 对话历史（跨会话上下文复用）。",
    detail: "提供 `chat_history_list`（按时间倒序列出过往 PPT 的对话条目）、`chat_history_search`（按关键字过滤所有过往消息）、`chat_history_load`（载入某条 PPT 的完整对话）。\n" +
        "数据来源：宿主注入的 chat store（playground 为浏览器 IndexedDB local-store）。",
    icon: "message-circle",
    defaultEnabled: false,
    chatOnly: true,
    privacySensitive: true,
    tools: [listTool, searchTool, loadTool],
};
