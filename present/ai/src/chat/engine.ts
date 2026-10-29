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

import {
  generateText,
  stepCountIs,
  streamText,
  type LanguageModel,
  type ModelMessage,
  type Tool,
} from "ai";
import type { AiConfig } from "../config/types";
import { createLlm } from "../llm/client";
import type { DocumentPort } from "../kernel/port";
import {
  createToolRuntime,
  type CapabilityChangedEvent,
  type ToolDef,
  type ToolRuntime,
} from "../tools/types";
import { toVercelTools } from "../tools/adapters/vercel";
import { buildEditToolDefs } from "../tools";
import { capabilityTools } from "../tools/domains/capabilities";
import { getEnabledTools as getEnabledMcpTools } from "../mcp/client/registry";
import { chatSystemPrompt } from "./prompts";
import { formatTurnScope } from "./scope";
import { llmProviderOptions, stampToolCache } from "../llm/cache";
import { observeLlmError, withGenerateJsonSlot, LLM_TIMEOUT } from "../llm/limit";
import type { HostChatStore } from "./types";
import type { HostSkillStore } from "../skills/types";

const DEFAULT_MAX_STEPS = 8;

export type ChatEvent =
  | { kind: "text-delta"; text: string }
  | { kind: "tool-call"; toolName: string; toolArgs: unknown }
  | { kind: "tool-result"; toolName: string; toolResult: unknown }
  | { kind: "step-finish" }
  | { kind: "turn-finish" }
  | { kind: "error"; error: string };

/** UI 渲染用历史条目（不参与模型调用）。 */
export interface ChatLogEntry {
  role: "user" | "assistant" | "tool";
  /** 用户/助手文本；tool 时为 result 字符串。 */
  text: string;
  /** 当本条目代表工具调用时（role=assistant 也可能挂带 toolCalls）。 */
  toolCalls?: Array<{ name: string; args: unknown }>;
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
export function sliceChatThroughTurn<M extends { role: string }>(
  messages: readonly M[],
  log: readonly ChatLogEntry[],
  logEndIndex: number,
): { messages: M[]; log: ChatLogEntry[] } | null {
  if (!Number.isInteger(logEndIndex) || logEndIndex < 0 || logEndIndex >= log.length) return null;
  const slicedLog = log.slice(0, logEndIndex + 1).map((e) => ({ ...e }));
  let userCount = 0;
  for (const e of slicedLog) {
    if (e.role === "user") userCount++;
  }
  if (userCount === 0) return { messages: [], log: slicedLog };
  let seen = 0;
  let end = messages.length;
  for (let i = 0; i < messages.length; i++) {
    if (messages[i]?.role !== "user") continue;
    seen++;
    if (seen === userCount) {
      end = i + 1;
      while (end < messages.length && messages[end]?.role !== "user") end++;
      break;
    }
  }
  return {
    messages: messages.slice(0, end).map((m) => ({ ...m })),
    log: slicedLog,
  };
}

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

export class ChatEngine {
  /** 真正发给模型的历史（user/assistant/tool；system 逐轮组装不入历史）。 */
  private messages: ModelMessage[] = [];
  /** UI 渲染用历史。 */
  readonly log: ChatLogEntry[] = [];

  constructor(private readonly opts: ChatEngineOptions) {}

  clear(): void {
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
  rewindTo(logIndex: number): { removedLog: number; removedMessages: number } {
    if (logIndex < 0 || logIndex >= this.log.length) {
      return { removedLog: 0, removedMessages: 0 };
    }
    if (this.log[logIndex]?.role !== "user") {
      return { removedLog: 0, removedMessages: 0 };
    }
    let userCountBefore = 0;
    for (let i = 0; i < logIndex; i++) {
      if (this.log[i]?.role === "user") userCountBefore++;
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
  dump(): { messages: ModelMessage[]; log: ChatLogEntry[] } {
    return {
      messages: this.messages.map((m) => ({ ...m })),
      log: this.log.map((e) => ({ ...e })),
    };
  }

  /** 反序列化恢复对话。跳过空 / 损坏输入。历史中的 system 消息一律丢弃（v2 逐轮组装）。 */
  restore(state: { messages?: unknown; log?: unknown }): void {
    if (!state || typeof state !== "object") return;
    if (Array.isArray(state.messages)) {
      this.messages = (state.messages as ModelMessage[]).filter((m) => m && m.role !== "system");
    }
    if (Array.isArray(state.log)) {
      this.log.length = 0;
      for (const e of state.log as ChatLogEntry[]) {
        if (e && typeof e === "object" && typeof e.role === "string" && typeof e.text === "string") {
          if (typeof e.finishedAt !== "number" || !Number.isFinite(e.finishedAt)) {
            delete e.finishedAt;
          }
          this.log.push(e);
        }
      }
    }
  }

  async send(userText: string, sendOpts: SendOptions = {}): Promise<{ assistantText: string }> {
    const config = this.opts.getConfig();
    const label = `AI: ${userText.trim().slice(0, 40) || "chat"}`;
    // 逐轮事务：本轮所有命令折叠成一个 undo 原子。事务不回滚 —— 中途失败时
    // 已成功的改动保留（模型下一步自行修正比静默丢工作好）。
    return this.opts.port.transaction(label, () => this.runTurn(userText, config, sendOpts));
  }

  private buildSystem(config: AiConfig, scopeLine?: string): string {
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

  private buildTools(
    config: AiConfig,
    sendOpts: SendOptions,
    port: DocumentPort = this.opts.port,
  ): { tools: Record<string, Tool>; rt: ToolRuntime } {
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
    const tools: Record<string, Tool> = toVercelTools(editDefs, rt);

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

  private async runTurn(
    userText: string,
    config: AiConfig,
    opts: SendOptions,
  ): Promise<{ assistantText: string }> {
    this.messages.push({ role: "user", content: userText });
    this.log.push({ role: "user", text: userText });

    const port = freezePortFocus(this.opts.port);
    const { model } = createLlm(config.text);
    const system = this.buildSystem(
      config,
      this.opts.includeTurnScope === false ? undefined : formatTurnScope(port),
    );
    const { tools } = this.buildTools(config, opts, port);
    const maxSteps = opts.maxSteps ?? DEFAULT_MAX_STEPS;
    const cachedTools = stampToolCache(tools);
    const messages: ModelMessage[] = [...this.messages];
    const providerOptions = llmProviderOptions(config.text.provider, this.opts.cacheKey ?? "ppt-chat");
    if (opts.stream === false) {
      return await withGenerateJsonSlot(() =>
        this.runNonStream(model, cachedTools, messages, opts, maxSteps, providerOptions, system),
      );
    }
    return await withGenerateJsonSlot(() =>
      this.runStream(model, cachedTools, messages, opts, maxSteps, providerOptions, system),
    );
  }

  private async runStream(
    model: LanguageModel,
    tools: Record<string, Tool>,
    messages: ModelMessage[],
    opts: SendOptions,
    maxSteps: number,
    providerOptions: ReturnType<typeof llmProviderOptions>,
    system: string,
  ): Promise<{ assistantText: string }> {
    let collectedText = "";
    let lastAssistantEntry: ChatLogEntry | null = null;
    let streamFailed = false;
    const reportStreamError = (e: unknown) => {
      if (streamFailed) return;
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
            const delta = (chunk as { text?: string }).text ?? "";
            if (!delta) return;
            collectedText += delta;
            if (!lastAssistantEntry) {
              lastAssistantEntry = { role: "assistant", text: delta };
              this.log.push(lastAssistantEntry);
            } else {
              lastAssistantEntry.text += delta;
            }
            opts.onEvent?.({ kind: "text-delta", text: delta });
          } else if (chunk.type === "tool-call") {
            const c = chunk as { toolName: string; input: unknown };
            opts.onEvent?.({ kind: "tool-call", toolName: c.toolName, toolArgs: c.input });
            // 尚未说话就调工具时仍写一条空文本 assistant，当作下一步的分界
            // （重绘时两条工具链不会并成一组）。UI 不渲染 text 为空的气泡。
            if (!lastAssistantEntry) {
              lastAssistantEntry = { role: "assistant", text: "" };
              this.log.push(lastAssistantEntry);
            }
            const calls = lastAssistantEntry.toolCalls ?? (lastAssistantEntry.toolCalls = []);
            calls.push({ name: c.toolName, args: c.input });
          } else if (chunk.type === "tool-result") {
            const c = chunk as { toolName: string; output: unknown };
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
    } catch (e) {
      observeLlmError(e);
      if (!streamFailed) {
        reportStreamError(e);
      }
      throw e;
    }
  }

  private async runNonStream(
    model: LanguageModel,
    tools: Record<string, Tool>,
    messages: ModelMessage[],
    opts: SendOptions,
    maxSteps: number,
    providerOptions: ReturnType<typeof llmProviderOptions>,
    system: string,
  ): Promise<{ assistantText: string }> {
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
              toolName: (r as { toolName?: string }).toolName ?? "",
              toolResult: (r as { output?: unknown }).output,
            });
          }
        },
      });
      this.messages.push(...result.response.messages);
      if (result.text) this.log.push({ role: "assistant", text: result.text });
      stampTurnFinished(this.log);
      opts.onEvent?.({ kind: "turn-finish" });
      return { assistantText: result.text };
    } catch (e) {
      observeLlmError(e);
      const msg = e instanceof Error ? e.message : String(e);
      opts.onEvent?.({ kind: "error", error: msg });
      throw e;
    }
  }
}

/** 本轮最后一条有正文的助手条目记下完成时间。已有时间的不覆盖。 */
function stampTurnFinished(log: ChatLogEntry[], at = Date.now()): void {
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i];
    if (!e) continue;
    if (e.role === "user") return;
    if (e.role === "assistant" && e.text.trim()) {
      if (e.finishedAt == null) e.finishedAt = at;
      return;
    }
  }
}

function freezePortFocus(port: DocumentPort): DocumentPort {
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

function safeStringify(v: unknown): string {
  if (v === undefined) return "undefined";
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}
