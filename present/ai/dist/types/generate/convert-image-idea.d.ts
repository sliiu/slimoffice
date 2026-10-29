/**
 * Turn outline imagery direction into English stock-photo search keywords.
 */
import type { AiConfig } from "../config/types.js";
export interface ConvertImageIdeaOptions {
    text: string;
    config: AiConfig;
    signal?: AbortSignal;
    slideTitle?: string;
    deckTopic?: string;
}
/**
 * @returns English search line (≤80 chars), or null when input is empty / call failed.
 */
export declare function convertImageIdeaToEnglish(opts: ConvertImageIdeaOptions): Promise<string | null>;
