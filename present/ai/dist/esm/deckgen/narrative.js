/**
 * Narrative outline — argument structure, not a bullet dump.
 */
import { truncateChars } from "./text-measure.js";
function inferLanguage(topic, materials) {
    const blob = `${topic}\n${materials.join("\n")}`;
    return /[\u4e00-\u9fff]/.test(blob) ? "zh" : "en";
}
function clean(s) {
    return s.replace(/\s+/g, " ").trim();
}
function clipHead(s, n) {
    return truncateChars(s, n).text;
}
/**
 * Deterministic argument from topic + materials.
 * Materials become evidence; the topic is the thesis.
 */
export function buildNarrativeOutline(input) {
    const topic = clean(input.topic) || "Untitled";
    const materials = (input.materials ?? []).map(clean).filter(Boolean);
    const language = input.language?.trim() || inferLanguage(topic, materials);
    const thesis = materials[0] || topic;
    const evidence = materials.length > 1 ? materials.slice(1) : materials.length === 1 ? materials : [topic];
    const mid = Math.max(1, Math.ceil(evidence.length / 2));
    const left = evidence.slice(0, mid);
    const right = evidence.slice(mid);
    const last = evidence[evidence.length - 1] ?? topic;
    const frameTitle = thesis !== topic ? thesis : language === "zh" ? "结构" : "The case";
    const evidenceTitle = language === "zh"
        ? evidence.length === 5
            ? "五步"
            : `${Math.max(1, evidence.length)} 条依据`
        : evidence.length === 5
            ? "Five steps"
            : `${Math.max(1, evidence.length)} holds`;
    const contrastLeft = left[0] ?? thesis;
    const contrastRight = (right[0] && right[0] !== contrastLeft ? right[0] : last) ?? thesis;
    const contrastTitle = `${clipHead(contrastLeft, 16)} / ${clipHead(contrastRight, 16)}`;
    const beats = [
        { intent: "open", claim: topic, evidence: [] },
        { intent: "frame", claim: frameTitle, evidence: [] },
        { intent: "claim", claim: thesis, evidence: [] },
        { intent: "evidence", claim: evidenceTitle, evidence: evidence.length ? evidence : [thesis] },
        {
            intent: "contrast",
            claim: contrastTitle,
            evidence: right.length >= 2 ? right : [...left.slice(0, 2), ...right, last].filter(Boolean),
        },
        {
            intent: "proof",
            claim: last,
            evidence: [],
            metric: { value: "01", label: last },
        },
        { intent: "close", claim: topic, evidence: evidence.slice(0, 3) },
    ];
    return {
        title: topic,
        ...(input.audience ? { subtitle: clean(input.audience) } : {}),
        thesis,
        beats,
        language,
    };
}
