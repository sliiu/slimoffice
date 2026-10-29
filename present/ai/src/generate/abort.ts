export const GENERATE_WALL_MS = 12 * 60 * 1000;
export const GENERATE_TIMEOUT_KIND = "generate-timeout";
export const GENERATE_PAUSE_KIND = "generate-pause";

type WallTimer = ReturnType<typeof setTimeout> | number;

export interface GenerateWallClockOptions {
  wallMs?: number;
  now?: () => number;
  startedAt?: number;
  setTimeoutFn?: (handler: () => void, ms: number) => WallTimer;
  clearTimeoutFn?: (id: WallTimer) => void;
  onTimeout?: () => void;
}

export function abortError(): Error {
  const err = new Error("Aborted");
  err.name = "AbortError";
  return err;
}

export function generateTimeoutError(): Error {
  const err = new Error("Generate timed out");
  err.name = "AbortError";
  (err as { kind?: string }).kind = GENERATE_TIMEOUT_KIND;
  return err;
}

export function generatePauseError(): Error {
  const err = new Error("Generate paused");
  err.name = "AbortError";
  (err as { kind?: string }).kind = GENERATE_PAUSE_KIND;
  return err;
}

export function isAbortError(e: unknown): boolean {
  if (e instanceof DOMException && e.name === "AbortError") return true;
  if (e instanceof Error && e.name === "AbortError") return true;
  const msg = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  return /\babort(ed)?\b/i.test(msg);
}

export function isGenerateTimeoutError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  return (e as { kind?: unknown }).kind === GENERATE_TIMEOUT_KIND;
}

export function isGeneratePauseError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  return (e as { kind?: unknown }).kind === GENERATE_PAUSE_KIND;
}

export function throwIfAborted(signal?: AbortSignal | null): void {
  if (!signal?.aborted) return;
  if (isGenerateTimeoutError(signal.reason)) {
    throw signal.reason instanceof Error ? signal.reason : generateTimeoutError();
  }
  if (isGeneratePauseError(signal.reason)) {
    throw signal.reason instanceof Error ? signal.reason : generatePauseError();
  }
  throw abortError();
}

export function rethrowIfAborted(signal: AbortSignal | undefined, err: unknown): void {
  throwIfAborted(signal);
  if (isGenerateTimeoutError(err) || isGeneratePauseError(err) || isAbortError(err)) throw err;
}

export function shouldCommitGeneratedDeck(signal?: AbortSignal | null): boolean {
  return !signal?.aborted;
}

export type GenerateEndKind =
  | "timed-out"
  | "paused"
  | "cancelled"
  | "gate-failed"
  | "design-gate-failed"
  | "failed";

export function classifyGenerateEndError(e: unknown, signal?: AbortSignal | null): GenerateEndKind {
  if (isGenerateTimeoutError(e) || isGenerateTimeoutError(signal?.reason)) return "timed-out";
  if (isGeneratePauseError(e) || isGeneratePauseError(signal?.reason)) return "paused";
  if (signal?.aborted || isAbortError(e)) return "cancelled";
  // Design gates are a separate pipeline — prefer design-gate-failed when present
  // (even if content gateResult is also attached).
  if (e instanceof Error && (e as { designGateResult?: unknown }).designGateResult) return "design-gate-failed";
  if (e instanceof Error && (e as { gateResult?: unknown }).gateResult) return "gate-failed";
  return "failed";
}

export function startGenerateWallClock(
  ac: AbortController,
  opts: GenerateWallClockOptions = {},
): () => void {
  const wallMs = opts.wallMs ?? GENERATE_WALL_MS;
  const now = opts.now ?? Date.now;
  const setTimeoutFn = opts.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = opts.clearTimeoutFn ?? clearTimeout;
  let timer: WallTimer | undefined;
  let armed = true;

  const fire = (): void => {
    if (!armed) return;
    armed = false;
    if (timer !== undefined) {
      clearTimeoutFn(timer);
      timer = undefined;
    }
    if (ac.signal.aborted) return;
    ac.abort(generateTimeoutError());
    opts.onTimeout?.();
  };

  const dispose = (): void => {
    armed = false;
    if (timer === undefined) return;
    clearTimeoutFn(timer);
    timer = undefined;
  };

  if (ac.signal.aborted) return dispose;
  const remaining = wallMs - (now() - (opts.startedAt ?? now()));
  if (remaining <= 0) fire();
  else timer = setTimeoutFn(fire, remaining);
  return dispose;
}

export function bindGenerateWallClock(
  parent: AbortSignal | undefined,
  wallClock?: false | GenerateWallClockOptions,
): { signal: AbortSignal; dispose: () => void } {
  if (wallClock === false) {
    return { signal: parent ?? new AbortController().signal, dispose: () => {} };
  }
  const ac = new AbortController();
  const forward = (): void => {
    if (ac.signal.aborted) return;
    ac.abort(parent?.reason);
  };
  if (parent?.aborted) forward();
  else parent?.addEventListener("abort", forward, { once: true });
  const stopWall = startGenerateWallClock(ac, wallClock ?? {});
  return {
    signal: ac.signal,
    dispose: () => {
      stopWall();
      parent?.removeEventListener("abort", forward);
    },
  };
}

export async function withGenerateWallClock<
  TOpts extends { signal?: AbortSignal; wallClock?: false | GenerateWallClockOptions },
  T,
>(opts: TOpts, run: (opts: TOpts) => Promise<T>): Promise<T> {
  if (opts.wallClock === false) return run(opts);
  const { signal, dispose } = bindGenerateWallClock(opts.signal, opts.wallClock);
  try {
    throwIfAborted(signal);
    return await run({ ...opts, signal, wallClock: false });
  } catch (e) {
    throwIfAborted(signal);
    throw e;
  } finally {
    dispose();
  }
}
