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
    wallDeadline?: number;
}, T>(opts: TOpts, run: (opts: TOpts) => Promise<T>): Promise<T>;
/** Time an optional step may take; see `optionalStepBox`. */
export interface OptionalStepBox {
    signal: AbortSignal;
    /** True when the box ran out (not the parent run): the step is skipped, the deck is kept. */
    expired: () => boolean;
    /** Milliseconds before the box runs out; Infinity without a deadline. */
    left: () => number;
    dispose: () => void;
}
/**
 * Time box for an optional step (vision review, art director) inside a run with a wall clock:
 * it gets what is left before `deadline` minus `reserveMs` for the steps after it, and is skipped
 * (undefined) when that is under `minMs`. Without a box a slow reviewer runs into the wall clock,
 * and the timeout fails the whole generate — throwing away a deck that was already finished.
 */
export declare function optionalStepBox(parent: AbortSignal | undefined, deadline: number | undefined, opts: {
    reserveMs: number;
    minMs: number;
    now?: () => number;
}): OptionalStepBox | undefined;
export {};
