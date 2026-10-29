export interface LlmUsage {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_tokens?: number;
    cache_creation_tokens?: number;
}
export declare function extractLlmUsage(source: unknown): LlmUsage | undefined;
