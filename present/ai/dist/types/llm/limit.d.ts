export declare const LLM_TIMEOUT: {
    readonly stepMs: number;
};
export declare function setGenerateJsonConcurrency(n: number): void;
export declare function isTimeoutLlmError(e: unknown): boolean;
export declare function observeLlmError(e: unknown): number | undefined;
export declare function withGenerateJsonSlot<T>(fn: () => Promise<T>): Promise<T>;
