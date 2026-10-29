"use strict";
// 结构化 JSON 输出：generateText → 剥围栏 → JSON.parse → normalize → zod 校验，
// 失败把 zod 报错回喂给模型重试一次。
//
// 为什么不用 generateObject / structured outputs：
//   1. OpenAI-Compatible 生态（DeepSeek / OneAPI / vLLM…）对 response_format
//      支持参差不齐；
//   2. 即便支持，过于复杂的 discriminated union（SlideSpecSchema）也偶有
//      invalid_schema 报错。
// 把字段名骨架塞进 system prompt（由调用方负责），纯文本输出最稳。
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripJsonFences = stripJsonFences;
exports.generateJson = generateJson;
const ai_1 = require("ai");
const complete_1 = require("../source-files/complete");
const limit_1 = require("./limit");
const usage_1 = require("./usage");
/**
 * 剥掉 markdown ```json ... ``` / ``` ... ``` 围栏。某些模型不管你怎么要求
 * "no fences" 还是会包一层；宽容兜底，避免一行 backtick 让整个流程白跑。
 */
function stripJsonFences(s) {
    let t = s.trim();
    if (t.startsWith("```")) {
        t = t.replace(/^```(?:json|JSON)?\s*\n?/, "").replace(/\n?```\s*$/, "");
    }
    return t.trim();
}
function throwIfAborted(signal) {
    if (!signal?.aborted)
        return;
    if (signal.reason instanceof Error)
        throw signal.reason;
    const err = new Error("Aborted");
    err.name = "AbortError";
    throw err;
}
function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(signal.reason ?? new Error("aborted"));
            return;
        }
        const t = setTimeout(resolve, ms);
        signal?.addEventListener("abort", () => {
            clearTimeout(t);
            reject(signal.reason ?? new Error("aborted"));
        }, { once: true });
    });
}
/**
 * 一次"生成 JSON + zod 校验"的完整循环，失败重试 1 次（把校验报错回喂给模型）。
 * 弱模型常因漏字段 / 用 alias 翻车，一次显式反馈后多半能改对 —— 通用且廉价的容错。
 */
async function generateJson(opts) {
    const tryOnce = async (extraInstruction) => {
        throwIfAborted(opts.signal);
        const sys = extraInstruction ? `${opts.system}\n\n${extraInstruction}` : opts.system;
        let text;
        if (opts.files?.length) {
            text = await (0, complete_1.completeWithFiles)({
                model: opts.model,
                system: sys,
                prompt: opts.prompt,
                files: opts.files,
                ...(opts.responses ? { responses: opts.responses } : {}),
                signal: opts.signal,
                timeoutMs: opts.timeoutMs ?? limit_1.LLM_TIMEOUT.stepMs,
            });
        }
        else {
            const llmResult = await (0, ai_1.generateText)({
                model: opts.model,
                system: sys,
                prompt: opts.prompt,
                abortSignal: opts.signal,
                timeout: { stepMs: opts.timeoutMs ?? limit_1.LLM_TIMEOUT.stepMs },
                maxRetries: 0,
            });
            const usage = (0, usage_1.extractLlmUsage)(llmResult);
            if (usage)
                opts.onUsage?.(usage);
            text = llmResult.text;
        }
        const raw = stripJsonFences(text);
        let parsed;
        try {
            parsed = JSON.parse(raw);
        }
        catch (e) {
            throw new Error(`Model output was not valid JSON: ${e.message}\n--- text ---\n${raw.slice(0, 400)}`);
        }
        opts.onRaw?.(parsed);
        const normalized = opts.normalize ? opts.normalize(parsed) : parsed;
        const parsedSchema = opts.schema.safeParse(normalized);
        if (!parsedSchema.success) {
            throw new Error(`Model output failed schema validation:\n${parsedSchema.error.issues
                .slice(0, 6)
                .map((iss) => `  - ${iss.path.join(".")}: ${iss.message}`)
                .join("\n")}\n--- received ---\n${JSON.stringify(normalized).slice(0, 400)}`);
        }
        return parsedSchema.data;
    };
    let extra;
    let schemaRetried = false;
    let rateTries = 0;
    let timeoutTries = 0;
    for (;;) {
        throwIfAborted(opts.signal);
        try {
            return await (0, limit_1.withGenerateJsonSlot)(() => tryOnce(extra));
        }
        catch (e) {
            if (opts.signal?.aborted)
                throw e;
            if ((0, limit_1.isTimeoutLlmError)(e)) {
                // A user abort is handled above; this is the step timeout or a dropped connection.
                // Short stages opt into one clean retry instead of failing the whole run.
                if (timeoutTries >= (opts.retryOnTimeout ?? 0))
                    throw e;
                timeoutTries += 1;
                continue;
            }
            const waitMs = (0, limit_1.observeLlmError)(e);
            if (waitMs !== undefined) {
                if (rateTries >= 3)
                    throw e;
                rateTries += 1;
                extra = undefined;
                await sleep(waitMs, opts.signal);
                continue;
            }
            if (!schemaRetried) {
                schemaRetried = true;
                extra = `Previous attempt failed:\n${e.message}\nRe-emit the JSON, paying special attention to required fields and exact field names.`;
                continue;
            }
            throw e;
        }
    }
}
