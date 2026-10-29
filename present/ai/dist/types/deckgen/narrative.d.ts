/**
 * Narrative outline — argument structure, not a bullet dump.
 */
export interface NarrativeBeat {
    /** Why this beat exists in the argument. */
    intent: "open" | "frame" | "claim" | "evidence" | "contrast" | "proof" | "close";
    claim: string;
    evidence: string[];
    imageIdea?: string;
    metric?: {
        value: string;
        label: string;
    };
}
export interface NarrativeOutline {
    title: string;
    subtitle?: string;
    thesis: string;
    beats: NarrativeBeat[];
    language: string;
}
export interface NarrativeInput {
    topic: string;
    materials?: string[];
    audience?: string;
    language?: string;
}
/**
 * Deterministic argument from topic + materials.
 * Materials become evidence; the topic is the thesis.
 */
export declare function buildNarrativeOutline(input: NarrativeInput): NarrativeOutline;
