import type { z } from "zod";
import { type EditCommand, type Presentation } from "@sliiu/present-core";
import type { DocumentPort } from "../kernel/port.js";
import type { AiConfig } from "../config/types.js";
import type { HostSkillStore } from "../skills/types.js";
import type { HostChatStore } from "../chat/types.js";
export type ToolResult = {
    ok: true;
    [k: string]: unknown;
} | {
    ok: false;
    error: string;
};
export declare function ok(extra?: Record<string, unknown>): ToolResult;
export declare function err(msg: string): ToolResult;
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
export declare function createToolRuntime(opts: ToolRuntimeOptions): ToolRuntime;
/** 工具标签：注册表按域组织 + 消费方过滤（如 MCP server 只暴露非 capability 工具）。 */
export type ToolTag = "read" | "mutate" | "slide" | "shape" | "text" | "table" | "chart" | "image" | "effect" | "wordart" | "master" | "theme" | "motion" | "animation" | "capability" | "llm";
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
export declare function defineTool<S extends z.ZodType>(def: {
    name: string;
    description: string;
    inputSchema: S;
    tags: readonly ToolTag[];
    shapeScoped?: boolean;
    execute: (rt: ToolRuntime, input: z.infer<S>) => Promise<unknown> | unknown;
}): ToolDef<z.infer<S>>;
