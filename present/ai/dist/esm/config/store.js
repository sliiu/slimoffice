// ConfigStore：AiConfig 的持久化抽象。
//
// @sliiu/present-ai 内部不直读 localStorage / env —— 宿主注入 store：
//   - 浏览器（playground）→ browserConfigStore()
//   - Node（MCP server / gateway / 测试）→ envConfigStore() 或 memoryConfigStore()
//
// 所有 store 的 load() 永远返回完整 AiConfig（zod 兜底），不抛错。
import { parseConfig } from "./types.js";
const BROWSER_STORAGE_KEY = "ppt.ai.config";
/** localStorage 持久化（浏览器宿主）。API key 明文存储，永不离开当前浏览器。 */
export function browserConfigStore(storageKey = BROWSER_STORAGE_KEY) {
    return {
        load() {
            if (typeof localStorage === "undefined")
                return parseConfig({});
            try {
                const raw = localStorage.getItem(storageKey);
                return parseConfig(raw ? JSON.parse(raw) : {});
            }
            catch {
                return parseConfig({});
            }
        },
        save(config) {
            if (typeof localStorage === "undefined")
                return;
            localStorage.setItem(storageKey, JSON.stringify(config));
        },
    };
}
/**
 * 环境变量只读 store（Node 宿主）。save 为 no-op。
 *
 * 变量映射（均可省略）：
 *   AI_PROVIDER / AI_MODEL / AI_API_KEY / AI_BASE_URL / AI_PROXY_URL / AI_TEXT_CONCURRENCY
 *   AI_IMAGE_PROVIDER / AI_IMAGE_API_KEY / AI_IMAGE_BASE_URL / AI_IMAGE_MODEL / AI_IMAGE_SIZE
 *   UNSPLASH_KEY / PEXELS_KEY
 */
export function envConfigStore(env = process.env) {
    const pick = (key) => {
        const v = env[key];
        return v && v.trim() ? v.trim() : undefined;
    };
    return {
        load() {
            return parseConfig({
                text: {
                    provider: pick("AI_PROVIDER"),
                    model: pick("AI_MODEL"),
                    apiKey: pick("AI_API_KEY"),
                    baseURL: pick("AI_BASE_URL"),
                    proxyUrl: pick("AI_PROXY_URL"),
                    concurrency: Number.parseInt(pick("AI_TEXT_CONCURRENCY") ?? "", 10) || undefined,
                },
                image: {
                    provider: pick("AI_IMAGE_PROVIDER"),
                    apiKey: pick("AI_IMAGE_API_KEY"),
                    baseURL: pick("AI_IMAGE_BASE_URL"),
                    model: pick("AI_IMAGE_MODEL"),
                    size: pick("AI_IMAGE_SIZE"),
                },
                imagery: {
                    unsplashKey: pick("UNSPLASH_KEY"),
                    pexelsKey: pick("PEXELS_KEY"),
                },
            });
        },
        save() {
            // env 配置只读。
        },
    };
}
/** 内存 store（测试 / headless 会话内临时覆盖）。 */
export function memoryConfigStore(initial) {
    let current = parseConfig(initial ?? {});
    return {
        load: () => current,
        save: (config) => {
            current = config;
        },
    };
}
