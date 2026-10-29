import { type AiConfig } from "./types.js";
export interface ConfigStore {
    load(): AiConfig;
    save(config: AiConfig): void;
}
/** localStorage 持久化（浏览器宿主）。API key 明文存储，永不离开当前浏览器。 */
export declare function browserConfigStore(storageKey?: string): ConfigStore;
/**
 * 环境变量只读 store（Node 宿主）。save 为 no-op。
 *
 * 变量映射（均可省略）：
 *   AI_PROVIDER / AI_MODEL / AI_API_KEY / AI_BASE_URL / AI_PROXY_URL / AI_TEXT_CONCURRENCY
 *   AI_IMAGE_PROVIDER / AI_IMAGE_API_KEY / AI_IMAGE_BASE_URL / AI_IMAGE_MODEL / AI_IMAGE_SIZE
 *   UNSPLASH_KEY / PEXELS_KEY
 */
export declare function envConfigStore(env?: Record<string, string | undefined>): ConfigStore;
/** 内存 store（测试 / headless 会话内临时覆盖）。 */
export declare function memoryConfigStore(initial?: Partial<AiConfig>): ConfigStore;
