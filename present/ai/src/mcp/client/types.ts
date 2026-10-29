// MCP 客户端（对内方向）类型层。
//
// v2 设计：
//   1. **builtin 工具组**（stock-images / stock-fonts / chat-history）不再是
//      "in-process MCP server"，而是基于 ToolRegistry 的普通 ToolDef 工具组 ——
//      与内置编辑工具同构，仅多了一层"能力开关"（enabled / ready / missing）。
//      运行时（config / port / hostChatStore）在执行时从 ToolRuntime 取，
//      不再靠 createTools(ctx) 闭包注入。
//   2. **用户远端 MCP**（HTTP / Streamable HTTP / SSE）继续走 @ai-sdk/mcp
//      客户端连接池，工具在连接时拉取缓存，逐轮合并进对话工具集。
//   3. UI 视图（McpServerView）与能力管理心智保持 v1：list / enabled / ready /
//      missing / runtime，builtin 与 user 并列展示在 Capabilities tab。

import type { AiConfig } from "../../config/types";
import type { ToolDef } from "../../tools/types";

/** builtin 工具组描述：一组 ToolDef + 能力开关元数据。 */
export interface BuiltinToolGroup {
  /** 唯一 id（lower_snake；与工具名前缀一致，如 stock_images）。 */
  id: string;
  /** UI 显示名。 */
  name: string;
  /** 一行描述（UI hover）。 */
  description: string;
  /** 详细说明（UI 详情面板）。 */
  detail?: string;
  /** Lucide 图标 id（kebab-case）。 */
  icon?: string;
  /** 默认是否启用。隐私敏感（chat-history）默认 false。 */
  defaultEnabled: boolean;
  /** 仅对话侧出现（生成向导不展示）。 */
  chatOnly?: boolean;
  /** 高隐私标记：list_capabilities 暴露给模型，UI 据此走 confirm。 */
  privacySensitive?: boolean;
  /** 缺失的配置字段（如 ["unsplashKey"]）；null = 就绪。 */
  requirements?: (config: AiConfig) => string[] | null;
  /** 该组暴露的工具（静态定义；运行时由适配器注入）。 */
  tools: ToolDef[];
}

/**
 * 用户在 UI 里添加的远端 MCP 服务器的持久化配置。
 *
 * 浏览器内无法跑 stdio 子进程，所以仅支持远端 HTTP / SSE transport。`headers`
 * 是可选的 HTTP 头（如 `Authorization: Bearer xxx`）；明文存 localStorage，
 * UI 必须告诉用户"凭据明文存储于浏览器，仅在你信任的机器上添加"。
 *
 * id 必须以 `user_` 前缀，避免与 builtin id 冲突（registry 强校验）。
 */
export interface UserMcpConfig {
  /** 必须以 `user_` 开头；UI 生成（如 `user_${Date.now()}`）。 */
  id: string;
  name: string;
  description?: string;
  /** Lucide 图标 id；缺省 UI 渲染 `puzzle`。 */
  icon?: string;
  /** HTTP（Streamable HTTP，推荐）或 SSE。 */
  transport: "http" | "sse";
  /** MCP server 端点 URL。 */
  url: string;
  /** 可选自定义 HTTP 头（如 Authorization / X-Api-Key）。 */
  headers?: Record<string, string>;
}

/** 每个能力项的持久化开关状态。 */
export interface McpEnabledState {
  id: string;
  enabled: boolean;
}

/** registry 给宿主 UI 的合并视图（builtin 工具组与 user 远端统一形态）。 */
export interface McpServerView {
  id: string;
  name: string;
  description: string;
  detail?: string | undefined;
  icon?: string | undefined;
  /** builtin = 仓库内置工具组；user = 用户添加的远端 MCP。 */
  runtime: "builtin" | "user";
  /** runtime="user" 时的原始配置（UI 编辑卡片回填表单）。 */
  userConfig?: UserMcpConfig | undefined;
  enabled: boolean;
  /** requirements 全部满足时 true。 */
  ready: boolean;
  /** ready=false 时的缺项列表（如 ["unsplashKey"] / ["connection"]）。 */
  missing: string[];
  chatOnly: boolean;
  privacySensitive: boolean;
  /** runtime="user"：当前已连接时的远端工具名（卡片副标题）。 */
  toolNames?: string[] | undefined;
}
