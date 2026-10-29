// 用户自定义 HTTP/SSE MCP 的客户端池（@ai-sdk/mcp）。
//
// 设计取向：
//   1. 同步出口：chat 组装工具集的链路是同步的，不能 await。所以每个用户 MCP
//      在"添加时 / 重连时"主动 connect，把远端 tools 拉下来缓存；合并工具集时
//      直接读 cache，没缓存就是空（UI 显示"未连接"）。
//   2. 单例池：模块级 `userMcpPool`，进程内统一管理生命周期。
//   3. 失败语义：connect 永远不抛错；返回 { ok: false, error }。最常见的 error
//      是浏览器 CORS —— 做一次启发式改写让用户看到有指向性的提示。
//   4. close on remove：用户删 server / 改 URL 后旧 client 必须 close()
//      释放连接（尤其 SSE 会持开）。

import type { Tool } from "ai";
import {
  createMCPClient,
  type MCPClient,
  type MCPClientConfig,
} from "@ai-sdk/mcp";
import type { UserMcpConfig } from "./types";

interface CachedEntry {
  client: MCPClient;
  tools: Record<string, Tool>;
  toolNames: string[];
  /** 最后连接成功的时间戳（用于 UI 显示）。 */
  connectedAt: number;
}

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
 * 把任意异常归一化为短的、对用户友好的错误字符串。
 * 重点处理浏览器 CORS（fetch 抛 "Failed to fetch"）这种最常见的坑。
 */
function describeConnectError(e: unknown, url: string): string {
  const raw = (e as Error)?.message ?? String(e);
  const lc = raw.toLowerCase();
  if (
    lc.includes("failed to fetch") ||
    lc.includes("networkerror") ||
    lc.includes("load failed") ||
    lc.includes("cors")
  ) {
    return `Network or CORS error reaching ${url}. The MCP server must allow cross-origin requests from this page (Access-Control-Allow-Origin / Allow-Headers). Original: ${raw}`;
  }
  if (lc.includes("redirect")) {
    return `Server attempted an HTTP redirect (blocked for safety). Use the final URL directly. Original: ${raw}`;
  }
  return raw;
}

/**
 * 连接池：进程内单例。每个 user MCP id 至多一份 client。
 *
 * 不做自动重连：用户改 URL / headers 时自然 disconnect+connect；
 * 服务器主动断开就让下一次 send 看到空 tools，用户自己点"重连"。
 */
export class UserMcpClientPool {
  private cache = new Map<string, CachedEntry>();

  /**
   * 用 cfg 建立连接并把 tools 拉下来缓存。若 id 之前已有 client 则先 close。
   * 永不抛错；返回 ok=false 时调用方负责 UI 提示。
   */
  async connect(cfg: UserMcpConfig): Promise<ConnectResult | ConnectError> {
    await this.disconnect(cfg.id);
    let client: MCPClient | null = null;
    try {
      client = await createMCPClient(this.buildConfig(cfg));
      const tools = await client.tools();
      const toolNames = Object.keys(tools);
      const entry: CachedEntry = {
        client,
        tools: tools as unknown as Record<string, Tool>,
        toolNames,
        connectedAt: Date.now(),
      };
      this.cache.set(cfg.id, entry);
      return {
        ok: true,
        toolNames,
        serverName: client.serverInfo?.name,
        serverVersion: client.serverInfo?.version,
      };
    } catch (e) {
      // 失败必须 close 已开的 client（如果有），否则 SSE / fetch 句柄会泄漏。
      if (client) {
        try {
          await client.close();
        } catch {
          // ignore
        }
      }
      return { ok: false, error: describeConnectError(e, cfg.url) };
    }
  }

  /**
   * 像 connect 一样跑完整握手，但完成后立刻 close —— 不留 cache。
   * UI"测试连接"按钮用。
   */
  async test(cfg: UserMcpConfig): Promise<ConnectResult | ConnectError> {
    let client: MCPClient | null = null;
    try {
      client = await createMCPClient(this.buildConfig(cfg));
      const tools = await client.tools();
      const toolNames = Object.keys(tools);
      return {
        ok: true,
        toolNames,
        serverName: client.serverInfo?.name,
        serverVersion: client.serverInfo?.version,
      };
    } catch (e) {
      return { ok: false, error: describeConnectError(e, cfg.url) };
    } finally {
      if (client) {
        try {
          await client.close();
        } catch {
          // ignore
        }
      }
    }
  }

  /** 同步出口：合并工具集时读。未连接时返回空对象。 */
  getCachedTools(id: string): Record<string, Tool> {
    return this.cache.get(id)?.tools ?? {};
  }

  isConnected(id: string): boolean {
    return this.cache.has(id);
  }

  getCachedToolNames(id: string): string[] {
    return this.cache.get(id)?.toolNames ?? [];
  }

  /** 关闭某 id 的 client + 清缓存。无该 id 时 no-op。 */
  async disconnect(id: string): Promise<void> {
    const entry = this.cache.get(id);
    if (!entry) return;
    this.cache.delete(id);
    try {
      await entry.client.close();
    } catch {
      // ignore
    }
  }

  /** 进程销毁时调用（如 vite HMR dispose）；预留。 */
  async disposeAll(): Promise<void> {
    const ids = Array.from(this.cache.keys());
    for (const id of ids) await this.disconnect(id);
  }

  private buildConfig(cfg: UserMcpConfig): MCPClientConfig {
    return buildMcpClientConfig(cfg);
  }
}

/**
 * UserMcpConfig → @ai-sdk/mcp 客户端配置。独立成纯函数以便测试。
 *
 * `fetch` 必须显式传包装函数：@ai-sdk/mcp（≤1.0.83）把 `globalThis.fetch` 存成
 * transport 实例属性再 `this.fetchFn(...)` 调用；浏览器里 `window.fetch` 的 this
 * 变成 transport 实例 → "Failed to execute 'fetch' on 'Window': Illegal invocation"，
 * 任何远端 MCP 都连不上。Node 的 undici 不检查 this，所以 headless 测试发现不了。
 */
export function buildMcpClientConfig(cfg: UserMcpConfig): MCPClientConfig {
  return {
    transport: {
      type: cfg.transport,
      url: cfg.url,
      ...(cfg.headers && Object.keys(cfg.headers).length > 0 ? { headers: cfg.headers } : {}),
      // 显式拒绝 redirect：MCP server 不应在握手时跳来跳去，跳了基本是配错了 URL。
      redirect: "error",
      fetch: (input, init) => globalThis.fetch(input, init),
    },
    clientName: "ppt-convert-mcp-client",
  };
}

/** 模块级单例 —— 全 app 共用。 */
export const userMcpPool = new UserMcpClientPool();
