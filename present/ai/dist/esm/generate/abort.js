export const GENERATE_WALL_MS = 12 * 60 * 1000;
export const GENERATE_TIMEOUT_KIND = "generate-timeout";
export const GENERATE_PAUSE_KIND = "generate-pause";
export function abortError() {
    const err = new Error("Aborted");
    err.name = "AbortError";
    return err;
}
export function generateTimeoutError() {
    const err = new Error("Generate timed out");
    err.name = "AbortError";
    err.kind = GENERATE_TIMEOUT_KIND;
    return err;
}
export function generatePauseError() {
    const err = new Error("Generate paused");
    err.name = "AbortError";
    err.kind = GENERATE_PAUSE_KIND;
    return err;
}
export function isAbortError(e) {
    if (e instanceof DOMException && e.name === "AbortError")
        return true;
    if (e instanceof Error && e.name === "AbortError")
        return true;
    const msg = e instanceof Error ? e.message : typeof e === "string" ? e : "";
    return /\babort(ed)?\b/i.test(msg);
}
export function isGenerateTimeoutError(e) {
    if (!e || typeof e !== "object")
        return false;
    return e.kind === GENERATE_TIMEOUT_KIND;
}
export function isGeneratePauseError(e) {
    if (!e || typeof e !== "object")
        return false;
    return e.kind === GENERATE_PAUSE_KIND;
}
export function throwIfAborted(signal) {
    if (!signal?.aborted)
        return;
    if (isGenerateTimeoutError(signal.reason)) {
        throw signal.reason instanceof Error ? signal.reason : generateTimeoutError();
    }
    if (isGeneratePauseError(signal.reason)) {
        throw signal.reason instanceof Error ? signal.reason : generatePauseError();
    }
    throw abortError();
}
export function rethrowIfAborted(signal, err) {
    throwIfAborted(signal);
    if (isGenerateTimeoutError(err) || isGeneratePauseError(err) || isAbortError(err))
        throw err;
}
export function shouldCommitGeneratedDeck(signal) {
    return !signal?.aborted;
}
export function classifyGenerateEndError(e, signal) {
    if (isGenerateTimeoutError(e) || isGenerateTimeoutError(signal?.reason))
        return "timed-out";
    if (isGeneratePauseError(e) || isGeneratePauseError(signal?.reason))
        return "paused";
    if (signal?.aborted || isAbortError(e))
        return "cancelled";
    // Design gates are a separate pipeline — prefer design-gate-failed when present
    // (even if content gateResult is also attached).
    if (e instanceof Error && e.designGateResult)
        return "design-gate-failed";
    if (e instanceof Error && e.gateResult)
        return "gate-failed";
    return "failed";
}
export function startGenerateWallClock(ac, opts = {}) {
    const wallMs = opts.wallMs ?? GENERATE_WALL_MS;
    const now = opts.now ?? Date.now;
    const setTimeoutFn = opts.setTimeoutFn ?? setTimeout;
    const clearTimeoutFn = opts.clearTimeoutFn ?? clearTimeout;
    let timer;
    let armed = true;
    const fire = () => {
        if (!armed)
            return;
        armed = false;
        if (timer !== undefined) {
            clearTimeoutFn(timer);
            timer = undefined;
        }
        if (ac.signal.aborted)
            return;
        ac.abort(generateTimeoutError());
        opts.onTimeout?.();
    };
    const dispose = () => {
        armed = false;
        if (timer === undefined)
            return;
        clearTimeoutFn(timer);
        timer = undefined;
    };
    if (ac.signal.aborted)
        return dispose;
    const remaining = wallMs - (now() - (opts.startedAt ?? now()));
    if (remaining <= 0)
        fire();
    else
        timer = setTimeoutFn(fire, remaining);
    return dispose;
}
export function bindGenerateWallClock(parent, wallClock) {
    if (wallClock === false) {
        return { signal: parent ?? new AbortController().signal, dispose: () => { } };
    }
    const ac = new AbortController();
    const forward = () => {
        if (ac.signal.aborted)
            return;
        ac.abort(parent?.reason);
    };
    if (parent?.aborted)
        forward();
    else
        parent?.addEventListener("abort", forward, { once: true });
    const stopWall = startGenerateWallClock(ac, wallClock ?? {});
    return {
        signal: ac.signal,
        dispose: () => {
            stopWall();
            parent?.removeEventListener("abort", forward);
        },
    };
}
export async function withGenerateWallClock(opts, run) {
    if (opts.wallClock === false)
        return run(opts);
    const { signal, dispose } = bindGenerateWallClock(opts.signal, opts.wallClock);
    try {
        throwIfAborted(signal);
        return await run({ ...opts, signal, wallClock: false });
    }
    catch (e) {
        throwIfAborted(signal);
        throw e;
    }
    finally {
        dispose();
    }
}
