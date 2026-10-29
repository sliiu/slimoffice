import { type LanguageModel } from "ai";
import type { ZodType } from "zod";
import { type ModelFilePart } from "../source-files/complete.js";
import type { ResponsesAuth } from "../source-files/support.js";
import { type LlmUsage } from "./usage.js";
/**
 * 剥掉 markdown ```json ... ``` / ``` ... ``` 围栏。某些模型不管你怎么要求
 * "no fences" 还是会包一层；宽容兜底，避免一行 backtick 让整个流程白跑。
 */
export declare function stripJsonFences(s: string): string;
export interface GenerateJsonOptions<T> {
    model: LanguageModel;
    schema: ZodType<T>;
    /** 系统提示（应含字段骨架说明）。 */
    system: string;
    prompt: string;
    signal?: AbortSignal | undefined;
    /**
     * schema 专属归一化：在 JSON.parse 之后、zod 之前跑。
     * 调用方在这里做别名映射 / 缺省字段补全（如 rolesOverride: null → {}）。
     */
    normalize?: (v: unknown) => unknown;
    onUsage?: (usage: LlmUsage) => void;
    /** Debug tap: the model's JSON as parsed, before normalize / zod (also fired on attempts that fail validation). */
    onRaw?: (parsed: unknown) => void;
    /** Per-call step timeout; defaults to LLM_TIMEOUT.stepMs (8 min). Short stages (outline) pass less. */
    timeoutMs?: number;
    /** How many times to retry after a timeout / transport error (not after a user abort). Default 0. */
    retryOnTimeout?: number;
    /** 源文件字节。有 openai-responses 时整次走 OpenAI 文件输入。 */
    files?: ModelFilePart[];
    responses?: ResponsesAuth;
}
/**
 * 一次"生成 JSON + zod 校验"的完整循环，失败重试 1 次（把校验报错回喂给模型）。
 * 弱模型常因漏字段 / 用 alias 翻车，一次显式反馈后多半能改对 —— 通用且廉价的容错。
 */
export declare function generateJson<T>(opts: GenerateJsonOptions<T>): Promise<T>;
