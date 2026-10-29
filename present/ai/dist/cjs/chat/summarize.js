"use strict";
// 对话标题自动总结：用 LLM 把一段 chat log 浓缩成 6-12 字的标题短语。
//
// 设计要点：
//   1. 与 chat.ts 完全解耦 —— 不复用 ChatSession（不需要 tools、不需要编辑器
//      scope system prompt），单次轻量 generateText 调用即可。
//   2. 失败一律返回 null：网络抖动 / 取消 / 模型不可用 / 输出空白 都算失败，
//      由 UI 调用方降级到「保持默认标题」，绝不抛错打断主流程。
//   3. 只看 user / assistant 文本；tool 输出（JSON）信噪比低且占 token，跳过。
//   4. Prompt 强约束「只输出标题、无引号、无句号、不超 N 字」，并配 cleanTitle
//      做防御性 trim，处理模型偶尔多嘴的情况（解释一下、包一层引号、加 emoji）。
Object.defineProperty(exports, "__esModule", { value: true });
exports.summarizeChatTitle = summarizeChatTitle;
const ai_1 = require("ai");
const client_1 = require("../llm/client");
const limit_1 = require("../llm/limit");
const DEFAULT_MAX_LENGTH = 16;
const MAX_SAMPLE_ENTRIES = 6;
const MAX_SAMPLE_TEXT_CHARS = 280;
/**
 * 让 LLM 用一句简短短语总结一段对话，作为对话列表里的标题。
 *
 * @returns 成功：去引号 / 去标点的纯文本标题（≤ maxLength 字）。
 *          失败 / 取消 / 无内容：null。
 *
 * 用法示例：
 * ```ts
 * const title = await summarizeChatTitle({ log: chat.log, settings, signal });
 * if (title) host.renameChat(chatId, title);
 * ```
 */
async function summarizeChatTitle(opts) {
    const samples = collectSamples(opts.log);
    if (samples.length === 0)
        return null;
    const maxLength = opts.maxLength ?? DEFAULT_MAX_LENGTH;
    const langInstr = opts.language === "zh"
        ? "Respond in Simplified Chinese."
        : opts.language === "en"
            ? "Respond in English."
            : "Respond in whichever language dominates the user's messages above.";
    const system = [
        "You name short chat conversations for a UI sidebar.",
        `Read the excerpt below and produce ONE short title (at most ${maxLength} characters) that captures its main topic.`,
        "Rules:",
        "- Output ONLY the title text, on a single line.",
        "- No quotes, no surrounding markdown, no trailing punctuation, no emoji.",
        "- Prefer concrete nouns (\"封面配色调整\") over generic words (\"对话\" / \"帮助\" / \"questions\").",
        "- Do not start with a verb in imperative form unless the user explicitly issued a directive.",
        langInstr,
    ].join("\n");
    const prompt = ["Conversation excerpt:", "", ...samples, "", "Title:"].join("\n");
    let model;
    try {
        model = (0, client_1.createLlm)(opts.config.text).model;
    }
    catch (e) {
        console.warn("[ai] summarizeChatTitle: createLlm failed", e);
        return null;
    }
    try {
        const { text } = await (0, ai_1.generateText)({
            model,
            system,
            prompt,
            abortSignal: opts.signal,
            timeout: limit_1.LLM_TIMEOUT,
            maxRetries: 0,
        });
        return cleanTitle(text, maxLength);
    }
    catch (e) {
        // AbortError / 429 / 网络中断 —— 全部静默降级；标题自动总结是「锦上添花」，
        // 不应该打断或污染主对话流。
        const name = e?.name ?? "";
        if (name !== "AbortError") {
            console.warn("[ai] summarizeChatTitle: generateText failed", e);
        }
        return null;
    }
}
/**
 * 从 chat log 取最近若干条 user / assistant 文本拼成 LLM 输入。
 * tool 条目（多为大段 JSON）跳过 —— 它们对「这段对话讲什么」的判断帮助极小，
 * 还会快速把 token 喂满，让模型抓不到主线。
 */
function collectSamples(log) {
    const filtered = log.filter((e) => (e.role === "user" || e.role === "assistant") && (e.text ?? "").trim().length > 0);
    const tail = filtered.slice(-MAX_SAMPLE_ENTRIES);
    return tail.map((e) => {
        const text = (e.text ?? "").trim();
        const clipped = text.length > MAX_SAMPLE_TEXT_CHARS ? text.slice(0, MAX_SAMPLE_TEXT_CHARS) + "…" : text;
        const tag = e.role === "user" ? "User" : "Assistant";
        return `${tag}: ${clipped}`;
    });
}
/**
 * 对模型原始输出做防御性清洗：
 *   - 剥掉 ``` fence；
 *   - 剥掉两端中英文引号 / 书名号 / 直角引号；
 *   - 多行只留第一行；
 *   - 去掉中英文句末标点；
 *   - 超长按字符截断到 maxLength。
 */
function cleanTitle(raw, maxLength) {
    if (!raw)
        return null;
    let t = raw.trim();
    if (!t)
        return null;
    // 去 markdown fence
    t = t.replace(/^```[a-zA-Z]*\s*/m, "").replace(/```\s*$/m, "").trim();
    // 多行取首行
    const firstLine = t.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0] ?? "";
    if (!firstLine)
        return null;
    let title = firstLine;
    // 去常见引号 / 书名号包裹（左右各一次）
    title = title.replace(/^[\s"'`「『《“‘【\[（(]+/u, "").replace(/[\s"'`」』》”’】\])）]+$/u, "").trim();
    // 去句末中英文标点
    title = title.replace(/[。.!！?？:：;；,，、]+$/u, "").trim();
    if (!title)
        return null;
    if (title.length > maxLength)
        title = title.slice(0, maxLength).trim();
    return title || null;
}
