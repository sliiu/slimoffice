// 对话里的参考文档先变成改动提案。用户改完并确认后，文字原样进文稿，不再让模型改写。
import { createSlideFromMaster } from "@sliiu/present-core";
import { DeleteSlideCmd, InsertSlideCmd } from "@sliiu/present-editor";
import { z } from "zod";
import { contentLayout, layoutsFromMasters } from "../generate/template-fill.js";
import { ReplaceTextCmd, SetSlideNotesCmd } from "../tools/commands/slide-commands.js";
export const ChangeProposalSchema = z.object({
    summary: z.string().default(""),
    edits: z
        .array(z.object({
        slideIndex: z.number().int().nonnegative(),
        title: z.string().default(""),
        body: z.string().default(""),
        notes: z.string().default(""),
    }))
        .default([]),
    adds: z
        .array(z.object({
        title: z.string().default(""),
        body: z.string().default(""),
        notes: z.string().default(""),
    }))
        .default([]),
    deletes: z.array(z.number().int().nonnegative()).default([]),
});
export function digestSlides(pres) {
    return pres.slides
        .map((slide, index) => {
        const texts = textShapes(slide).map((sh) => shapePlain(sh)).filter(Boolean);
        return `slide ${index}: ${texts.join(" | ") || slide.name || "(empty)"}`;
    })
        .join("\n");
}
export function changeProposalSystemPrompt() {
    return [
        "You propose content edits for the open presentation. Output JSON only.",
        "Do not change masters, layouts, or visual style.",
        "Facts come only from the source material. Do not invent numbers. When sources disagree, keep both and prefix with [冲突].",
        "Do not place images or charts from the files onto slides. Numbers may be written as text.",
        "edits change slides that already exist (0-based slideIndex). adds append new slides. deletes lists slide indexes to remove.",
        "title is the slide title. body is the remaining text, one paragraph per line. notes are speaker notes.",
        'JSON: {"summary":"...","edits":[{"slideIndex":0,"title":"...","body":"...","notes":"..."}],"adds":[{"title":"...","body":"...","notes":"..."}],"deletes":[]}',
        "No markdown fences.",
    ].join("\n");
}
export function changeProposalUserPrompt(instruction, digest, sourceMaterial) {
    return [
        instruction.trim() ? `Instruction: ${instruction.trim()}` : "Instruction: summarize the source files and update the deck's content.",
        "",
        "Current slides:",
        digest || "(no slides)",
        "",
        sourceMaterial.trim() ? `SOURCE MATERIAL:\n${sourceMaterial.trim()}` : "Source files are attached. They are the only facts.",
    ].join("\n");
}
export async function applyChangeProposal(port, proposal) {
    await port.transaction("AI: Apply change proposal", () => {
        const pres = port.getPres();
        for (const edit of proposal.edits) {
            if (proposal.deletes.includes(edit.slideIndex))
                continue;
            writeSlideContent(port, pres, edit.slideIndex, edit.title, edit.body, edit.notes);
        }
        const deletes = [...new Set(proposal.deletes)].filter((i) => i >= 0 && i < pres.slides.length).sort((a, b) => b - a);
        for (const index of deletes)
            port.execute(new DeleteSlideCmd(index));
        const choices = layoutsFromMasters(port.getPres().masters);
        const layout = contentLayout(choices);
        for (const add of proposal.adds) {
            const current = port.getPres();
            const slide = createSlideFromMaster(current.masters, {
                index: current.slides.length,
                name: add.title || `Slide ${current.slides.length + 1}`,
                ...(layout ? { layoutId: layout.id } : {}),
            });
            port.execute(new InsertSlideCmd(current.slides.length, slide));
            const addedAt = port.getPres().slides.length - 1;
            writeSlideContent(port, port.getPres(), addedAt, add.title, add.body, add.notes);
        }
    });
    port.notifyMutated();
}
function writeSlideContent(port, pres, slideIndex, title, body, notes) {
    const slide = pres.slides[slideIndex];
    if (!slide)
        return;
    const targets = titleAndBody(slide);
    if (targets.titleId)
        port.execute(new ReplaceTextCmd(slideIndex, targets.titleId, title.split("\n")));
    if (targets.bodyId)
        port.execute(new ReplaceTextCmd(slideIndex, targets.bodyId, body.split("\n")));
    if (!targets.titleId && !targets.bodyId) {
        const only = textShapes(slide)[0];
        if (only)
            port.execute(new ReplaceTextCmd(slideIndex, only.id, `${title}\n${body}`.split("\n")));
    }
    port.execute(new SetSlideNotesCmd(slideIndex, notes));
}
function titleAndBody(slide) {
    const texts = textShapes(slide);
    const title = texts.find((sh) => sh.placeholder?.type === "title" || sh.placeholder?.type === "ctrTitle") ??
        texts[0];
    const body = texts.find((sh) => sh.placeholder?.type === "body" && sh.id !== title?.id) ??
        texts.find((sh) => sh.id !== title?.id);
    return {
        ...(title ? { titleId: title.id } : {}),
        ...(body ? { bodyId: body.id } : {}),
    };
}
function textShapes(slide) {
    const out = [];
    for (const layer of slide.layers) {
        for (const shape of layer.shapes)
            collectText(shape, out);
    }
    return out;
}
function collectText(shape, out) {
    if (shape.kind === "text")
        out.push(shape);
    if (shape.kind === "group") {
        for (const child of shape.children)
            collectText(child, out);
    }
}
function shapePlain(shape) {
    return shape.paragraphs.flatMap((p) => p.runs.map((r) => r.text)).join("").trim();
}
