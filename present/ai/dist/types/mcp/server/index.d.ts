import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Presentation } from "@sliiu/present-core";
import { type DocumentPort } from "../../kernel/port.js";
import { type AiConfig } from "../../config/types.js";
/** 宿主注入的 deck 存取抽象（gateway：云存储 + E2E 解密 / 测试：内存）。 */
export interface PptMcpDeckStore {
    list(): Promise<Array<{
        deckId: string;
        name: string;
        slideCount: number;
        updatedAt?: number;
    }>>;
    load(deckId: string): Promise<Presentation>;
    save(deckId: string, pres: Presentation): Promise<void>;
}
/**
 * 会话状态：当前打开的 deck。由宿主持有（gateway 按用户 + TTL），
 * server 实例每请求新建也能接着编辑。
 */
export interface PptMcpSession {
    deckId: string | null;
    /** 用 open_pptx 打开时的绝对路径。save_pptx / save_presentation 写回这里。 */
    filePath: string | null;
    port: DocumentPort | null;
    /** 打开后有未保存改动。 */
    dirty: boolean;
    /** 最近活动时间（宿主做空闲回收用）。 */
    lastActiveAt: number;
}
export declare function createPptMcpSession(): PptMcpSession;
export interface CreatePptMcpServerOptions {
    decks: PptMcpDeckStore;
    session: PptMcpSession;
    /** LLM/图库配置（generateAndApplyTheme / generateImage 等 llm 工具用）；缺省为空配置（相关工具会返回"未配置"）。 */
    getConfig?: () => AiConfig;
    serverInfo?: {
        name?: string;
        version?: string;
    };
    /**
     * Register `generate_presentation` (topic → full deck through the same pipeline as the online
     * generator). Spends the host's model budget, so it is opt-in: the local stdio server turns it on;
     * the gateway leaves it off until generation over MCP is metered.
     */
    enableGenerate?: boolean;
    /**
     * Rasterize one slide to PNG. When set, `render_slide` is registered (an agent can look at what
     * it built) and `generate_presentation` gets the visual review round.
     */
    renderSlide?: (pres: Presentation, slideIdx: number, opts: {
        width: number;
    }) => Promise<Uint8Array>;
}
export declare function createPptMcpServer(opts: CreatePptMcpServerOptions): McpServer;
