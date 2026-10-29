import { type ModelMessage } from "ai";
import type { AiConfig } from "../config/types.js";
import type { DocumentPort } from "../kernel/port.js";
import { type CapabilityChangedEvent, type ToolDef } from "../tools/types.js";
import type { HostChatStore } from "./types.js";
import type { HostSkillStore } from "../skills/types.js";
export type ChatEvent = {
    kind: "text-delta";
    text: string;
} | {
    kind: "tool-call";
    toolName: string;
    toolArgs: unknown;
} | {
    kind: "tool-result";
    toolName: string;
    toolResult: unknown;
} | {
    kind: "step-finish";
} | {
    kind: "turn-finish";
} | {
    kind: "error";
    error: string;
};
/** UI 渲染用历史条目（不参与模型调用）。 */
export interface ChatLogEntry {
    role: "user" | "assistant" | "tool";
    /** 用户/助手文本；tool 时为 result 字符串。 */
    text: string;
    /** 当本条目代表工具调用时（role=assistant 也可能挂带 toolCalls）。 */
    toolCalls?: Array<{
        name: string;
        args: unknown;
    }>;
    /** 当 role=tool。 */
    toolName?: string;
    /**
     * 助手正文写完的时间（epoch ms）。只打在本轮最后一条有正文的 assistant 上。
     * 旧日志没有这个字段时，界面不显示「多久前」。
     */
    finishedAt?: number;
}
/**
 * 复制一份到 logEndIndex（含）为止的对话，不改原对象。
 * 按 user 条数对齐模型消息：保留这几轮 user，以及最后一轮 user 之后、下一条 user 之前的 assistant/tool。
 */
export declare function sliceChatThroughTurn<M extends {
    role: string;
}>(messages: readonly M[], log: readonly ChatLogEntry[], logEndIndex: number): {
    messages: M[];
    log: ChatLogEntry[];
} | null;
export interface ChatEngineOptions {
    /** 文档端口（编辑器或 headless）。 */
    port: DocumentPort;
    /** 每轮现取配置。 */
    getConfig: () => AiConfig;
    /** 覆盖默认 chat system prompt（生成 painter / 其它非对话角色）。 */
    systemPrompt?: (host?: HostSkillStore) => string;
    /** 拼接到 system prompt 末尾的宿主额外内容。 */
    systemExtra?: string;
    /** 宿主 user skill 存储 —— 逐轮读取，skill 编辑后下一轮生效。 */
    hostSkillStore?: HostSkillStore;
    /** 宿主聊天存储（chat-history 工具组用）。 */
    hostChatStore?: HostChatStore;
    /** 当前 PPT id。 */
    presentationId?: string;
    /** 模型自主开关 capability 的事件回调（宿主 → toast + undo）。 */
    onCapabilityChanged?: (e: CapabilityChangedEvent) => void;
    /** 写/读本轮 MCP session override（chat composer chip 同源）。 */
    setMcpSessionOverride?: (id: string, enabled: boolean | null) => void;
    getMcpSessionOverride?: (id: string) => boolean | null;
    /** suggest_open_settings 请求宿主切 Settings tab。 */
    onOpenSettings?: (fields: string[], reason: string) => void;
    /** 覆盖内置工具集（测试注入用；缺省 buildEditToolDefs()）。 */
    toolDefs?: ToolDef[];
    /** 合并 MCP 工具。生成 painter 设 false。缺省 true。 */
    includeMcp?: boolean;
    /** 合并 capability 工具。生成 painter 设 false。缺省 true。 */
    includeCapabilities?: boolean;
    /** 把 [TURN SCOPE] 拼进 system。生成 painter 设 false（scope 在 user 消息 + pinPort）。缺省 true。 */
    includeTurnScope?: boolean;
    /** OpenAI promptCacheKey；同 key + 相同 system/tools 前缀可命中缓存。 */
    cacheKey?: string;
}
export interface SendOptions {
    onEvent?: (e: ChatEvent) => void;
    signal?: AbortSignal;
    maxSteps?: number;
    /** false = 非流式（默认流式）。 */
    stream?: boolean;
    /** 本轮临时强制启用的 MCP id（composer chip）。 */
    extraEnabledMcp?: ReadonlyArray<string>;
    /** 本轮临时强制禁用的 MCP id。 */
    extraDisabledMcp?: ReadonlyArray<string>;
}
export declare class ChatEngine {
    private readonly opts;
    /** 真正发给模型的历史（user/assistant/tool；system 逐轮组装不入历史）。 */
    private messages;
    /** UI 渲染用历史。 */
    readonly log: ChatLogEntry[];
    constructor(opts: ChatEngineOptions);
    clear(): void;
    /**
     * 回退对话到 log[logIndex] 之前（丢弃该条及之后所有条目）。
     *
     * logIndex 必须指向一条 role === "user" 的 log 条目 —— 只在 user 边界截断
     * （assistant / tool 出现在轮次内部，从中间切会留下半段无主的 toolResults）。
     * 非法 index 直接 no-op，由 UI 层挡住不可点状态。
     *
     * 只动 in-memory state；持久化由调用方在 rewind 后自行触发。
     */
    rewindTo(logIndex: number): {
        removedLog: number;
        removedMessages: number;
    };
    /**
     * 序列化"模型消息流 + UI 日志"为 JSON 安全结构，供宿主持久化。
     * 同时导出 messages（喂回模型）和 log（UI 渲染，带 tool name/args 展示信息）。
     */
    dump(): {
        messages: ModelMessage[];
        log: ChatLogEntry[];
    };
    /** 反序列化恢复对话。跳过空 / 损坏输入。历史中的 system 消息一律丢弃（v2 逐轮组装）。 */
    restore(state: {
        messages?: unknown;
        log?: unknown;
    }): void;
    send(userText: string, sendOpts?: SendOptions): Promise<{
        assistantText: string;
    }>;
    private buildSystem;
    private buildTools;
    private runTurn;
    private runStream;
    private runNonStream;
}
