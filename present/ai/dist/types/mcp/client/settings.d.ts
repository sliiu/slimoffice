import type { UserMcpConfig } from "./types.js";
/** 读某 id 的持久化 enabled；未记录时返回 fallback（descriptor 默认值）。 */
export declare function resolveEnabled(id: string, fallback: boolean): boolean;
/** 设置某个能力项的启用状态（持久化）。 */
export declare function setEnabled(id: string, enabled: boolean): void;
/** toggle（以调用方提供的当前值取反）。 */
export declare function toggleEnabled(id: string, currentValue: boolean): boolean;
/** 删除某 id 的持久化痕迹（user MCP 被 remove 时调用）。 */
export declare function clearEnabled(id: string): void;
export declare function loadUserServers(): UserMcpConfig[];
export declare function saveUserServers(list: UserMcpConfig[]): void;
/** upsert：按 id 替换或追加；返回最新 list。 */
export declare function upsertUserServer(cfg: UserMcpConfig): UserMcpConfig[];
/** 删除某个 user server；返回最新 list。 */
export declare function removeUserServer(id: string): UserMcpConfig[];
