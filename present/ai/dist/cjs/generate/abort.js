"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GENERATE_PAUSE_KIND = exports.GENERATE_TIMEOUT_KIND = exports.GENERATE_WALL_MS = void 0;
exports.abortError = abortError;
exports.generateTimeoutError = generateTimeoutError;
exports.generatePauseError = generatePauseError;
exports.isAbortError = isAbortError;
exports.isGenerateTimeoutError = isGenerateTimeoutError;
exports.isGeneratePauseError = isGeneratePauseError;
exports.throwIfAborted = throwIfAborted;
exports.rethrowIfAborted = rethrowIfAborted;
exports.shouldCommitGeneratedDeck = shouldCommitGeneratedDeck;
exports.classifyGenerateEndError = classifyGenerateEndError;
exports.startGenerateWallClock = startGenerateWallClock;
exports.bindGenerateWallClock = bindGenerateWallClock;
exports.withGenerateWallClock = withGenerateWallClock;
exports.GENERATE_WALL_MS = 12 * 60 * 1000;
exports.GENERATE_TIMEOUT_KIND = "generate-timeout";
exports.GENERATE_PAUSE_KIND = "generate-pause";
function abortError() {
    const err = new Error("Aborted");
    err.name = "AbortError";
    return err;
}
function generateTimeoutError() {
    const err = new Error("Generate timed out");
    err.name = "AbortError";
    err.kind = exports.GENERATE_TIMEOUT_KIND;
    return err;
}
function generatePauseError() {
    const err = new Error("Generate paused");
    err.name = "AbortError";
    err.kind = exports.GENERATE_PAUSE_KIND;
    return err;
}
function isAbortError(e) {
    if (e instanceof DOMException && e.name === "AbortError")
        return true;
    if (e instanceof Error && e.name === "AbortError")
        return true;
    const msg = e instanceof Error ? e.message : typeof e === "string" ? e : "";
    return /\babort(ed)?\b/i.test(msg);
}
function isGenerateTimeoutError(e) {
    if (!e || typeof e !== "object")
        return false;
    return e.kind === exports.GENERATE_TIMEOUT_KIND;
}
function isGeneratePauseError(e) {
    if (!e || typeof e !== "object")
        return false;
    return e.kind === exports.GENERATE_PAUSE_KIND;
}
function throwIfAborted(signal) {
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
function rethrowIfAborted(signal, err) {
    throwIfAborted(signal);
    if (isGenerateTimeoutError(err) || isGeneratePauseError(err) || isAbortError(err))
        throw err;
}
function shouldCommitGeneratedDeck(signal) {
    return !signal?.aborted;
}
function classifyGenerateEndError(e, signal) {
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
function startGenerateWallClock(ac, opts = {}) {
    const wallMs = opts.wallMs ?? exports.GENERATE_WALL_MS;
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
function bindGenerateWallClock(parent, wallClock) {
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
async function withGenerateWallClock(opts, run) {
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
