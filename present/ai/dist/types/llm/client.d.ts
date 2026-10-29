import type { LanguageModel } from "ai";
import { type TextConfig } from "../config/types.js";
export interface LlmClient {
    model: LanguageModel;
    /** UI 状态栏 / 错误信息里使用（如 "OpenAI · gpt-4o-mini"）。 */
    label: string;
}
export declare function createLlm(text: TextConfig): LlmClient;
