import type { Tool } from "ai";
import { type MCPClientConfig } from "@ai-sdk/mcp";
import type { UserMcpConfig } from "./types.js";
export interface ConnectResult {
    ok: true;
    toolNames: string[];
    serverName?: string;
    serverVersion?: string;
}
export interface ConnectError {
    ok: false;
    error: string;
}
/**
 * 连接池：进程内单例。每个 user MCP id 至多一份 client。
 *
 * 不做自动重连：用户改 URL / headers 时自然 disconnect+connect；
 * 服务器主动断开就让下一次 send 看到空 tools，用户自己点"重连"。
 */
export declare class UserMcpClientPool {
    private cache;
    /**
     * 用 cfg 建立连接并把 tools 拉下来缓存。若 id 之前已有 client 则先 close。
     * 永不抛错；返回 ok=false 时调用方负责 UI 提示。
     */
    connect(cfg: UserMcpConfig): Promise<ConnectResult | ConnectError>;
    /**
     * 像 connect 一样跑完整握手，但完成后立刻 close —— 不留 cache。
     * UI"测试连接"按钮用。
     */
    test(cfg: UserMcpConfig): Promise<ConnectResult | ConnectError>;
    /** 同步出口：合并工具集时读。未连接时返回空对象。 */
    getCachedTools(id: string): Record<string, Tool>;
    isConnected(id: string): boolean;
    getCachedToolNames(id: string): string[];
    /** 关闭某 id 的 client + 清缓存。无该 id 时 no-op。 */
    disconnect(id: string): Promise<void>;
    /** 进程销毁时调用（如 vite HMR dispose）；预留。 */
    disposeAll(): Promise<void>;
    private buildConfig;
}
/**
 * UserMcpConfig → @ai-sdk/mcp 客户端配置。独立成纯函数以便测试。
 *
 * `fetch` 必须显式传包装函数：@ai-sdk/mcp（≤1.0.83）把 `globalThis.fetch` 存成
 * transport 实例属性再 `this.fetchFn(...)` 调用；浏览器里 `window.fetch` 的 this
 * 变成 transport 实例 → "Failed to execute 'fetch' on 'Window': Illegal invocation"，
 * 任何远端 MCP 都连不上。Node 的 undici 不检查 this，所以 headless 测试发现不了。
 */
export declare function buildMcpClientConfig(cfg: UserMcpConfig): MCPClientConfig;
/** 模块级单例 —— 全 app 共用。 */
export declare const userMcpPool: UserMcpClientPool;
