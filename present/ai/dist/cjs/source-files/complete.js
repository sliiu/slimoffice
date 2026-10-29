"use strict";
// 把源文件和提示一起交给模型。字节优先；OpenAI 的 Word / Excel 走 Responses 文件输入。
Object.defineProperty(exports, "__esModule", { value: true });
exports.completeWithFiles = completeWithFiles;
const ai_1 = require("ai");
const limit_1 = require("../llm/limit");
async function completeWithFiles(args) {
    const responsesFiles = args.files.filter((f) => f.route === "openai-responses");
    const chatFiles = args.files.filter((f) => f.route === "chat");
    if (responsesFiles.length > 0) {
        if (!args.responses)
            throw new Error("OpenAI file input needs an API key");
        return completeOpenAiResponses({
            auth: args.responses,
            system: args.system,
            prompt: args.prompt,
            files: [...responsesFiles, ...chatFiles],
            signal: args.signal,
        });
    }
    if (chatFiles.length === 0) {
        const result = await (0, ai_1.generateText)({
            model: args.model,
            system: args.system,
            prompt: args.prompt,
            abortSignal: args.signal,
            timeout: { stepMs: args.timeoutMs ?? limit_1.LLM_TIMEOUT.stepMs },
            maxRetries: 0,
        });
        return result.text;
    }
    const result = await (0, ai_1.generateText)({
        model: args.model,
        messages: [
            { role: "system", content: args.system },
            {
                role: "user",
                content: [
                    { type: "text", text: args.prompt },
                    ...chatFiles.map((f) => ({
                        type: "file",
                        data: f.bytes,
                        mediaType: f.mediaType,
                        filename: f.name,
                    })),
                ],
            },
        ],
        abortSignal: args.signal,
        timeout: { stepMs: args.timeoutMs ?? limit_1.LLM_TIMEOUT.stepMs },
        maxRetries: 0,
    });
    return result.text;
}
async function completeOpenAiResponses(args) {
    const content = [
        { type: "input_text", text: args.prompt },
    ];
    for (const file of args.files) {
        content.push({
            type: "input_file",
            filename: file.name,
            file_data: `data:${file.mediaType};base64,${bytesToBase64(file.bytes)}`,
        });
    }
    const res = await fetch(`${args.auth.baseURL}/responses`, {
        method: "POST",
        signal: args.signal,
        headers: {
            Authorization: `Bearer ${args.auth.apiKey}`,
            "Content-Type": "application/json",
            ...args.auth.headers,
        },
        body: JSON.stringify({
            model: args.auth.model,
            instructions: args.system,
            input: [{ role: "user", content }],
        }),
    });
    const raw = await res.text();
    if (!res.ok)
        throw new Error(raw.slice(0, 500) || `OpenAI responses ${res.status}`);
    const json = JSON.parse(raw);
    if (json.output_text?.trim())
        return json.output_text;
    const texts = [];
    for (const item of json.output ?? []) {
        for (const part of item.content ?? []) {
            if (part.text)
                texts.push(part.text);
        }
    }
    if (!texts.length)
        throw new Error("OpenAI responses returned no text");
    return texts.join("\n");
}
function bytesToBase64(bytes) {
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
}
