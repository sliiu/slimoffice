"use strict";
/**
 * Turn outline imagery direction into English stock-photo search keywords.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertImageIdeaToEnglish = convertImageIdeaToEnglish;
const ai_1 = require("ai");
const client_1 = require("../llm/client");
const limit_1 = require("../llm/limit");
const MAX_LEN = 80;
function hasCjk(s) {
    return /[\u4e00-\u9fff\u2e80-\u9fff]/.test(s);
}
function cleanImageIdeaQuery(s) {
    return s.replace(/\s+/g, " ").trim().slice(0, MAX_LEN);
}
/**
 * @returns English search line (≤80 chars), or null when input is empty / call failed.
 */
async function convertImageIdeaToEnglish(opts) {
    const raw = opts.text.trim();
    if (!raw)
        return null;
    if (!hasCjk(raw))
        return cleanImageIdeaQuery(raw);
    let model;
    try {
        model = (0, client_1.createLlm)(opts.config.text).model;
    }
    catch {
        return null;
    }
    const context = [];
    if (opts.deckTopic?.trim())
        context.push(`Deck topic: ${opts.deckTopic.trim()}`);
    if (opts.slideTitle?.trim())
        context.push(`Slide title: ${opts.slideTitle.trim()}`);
    context.push(`Imagery direction: ${raw}`);
    const system = [
        "You convert slide imagery directions into English stock-photo search keywords (Unsplash/Pexels).",
        "Rules:",
        "- Output ONE line only, at most 80 characters.",
        "- Concrete visual description: subject + setting + lighting or mood.",
        "- No quotes, markdown, labels, or explanation.",
        "- Prefer searchable nouns (place, object, people, weather, time of day).",
        "- Do not add text-in-image or logo requests.",
    ].join("\n");
    const prompt = [...context, "", "English search query:"].join("\n");
    try {
        const { text } = await (0, ai_1.generateText)({
            model,
            system,
            prompt,
            abortSignal: opts.signal,
            timeout: limit_1.LLM_TIMEOUT,
            maxRetries: 0,
        });
        const out = cleanImageIdeaQuery(text);
        return out.length > 0 ? out : null;
    }
    catch {
        return null;
    }
}
