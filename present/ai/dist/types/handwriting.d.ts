import type { AiConfig } from "./config/types.js";
export interface RecognizeHandwritingInput {
    dataUrl: string;
    strokeCount: number;
    lang: string;
}
export declare function recognizeHandwritingImage(config: AiConfig, input: RecognizeHandwritingInput): Promise<{
    text: string;
} | null>;
