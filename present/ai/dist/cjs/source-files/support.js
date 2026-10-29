"use strict";
// 哪些模型收得了原文件字节。收不了的要先问用户，同意才抽文字。
Object.defineProperty(exports, "__esModule", { value: true });
exports.byteRouteFor = byteRouteFor;
exports.responsesAuth = responsesAuth;
exports.filesNeedingDegrade = filesNeedingDegrade;
exports.unknownSourceNames = unknownSourceNames;
const presets_1 = require("../config/presets");
const types_1 = require("../config/types");
const kinds_1 = require("./kinds");
function byteRouteFor(text, kind) {
    const resolved = (0, presets_1.resolveTextConfig)(text);
    if (kind === "image")
        return (0, presets_1.textModelSupportsVision)(resolved) ? "chat" : "degrade";
    if (kind === "unknown" || kind === "legacy" || kind === "text")
        return "degrade";
    if (kind === "docx" || kind === "xlsx" || kind === "document") {
        return resolved.provider === "openai" ? "openai-responses" : "degrade";
    }
    if (resolved.provider === "anthropic" || resolved.provider === "google")
        return "chat";
    if (resolved.provider === "openai" && (0, presets_1.textModelSupportsVision)(resolved))
        return "chat";
    if ((0, presets_1.textModelSupportsVision)(resolved))
        return "chat";
    return "degrade";
}
function responsesAuth(text) {
    const resolved = (0, presets_1.resolveTextConfig)(text);
    const { headers } = (0, types_1.parseCustomHeaders)(resolved.customHeaders);
    return {
        apiKey: resolved.apiKey,
        baseURL: (0, presets_1.applyProxyUrl)(resolved.baseURL, resolved.proxyUrl).replace(/\/$/, ""),
        model: resolved.model,
        headers,
    };
}
function filesNeedingDegrade(text, files) {
    const names = [];
    for (const file of files) {
        const kind = (0, kinds_1.classifySourceFile)(file.name, file.mediaType);
        if (kind === "unknown")
            continue;
        if (kind === "image" && byteRouteFor(text, kind) === "degrade")
            continue;
        if (byteRouteFor(text, kind) === "degrade")
            names.push(file.name);
    }
    return names;
}
function unknownSourceNames(files) {
    return files.filter((f) => (0, kinds_1.classifySourceFile)(f.name, f.mediaType) === "unknown").map((f) => f.name);
}
