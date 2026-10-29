import type { LanguageModel } from "ai";
import type { ZodType } from "zod";
import type { LlmUsage } from "../llm/usage.js";
import type { ModelFilePart } from "../source-files/complete.js";
import type { ResponsesAuth } from "../source-files/support.js";
/** 递归扫描，对 object / array 同等处理；非对象原样返回。 */
export declare function normalizeAliases(v: unknown): unknown;
/**
 * 生成阶段统一的"JSON + 别名归一 + zod 校验"调用（llm/json 的 generate 特化）。
 * postNormalize：schema 专属补丁（如 motion 的 rolesOverride: null → {}），
 * 在别名归一之后、zod 之前跑。
 */
export declare function generateSpecJson<T>(model: LanguageModel, schema: ZodType<T>, system: string, prompt: string, signal: AbortSignal | undefined, postNormalize?: (v: unknown) => unknown, onUsage?: (usage: LlmUsage) => void, timing?: {
    timeoutMs?: number;
    retryOnTimeout?: number;
}, sources?: {
    files?: ModelFilePart[];
    responses?: ResponsesAuth;
}): Promise<T>;
