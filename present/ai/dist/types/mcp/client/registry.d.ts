import type { Tool } from "ai";
import type { AiConfig } from "../../config/types.js";
import type { ToolRuntime } from "../../tools/types.js";
import { type ConnectError, type ConnectResult } from "./remote.js";
import type { BuiltinToolGroup, McpServerView, UserMcpConfig } from "./types.js";
/**
 * 当前内置的工具组列表（编译期常量）。改动这里 = 增删 builtin 能力。
 * 顺序决定 UI 上的展示顺序（常用的放前面）。
 */
export declare const BUILTIN_TOOL_GROUPS: BuiltinToolGroup[];
/**
 * 解析当前所有能力项的「视图」：UI 拿这个渲染 Capabilities tab。
 * 每次调用都现读 localStorage —— 廉价，避免缓存不一致。
 */
export declare function listServers(config: AiConfig): McpServerView[];
/** 取单个能力项视图（capability 工具用）。 */
export declare function getServerView(id: string, config: AiConfig): McpServerView | undefined;
export interface EnabledToolsOptions {
    /** 本轮额外强制启用的 id（chat composer 上"点亮"的 chip）。 */
    extraEnabled?: ReadonlyArray<string>;
    /** 本轮额外强制禁用的 id。 */
    extraDisabled?: ReadonlyArray<string>;
}
/**
 * 合并所有「开启 + ready」能力项的工具，作为额外 tool 注入给模型。
 *
 * 失败的项直接跳过（registry 永远不抛错，保持模型可用）；原因走 console.warn。
 */
export declare function getEnabledTools(rt: ToolRuntime, options?: EnabledToolsOptions): Record<string, Tool>;
/**
 * 新增 / 更新一个用户 MCP server。
 *
 * 流程：先 await pool.connect 拉取远端 tools；只有连接成功才写入持久化 list。
 * 失败时不入库（避免"显示存在但永远连不上"的死状态）。
 */
export declare function addUserMcpServer(cfg: UserMcpConfig): Promise<ConnectResult | ConnectError>;
/** 测试用户填的配置能否连上、能拉到哪些工具 —— 不入库不缓存。 */
export declare function testUserMcpConnection(cfg: UserMcpConfig): Promise<ConnectResult | ConnectError>;
/** 删除一个用户 MCP server：close client + 清持久化 + 清 enabled flag。 */
export declare function removeUserMcpServer(id: string): Promise<void>;
/** 用最新持久化里的 cfg 重新连接某个用户 MCP（不改 cfg 内容）。 */
export declare function reconnectUserMcpServer(id: string): Promise<ConnectResult | ConnectError>;
/** UI 用：查 cache 里当前已连接的 tool 名（卡片副标题渲染）。 */
export declare function getUserMcpToolNames(id: string): string[];
/** UI 用：是否已经连上（卡片上的"已连接 / 未连接"徽章）。 */
export declare function isUserMcpConnected(id: string): boolean;
export { setEnabled, toggleEnabled, loadUserServers } from "./settings.js";
export type { ConnectResult, ConnectError } from "./remote.js";
export type { BuiltinToolGroup, McpServerView, UserMcpConfig } from "./types.js";
