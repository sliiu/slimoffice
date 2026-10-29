// ChatEngine：多轮对话 + tool calling 循环。
//
// v2 关键设计（相对 v1 ChatSession 的修正）：
//   1. system prompt 逐轮组装 —— messages 数组只存 user/assistant/tool；每次
//      send() 现算 system（chatSystemPrompt + config.systemPrefix + systemExtra）。
//      skills 开关 / 内容变更下一轮即生效，无需"清空对话重建会话"。
//   2. 逐轮事务 —— send() 全程包在 port.transaction() 里，本轮所有 EditCommand
//      折叠成一个 undo 原子；用户撤销一次即回滚整轮 AI 改动。
//   3. 单一事件流 —— onEvent(ChatEvent)；UI 只消费事件，不再区分 stream / 非 stream
//      两套回调（非流式场景直接不传 stream:false 也能少量事件工作）。
//   4. [TURN SCOPE] 焦点锁：send() 瞬间快照 slide/shape 选区，拼进本轮 system
//      且工具守卫读同一份快照（不入 messages）。避免 composer 清 pin / 画布改选
//      把本轮目标换成当前选中，也避开 Moonshot 等只允许 messages 开头一条 system 的网关。
//   5. 工具集合并顺序（后并覆盖前并，但 merge 内部先到先得）：
//      内置编辑工具 → MCP 侧工具（启用的 builtin 工具组 + 用户远端）→ capability
//      工具（永远内置，绝不被 shadow）。
import { generateText, stepCountIs, streamText, } from "ai";
import { createLlm } from "../llm/client.js";
import { createToolRuntime, } from "../tools/types.js";
import { toVercelTools } from "../tools/adapters/vercel.js";
import { buildEditToolDefs } from "../tools/index.js";
import { capabilityTools } from "../tools/domains/capabilities.js";
import { getEnabledTools as getEnabledMcpTools } from "../mcp/client/registry.js";
import { chatSystemPrompt } from "./prompts.js";
import { formatTurnScope } from "./scope.js";
import { llmProviderOptions, stampToolCache } from "../llm/cache.js";
import { observeLlmError, withGenerateJsonSlot, LLM_TIMEOUT } from "../llm/limit.js";
const DEFAULT_MAX_STEPS = 8;
/**
 * 复制一份到 logEndIndex（含）为止的对话，不改原对象。
 * 按 user 条数对齐模型消息：保留这几轮 user，以及最后一轮 user 之后、下一条 user 之前的 assistant/tool。
 */
export function sliceChatThroughTurn(messages, log, logEndIndex) {
    if (!Number.isInteger(logEndIndex) || logEndIndex < 0 || logEndIndex >= log.length)
        return null;
    const slicedLog = log.slice(0, logEndIndex + 1).map((e) => ({ ...e }));
    let userCount = 0;
    for (const e of slicedLog) {
        if (e.role === "user")
            userCount++;
    }
    if (userCount === 0)
        return { messages: [], log: slicedLog };
    let seen = 0;
    let end = messages.length;
    for (let i = 0; i < messages.length; i++) {
        if (messages[i]?.role !== "user")
            continue;
        seen++;
        if (seen === userCount) {
            end = i + 1;
            while (end < messages.length && messages[end]?.role !== "user")
                end++;
            break;
        }
    }
    return {
        messages: messages.slice(0, end).map((m) => ({ ...m })),
        log: slicedLog,
    };
}
export class ChatEngine {
    opts;
    /** 真正发给模型的历史（user/assistant/tool；system 逐轮组装不入历史）。 */
    messages = [];
    /** UI 渲染用历史。 */
    log = [];
    constructor(opts) {
        this.opts = opts;
    }
    clear() {
        this.messages = [];
        this.log.length = 0;
    }
    /**
     * 回退对话到 log[logIndex] 之前（丢弃该条及之后所有条目）。
     *
     * logIndex 必须指向一条 role === "user" 的 log 条目 —— 只在 user 边界截断
     * （assistant / tool 出现在轮次内部，从中间切会留下半段无主的 toolResults）。
     * 非法 index 直接 no-op，由 UI 层挡住不可点状态。
     *
     * 只动 in-memory state；持久化由调用方在 rewind 后自行触发。
     */
    rewindTo(logIndex) {
        if (logIndex < 0 || logIndex >= this.log.length) {
            return { removedLog: 0, removedMessages: 0 };
        }
        if (this.log[logIndex]?.role !== "user") {
            return { removedLog: 0, removedMessages: 0 };
        }
        let userCountBefore = 0;
        for (let i = 0; i < logIndex; i++) {
            if (this.log[i]?.role === "user")
                userCountBefore++;
        }
        let seenUsers = 0;
        let cutAt = this.messages.length;
        for (let i = 0; i < this.messages.length; i++) {
            if (this.messages[i]?.role === "user") {
                if (seenUsers === userCountBefore) {
                    cutAt = i;
                    break;
                }
                seenUsers++;
            }
        }
        const removedMessages = this.messages.length - cutAt;
        const removedLog = this.log.length - logIndex;
        this.messages.length = cutAt;
        this.log.length = logIndex;
        return { removedLog, removedMessages };
    }
    /**
     * 序列化"模型消息流 + UI 日志"为 JSON 安全结构，供宿主持久化。
     * 同时导出 messages（喂回模型）和 log（UI 渲染，带 tool name/args 展示信息）。
     */
    dump() {
        return {
            messages: this.messages.map((m) => ({ ...m })),
            log: this.log.map((e) => ({ ...e })),
        };
    }
    /** 反序列化恢复对话。跳过空 / 损坏输入。历史中的 system 消息一律丢弃（v2 逐轮组装）。 */
    restore(state) {
        if (!state || typeof state !== "object")
            return;
        if (Array.isArray(state.messages)) {
            this.messages = state.messages.filter((m) => m && m.role !== "system");
        }
        if (Array.isArray(state.log)) {
            this.log.length = 0;
            for (const e of state.log) {
                if (e && typeof e === "object" && typeof e.role === "string" && typeof e.text === "string") {
                    if (typeof e.finishedAt !== "number" || !Number.isFinite(e.finishedAt)) {
                        delete e.finishedAt;
                    }
                    this.log.push(e);
                }
            }
        }
    }
    async send(userText, sendOpts = {}) {
        const config = this.opts.getConfig();
        const label = `AI: ${userText.trim().slice(0, 40) || "chat"}`;
        // 逐轮事务：本轮所有命令折叠成一个 undo 原子。事务不回滚 —— 中途失败时
        // 已成功的改动保留（模型下一步自行修正比静默丢工作好）。
        return this.opts.port.transaction(label, () => this.runTurn(userText, config, sendOpts));
    }
    buildSystem(config, scopeLine) {
        return [
            this.opts.systemPrompt
                ? this.opts.systemPrompt(this.opts.hostSkillStore)
                : chatSystemPrompt(this.opts.hostSkillStore),
            config.text.systemPrefix.trim(),
            this.opts.systemExtra?.trim(),
            scopeLine?.trim(),
        ]
            .filter(Boolean)
            .join("\n\n");
    }
    buildTools(config, sendOpts, port = this.opts.port) {
        const rt = createToolRuntime({
            port,
            getConfig: () => config,
            ...(this.opts.presentationId ? { presentationId: this.opts.presentationId } : {}),
            ...(this.opts.hostChatStore ? { hostChatStore: this.opts.hostChatStore } : {}),
            ...(this.opts.hostSkillStore ? { hostSkillStore: this.opts.hostSkillStore } : {}),
            ...(this.opts.onCapabilityChanged ? { onCapabilityChanged: this.opts.onCapabilityChanged } : {}),
            ...(this.opts.setMcpSessionOverride ? { setMcpSessionOverride: this.opts.setMcpSessionOverride } : {}),
            ...(this.opts.getMcpSessionOverride ? { getMcpSessionOverride: this.opts.getMcpSessionOverride } : {}),
            ...(this.opts.onOpenSettings ? { onOpenSettings: this.opts.onOpenSettings } : {}),
        });
        const editDefs = this.opts.toolDefs ?? buildEditToolDefs();
        const tools = toVercelTools(editDefs, rt);
        if (this.opts.includeMcp !== false) {
            const mcpTools = getEnabledMcpTools(rt, {
                ...(sendOpts.extraEnabledMcp ? { extraEnabled: sendOpts.extraEnabledMcp } : {}),
                ...(sendOpts.extraDisabledMcp ? { extraDisabled: sendOpts.extraDisabledMcp } : {}),
            });
            for (const [name, tool] of Object.entries(mcpTools)) {
                if (tools[name]) {
                    console.warn(`[chat] MCP tool "${name}" collides with a built-in tool; built-in wins.`);
                    continue;
                }
                tools[name] = tool;
            }
        }
        if (this.opts.includeCapabilities !== false) {
            Object.assign(tools, toVercelTools(capabilityTools, rt));
        }
        return { tools, rt };
    }
    async runTurn(userText, config, opts) {
        this.messages.push({ role: "user", content: userText });
        this.log.push({ role: "user", text: userText });
        const port = freezePortFocus(this.opts.port);
        const { model } = createLlm(config.text);
        const system = this.buildSystem(config, this.opts.includeTurnScope === false ? undefined : formatTurnScope(port));
        const { tools } = this.buildTools(config, opts, port);
        const maxSteps = opts.maxSteps ?? DEFAULT_MAX_STEPS;
        const cachedTools = stampToolCache(tools);
        const messages = [...this.messages];
        const providerOptions = llmProviderOptions(config.text.provider, this.opts.cacheKey ?? "ppt-chat");
        if (opts.stream === false) {
            return await withGenerateJsonSlot(() => this.runNonStream(model, cachedTools, messages, opts, maxSteps, providerOptions, system));
        }
        return await withGenerateJsonSlot(() => this.runStream(model, cachedTools, messages, opts, maxSteps, providerOptions, system));
    }
    async runStream(model, tools, messages, opts, maxSteps, providerOptions, system) {
        let collectedText = "";
        let lastAssistantEntry = null;
        let streamFailed = false;
        const reportStreamError = (e) => {
            if (streamFailed)
                return;
            streamFailed = true;
            const msg = e instanceof Error ? e.message : String(e);
            opts.onEvent?.({ kind: "error", error: msg });
        };
        try {
            const result = streamText({
                model,
                system,
                tools,
                messages,
                ...(providerOptions ? { providerOptions } : {}),
                stopWhen: stepCountIs(maxSteps),
                abortSignal: opts.signal,
                timeout: LLM_TIMEOUT,
                maxRetries: 0,
                onError: ({ error }) => {
                    reportStreamError(error);
                },
                onChunk: ({ chunk }) => {
                    if (chunk.type === "text-delta") {
                        const delta = chunk.text ?? "";
                        if (!delta)
                            return;
                        collectedText += delta;
                        if (!lastAssistantEntry) {
                            lastAssistantEntry = { role: "assistant", text: delta };
                            this.log.push(lastAssistantEntry);
                        }
                        else {
                            lastAssistantEntry.text += delta;
                        }
                        opts.onEvent?.({ kind: "text-delta", text: delta });
                    }
                    else if (chunk.type === "tool-call") {
                        const c = chunk;
                        opts.onEvent?.({ kind: "tool-call", toolName: c.toolName, toolArgs: c.input });
                        // 尚未说话就调工具时仍写一条空文本 assistant，当作下一步的分界
                        // （重绘时两条工具链不会并成一组）。UI 不渲染 text 为空的气泡。
                        if (!lastAssistantEntry) {
                            lastAssistantEntry = { role: "assistant", text: "" };
                            this.log.push(lastAssistantEntry);
                        }
                        const calls = lastAssistantEntry.toolCalls ?? (lastAssistantEntry.toolCalls = []);
                        calls.push({ name: c.toolName, args: c.input });
                    }
                    else if (chunk.type === "tool-result") {
                        const c = chunk;
                        opts.onEvent?.({ kind: "tool-result", toolName: c.toolName, toolResult: c.output });
                        this.log.push({
                            role: "tool",
                            toolName: c.toolName,
                            text: safeStringify(c.output),
                        });
                    }
                },
                onStepFinish: () => {
                    opts.onEvent?.({ kind: "step-finish" });
                    // 每步结束后开新的 assistant entry 接续后面的 textDelta（避免和 tool 输出错位）。
                    lastAssistantEntry = null;
                },
            });
            // fullStream 含 error chunk；仅消费 textStream 会在网络/解析失败时静默结束。
            for await (const part of result.fullStream) {
                if (part.type === "error") {
                    reportStreamError(part.error);
                }
            }
            if (streamFailed) {
                throw new Error("Stream failed");
            }
            const finalResp = await result.response;
            this.messages.push(...finalResp.messages);
            stampTurnFinished(this.log);
            opts.onEvent?.({ kind: "turn-finish" });
            return { assistantText: collectedText };
        }
        catch (e) {
            observeLlmError(e);
            if (!streamFailed) {
                reportStreamError(e);
            }
            throw e;
        }
    }
    async runNonStream(model, tools, messages, opts, maxSteps, providerOptions, system) {
        try {
            const result = await generateText({
                model,
                system,
                tools,
                messages,
                ...(providerOptions ? { providerOptions } : {}),
                stopWhen: stepCountIs(maxSteps),
                abortSignal: opts.signal,
                timeout: LLM_TIMEOUT,
                maxRetries: 0,
                onStepFinish: (step) => {
                    opts.onEvent?.({ kind: "step-finish" });
                    for (const c of step.toolCalls ?? []) {
                        opts.onEvent?.({ kind: "tool-call", toolName: c.toolName, toolArgs: c.input });
                        this.log.push({ role: "tool", toolName: c.toolName, text: "" });
                    }
                    for (const r of step.toolResults ?? []) {
                        opts.onEvent?.({
                            kind: "tool-result",
                            toolName: r.toolName ?? "",
                            toolResult: r.output,
                        });
                    }
                },
            });
            this.messages.push(...result.response.messages);
            if (result.text)
                this.log.push({ role: "assistant", text: result.text });
            stampTurnFinished(this.log);
            opts.onEvent?.({ kind: "turn-finish" });
            return { assistantText: result.text };
        }
        catch (e) {
            observeLlmError(e);
            const msg = e instanceof Error ? e.message : String(e);
            opts.onEvent?.({ kind: "error", error: msg });
            throw e;
        }
    }
}
/** 本轮最后一条有正文的助手条目记下完成时间。已有时间的不覆盖。 */
function stampTurnFinished(log, at = Date.now()) {
    for (let i = log.length - 1; i >= 0; i--) {
        const e = log[i];
        if (!e)
            continue;
        if (e.role === "user")
            return;
        if (e.role === "assistant" && e.text.trim()) {
            if (e.finishedAt == null)
                e.finishedAt = at;
            return;
        }
    }
}
function freezePortFocus(port) {
    const slides = port.getFocusedSlideIndices().slice();
    const shapes = port.getSelectedShapeIds().slice();
    return {
        getPres: () => port.getPres(),
        execute: (cmd) => port.execute(cmd),
        transaction: (label, fn) => port.transaction(label, fn),
        getFocusedSlideIndices: () => slides,
        getSelectedShapeIds: () => shapes,
        notifyMutated: () => port.notifyMutated(),
        onMutated: (listener) => port.onMutated(listener),
        get stack() {
            return port.stack;
        },
    };
}
function safeStringify(v) {
    if (v === undefined)
        return "undefined";
    try {
        return JSON.stringify(v, null, 2);
    }
    catch {
        return String(v);
    }
}
