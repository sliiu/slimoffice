export declare const GENERATE_WALL_MS: number;
export declare const GENERATE_TIMEOUT_KIND = "generate-timeout";
export declare const GENERATE_PAUSE_KIND = "generate-pause";
type WallTimer = ReturnType<typeof setTimeout> | number;
export interface GenerateWallClockOptions {
    wallMs?: number;
    now?: () => number;
    startedAt?: number;
    setTimeoutFn?: (handler: () => void, ms: number) => WallTimer;
    clearTimeoutFn?: (id: WallTimer) => void;
    onTimeout?: () => void;
}
export declare function abortError(): Error;
export declare function generateTimeoutError(): Error;
export declare function generatePauseError(): Error;
export declare function isAbortError(e: unknown): boolean;
export declare function isGenerateTimeoutError(e: unknown): boolean;
export declare function isGeneratePauseError(e: unknown): boolean;
export declare function throwIfAborted(signal?: AbortSignal | null): void;
export declare function rethrowIfAborted(signal: AbortSignal | undefined, err: unknown): void;
export declare function shouldCommitGeneratedDeck(signal?: AbortSignal | null): boolean;
export type GenerateEndKind = "timed-out" | "paused" | "cancelled" | "gate-failed" | "design-gate-failed" | "failed";
export declare function classifyGenerateEndError(e: unknown, signal?: AbortSignal | null): GenerateEndKind;
export declare function startGenerateWallClock(ac: AbortController, opts?: GenerateWallClockOptions): () => void;
export declare function bindGenerateWallClock(parent: AbortSignal | undefined, wallClock?: false | GenerateWallClockOptions): {
    signal: AbortSignal;
    dispose: () => void;
};
export declare function withGenerateWallClock<TOpts extends {
    signal?: AbortSignal;
    wallClock?: false | GenerateWallClockOptions;
}, T>(opts: TOpts, run: (opts: TOpts) => Promise<T>): Promise<T>;
export {};
