// 文案违规只改字，不重画那一页。几何问题仍走画布修补。
import { z } from "zod";
import { generateJson } from "../llm/json.js";
import { COPY_VOICE_BLOCK, lintCopyVoice, singleCopyIssues } from "./copy-voice.js";
export function isCopyVoiceIssue(issue) {
    return issue.startsWith("copy voice");
}
/** 跟 reflect 同一条规则：套话、自述版式、感叹号按句；「不是…而是…」整稿超过一句才算。 */
export function copyTargetsFromSlides(slides) {
    const pageTitles = [];
    const targets = [];
    const seen = new Set();
    const add = (slideIdx, text) => {
        const key = `${slideIdx}\0${text.trim()}`;
        if (!text.trim() || seen.has(key))
            return;
        seen.add(key);
        targets.push({ slideIdx, text: text.trim() });
    };
    for (let i = 0; i < slides.length; i++) {
        const texts = slides[i].elements.filter((e) => e.kind === "text" && !!e.text?.trim());
        const largest = texts.reduce((a, b) => (!a || (b.fontSize ?? 0) > (a.fontSize ?? 0) ? b : a), undefined);
        pageTitles.push(largest?.text ?? "");
        for (const el of texts) {
            if (singleCopyIssues(el.text).some((h) => h.rule !== "antithesis"))
                add(i, el.text);
        }
    }
    const antithesis = lintCopyVoice({ titles: pageTitles }).filter((h) => h.rule === "antithesis");
    if (antithesis.length) {
        pageTitles.forEach((title, i) => {
            if (title && singleCopyIssues(title).some((h) => h.rule === "antithesis"))
                add(i, title);
        });
    }
    return targets;
}
const RewriteSchema = z.object({
    replacements: z
        .array(z.object({
        slideIdx: z.number().int().min(0),
        from: z.string(),
        to: z.string(),
    }))
        .max(24),
});
/**
 * 把改写落回已画好的文字上。`to` 仍然违规、或对不上原文，就留着原来的字。
 * 不改槽位、位置和形状种类。`elements` 是换掉的文字块数，`rows` 是真正落地的句子。
 */
export function applyCopyReplacements(slides, replacements) {
    let elements = 0;
    const rows = [];
    for (const row of replacements) {
        const from = row.from.trim();
        const to = row.to.trim();
        if (!from || !to || from === to)
            continue;
        if (singleCopyIssues(to).length)
            continue;
        const slide = slides[row.slideIdx];
        if (!slide)
            continue;
        let hit = 0;
        for (const el of slide.elements) {
            if (el.kind !== "text" || el.text?.trim() !== from)
                continue;
            el.text = to;
            hit += 1;
        }
        if (hit) {
            elements += hit;
            rows.push({ slideIdx: row.slideIdx, from, to });
        }
    }
    return { elements, rows };
}
/** 画布上换成的句子，大纲标题和要点里同一句也换成。出场顺序仍按大纲对文字。 */
export function mirrorOutlineCopy(slides, rows) {
    for (const row of rows) {
        const slide = slides[row.slideIdx];
        if (!slide)
            continue;
        if (slide.title.trim() === row.from)
            slide.title = row.to;
        if (!slide.bullets)
            continue;
        for (let i = 0; i < slide.bullets.length; i++) {
            if (slide.bullets[i].trim() === row.from)
                slide.bullets[i] = row.to;
        }
    }
}
export async function rewriteCopyVoice(input) {
    const targets = copyTargetsFromSlides(input.slides);
    if (!targets.length)
        return { elements: 0, rows: [] };
    const listed = targets
        .slice(0, 24)
        .map((t) => `- slide ${t.slideIdx}: ${JSON.stringify(t.text)}`)
        .join("\n");
    const parsed = await generateJson({
        model: input.model,
        schema: RewriteSchema,
        system: [
            "You rewrite slide strings that fail a copy check. Return JSON only.",
            "Change the words. Do not add slides, slots, or layout notes.",
            "Each replacement keeps the same fact, in the same language, at a similar length.",
            "The `from` value must be copied exactly from the list. `to` replaces that whole string.",
            COPY_VOICE_BLOCK,
            'JSON: {"replacements":[{"slideIdx":0,"from":"...","to":"..."}]}',
        ].join("\n"),
        prompt: `Rewrite these strings:\n${listed}`,
        ...(input.signal ? { signal: input.signal } : {}),
        ...(input.onUsage ? { onUsage: input.onUsage } : {}),
    });
    return applyCopyReplacements(input.slides, parsed.replacements);
}
