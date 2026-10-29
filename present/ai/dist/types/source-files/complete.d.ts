import { type LanguageModel } from "ai";
import type { ResponsesAuth } from "./support.js";
export interface ModelFilePart {
    name: string;
    mediaType: string;
    bytes: Uint8Array;
    route: "chat" | "openai-responses";
}
export declare function completeWithFiles(args: {
    model: LanguageModel;
    system: string;
    prompt: string;
    files: ModelFilePart[];
    responses?: ResponsesAuth;
    signal?: AbortSignal;
    timeoutMs?: number;
}): Promise<string>;
