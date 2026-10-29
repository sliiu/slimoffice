// 手写墨迹识别：把合成后的笔画图交给视觉模型转写。
// Tesseract 面向印刷体，手写准确率通常很差；有可用 AI 配置时优先走这条路径。
import { generateText } from "ai";
import { isConfigUsable, textModelSupportsVision } from "./config/presets.js";
import { createLlm } from "./llm/client.js";
import { LLM_TIMEOUT } from "./llm/limit.js";
function dataUrlToBytes(dataUrl) {
    const comma = dataUrl.indexOf(",");
    const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++)
        bytes[i] = bin.charCodeAt(i);
    return bytes;
}
function mediaTypeOf(dataUrl) {
    const m = /^data:([^;,]+)/i.exec(dataUrl);
    return m?.[1] || "image/png";
}
export async function recognizeHandwritingImage(config, input) {
    if (!isConfigUsable(config))
        return null;
    if (!textModelSupportsVision(config.text))
        return null;
    if (!input.dataUrl.startsWith("data:"))
        return null;
    const { model } = createLlm(config.text);
    const langHint = input.lang.trim() || "und";
    try {
        const { text } = await generateText({
            model,
            messages: [
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: [
                                "Transcribe the handwritten ink in this image.",
                                `It is a composite of ${input.strokeCount} stroke(s) on a white background.`,
                                "Read left-to-right, top-to-bottom. Preserve line breaks if there are multiple lines.",
                                `Language hint: ${langHint}.`,
                                "Return ONLY the transcribed text. No quotes, labels, or commentary.",
                                "If nothing is readable, return an empty string.",
                            ].join(" "),
                        },
                        {
                            type: "image",
                            image: dataUrlToBytes(input.dataUrl),
                            mediaType: mediaTypeOf(input.dataUrl),
                        },
                    ],
                },
            ],
            timeout: LLM_TIMEOUT,
            maxRetries: 0,
        });
        const cleaned = text.replace(/^["'`\s]+|["'`\s]+$/g, "").trim();
        if (!cleaned || /^(empty|none|n\/a|无法识别|没有文字)$/i.test(cleaned))
            return null;
        return { text: cleaned };
    }
    catch {
        return null;
    }
}
