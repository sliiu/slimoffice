// 哪些模型收得了原文件字节。收不了的要先问用户，同意才抽文字。
import { applyProxyUrl, resolveTextConfig, textModelSupportsVision } from "../config/presets.js";
import { parseCustomHeaders } from "../config/types.js";
import { classifySourceFile } from "./kinds.js";
export function byteRouteFor(text, kind) {
    const resolved = resolveTextConfig(text);
    if (kind === "image")
        return textModelSupportsVision(resolved) ? "chat" : "degrade";
    if (kind === "unknown" || kind === "legacy" || kind === "text")
        return "degrade";
    if (kind === "docx" || kind === "xlsx" || kind === "document") {
        return resolved.provider === "openai" ? "openai-responses" : "degrade";
    }
    if (resolved.provider === "anthropic" || resolved.provider === "google")
        return "chat";
    if (resolved.provider === "openai" && textModelSupportsVision(resolved))
        return "chat";
    if (textModelSupportsVision(resolved))
        return "chat";
    return "degrade";
}
export function responsesAuth(text) {
    const resolved = resolveTextConfig(text);
    const { headers } = parseCustomHeaders(resolved.customHeaders);
    return {
        apiKey: resolved.apiKey,
        baseURL: applyProxyUrl(resolved.baseURL, resolved.proxyUrl).replace(/\/$/, ""),
        model: resolved.model,
        headers,
    };
}
export function filesNeedingDegrade(text, files) {
    const names = [];
    for (const file of files) {
        const kind = classifySourceFile(file.name, file.mediaType);
        if (kind === "unknown")
            continue;
        if (kind === "image" && byteRouteFor(text, kind) === "degrade")
            continue;
        if (byteRouteFor(text, kind) === "degrade")
            names.push(file.name);
    }
    return names;
}
export function unknownSourceNames(files) {
    return files.filter((f) => classifySourceFile(f.name, f.mediaType) === "unknown").map((f) => f.name);
}
