import type { AiConfig } from "../config/types.js";
import type { ChatLogEntry } from "./engine.js";
export interface SummarizeChatTitleOptions {
    /** 用于总结的 chat log（一般传 ChatSession.log 直接进来即可，函数内部会自行筛选）。 */
    log: ReadonlyArray<ChatLogEntry>;
    /** LLM provider 配置；调用方需保证 isConfigUsable(config) === true。 */
    config: AiConfig;
    /** AbortSignal —— UI 在切换对话 / 关闭面板时可取消。 */
    signal?: AbortSignal;
    /**
     * 目标语言提示：
     *   - "zh"：强制简体中文
     *   - "en"：强制英文
     *   - 未传：让模型沿用对话本身的语言（混合时由模型挑主导语言）
     */
    language?: "zh" | "en";
    /** 标题最大字符数，默认 16。超过会被截断 + 兜底处理。 */
    maxLength?: number;
}
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
export declare function summarizeChatTitle(opts: SummarizeChatTitleOptions): Promise<string | null>;
