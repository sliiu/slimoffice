// 工具层类型：中立 ToolDef + ToolRuntime。
//
// v2 核心设计 —— 每个工具只定义一次，两个消费方：
//   - 对话循环：adapters/vercel.ts 把 ToolDef 包成 Vercel AI SDK `Tool`
//   - MCP server：mcp/server 把 ToolDef 注册成 MCP tool（对外暴露 PPT 编辑能力）
//
// ToolDef 与任何 LLM SDK 解耦：inputSchema 是 zod、execute 是普通函数，
// 可直接单测。所有对文档的改动通过 rt.apply(cmd)（内部走 DocumentPort），
// 保证 undo / 协作 / 缩略图刷新契约在两个消费方下一致。
//
// 约定（继承 v1，.cursor/rules/ppt-design-rules.mdc 依赖）：
//   1. mutation 工具的 description 必须提示联动后果（如换背景后查文字对比度）；
//   2. 返回值统一 { ok: true, ... } / { ok: false, error }，失败时给模型明确诊断；
//   3. 定位既有 shape 的工具设 shapeScoped: true —— 适配器自动套 [TURN SCOPE]
//      守卫（见 guard.ts），新工具在定义处声明，不再维护中心名单。

import type { z } from "zod";
import { canApplyEditCommand, type EditCommand, type Presentation } from "@ppt/core";
import type { DocumentPort } from "../kernel/port";
import type { AiConfig } from "../config/types";
import type { HostSkillStore } from "../skills/types";
import type { HostChatStore } from "../chat/types";

export type ToolResult = { ok: true; [k: string]: unknown } | { ok: false; error: string };

export function ok(extra: Record<string, unknown> = {}): ToolResult {
  return { ok: true, ...extra };
}

export function err(msg: string): ToolResult {
  return { ok: false, error: msg };
}

/** 模型自主开关 MCP / Skill 时的事件（宿主消费 → toast / chat log 备注）。 */
export interface CapabilityChangedEvent {
  kind: "mcp" | "skill";
  id: string;
  name: string;
  enabled: boolean;
  scope: "session" | "persistent";
  /** 仅 persistent —— 变更前的旧值，宿主 toast 的 undo 按钮拿来回滚。 */
  previousEnabled?: boolean;
}

/**
 * 工具执行环境。由宿主（ChatEngine / MCP server / 测试）构造一次，注入所有工具。
 */
export interface ToolRuntime {
  /** 文档端口 —— 读文档 / 执行命令 / 焦点选区的唯一入口。 */
  port: DocumentPort;
  /** 每次调用现取配置（跟上用户在 settings tab 的实时修改）。 */
  getConfig: () => AiConfig;

  /** 便捷：port.getPres()。 */
  getPres: () => Presentation;
  /** 便捷：port.execute(cmd) 并折成 ToolResult（异常 → ok:false）。 */
  apply: (cmd: EditCommand) => ToolResult;

  // ---- 宿主可选钩子 ------------------------------------------------------
  /** 当前 PPT id（chat-history 工具组用）。 */
  presentationId?: string | undefined;
  /** 宿主聊天存储（chat-history 工具组用）。 */
  hostChatStore?: HostChatStore | undefined;
  /** 宿主 user skill 存储（capability 工具组用）。 */
  hostSkillStore?: HostSkillStore | undefined;
  /** 模型自主改 capability 状态后的事件（宿主 → toast + undo）。 */
  onCapabilityChanged?: ((e: CapabilityChangedEvent) => void) | undefined;
  /** 写本轮 MCP session override（chat composer chip 同源）。 */
  setMcpSessionOverride?: ((id: string, enabled: boolean | null) => void) | undefined;
  /** 读本轮 MCP session override。 */
  getMcpSessionOverride?: ((id: string) => boolean | null) | undefined;
  /** suggest_open_settings 请求宿主切 Settings tab 并高亮字段。 */
  onOpenSettings?: ((fields: string[], reason: string) => void) | undefined;
}

export interface ToolRuntimeOptions {
  port: DocumentPort;
  getConfig: () => AiConfig;
  presentationId?: string;
  hostChatStore?: HostChatStore;
  hostSkillStore?: HostSkillStore;
  onCapabilityChanged?: (e: CapabilityChangedEvent) => void;
  setMcpSessionOverride?: (id: string, enabled: boolean | null) => void;
  getMcpSessionOverride?: (id: string) => boolean | null;
  onOpenSettings?: (fields: string[], reason: string) => void;
}

export function createToolRuntime(opts: ToolRuntimeOptions): ToolRuntime {
  return {
    port: opts.port,
    getConfig: opts.getConfig,
    getPres: () => opts.port.getPres(),
    apply: (cmd: EditCommand): ToolResult => {
      try {
        if (!canApplyEditCommand(opts.port.getPres(), cmd)) {
          return err(
            "Presentation is protected (editing blocked). Call unprotectPresentation first (password required if listProtectionStatus.passwordRequired is true).",
          );
        }
        opts.port.execute(cmd);
        return ok();
      } catch (e) {
        return err((e as Error).message);
      }
    },
    presentationId: opts.presentationId,
    hostChatStore: opts.hostChatStore,
    hostSkillStore: opts.hostSkillStore,
    onCapabilityChanged: opts.onCapabilityChanged,
    setMcpSessionOverride: opts.setMcpSessionOverride,
    getMcpSessionOverride: opts.getMcpSessionOverride,
    onOpenSettings: opts.onOpenSettings,
  };
}

/** 工具标签：注册表按域组织 + 消费方过滤（如 MCP server 只暴露非 capability 工具）。 */
export type ToolTag =
  | "read"
  | "mutate"
  | "slide"
  | "shape"
  | "text"
  | "table"
  | "chart"
  | "image"
  | "effect"
  | "wordart"
  | "master"
  | "theme"
  | "motion"
  | "animation"
  | "capability"
  | "llm";

// In 默认 any：异构工具集合（ToolDef[]）需要宽松的元素类型；execute 用方法签名
// （而非属性箭头类型）保持参数双变，让 ToolDef<具体入参> 可赋给 ToolDef。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ToolDef<In = any> {
  /** 唯一名（camelCase 或 snake_case，沿用 v1 命名以保持 prompt 兼容）。 */
  name: string;
  description: string;
  /** zod object schema —— 同时供 Vercel AI SDK 与 MCP server（转 JSON Schema）。 */
  inputSchema: z.ZodType<In>;
  tags: readonly ToolTag[];
  /**
   * true = 该工具通过 shapeId / shapeIds 定位**既有** shape，适配器自动套
   * [TURN SCOPE] 选区守卫。新建 shape 的工具（insertShape 等）不设。
   */
  shapeScoped?: boolean;
  execute(rt: ToolRuntime, input: In): Promise<unknown> | unknown;
}

/** 定义工具的工厂 —— 只为类型推断（In 从 schema 推出），无运行时逻辑。 */
export function defineTool<S extends z.ZodType>(def: {
  name: string;
  description: string;
  inputSchema: S;
  tags: readonly ToolTag[];
  shapeScoped?: boolean;
  execute: (rt: ToolRuntime, input: z.infer<S>) => Promise<unknown> | unknown;
}): ToolDef<z.infer<S>> {
  return def as ToolDef<z.infer<S>>;
}
