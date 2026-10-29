import { z } from "zod";
import type { LanguageModel } from "ai";
import type { GuidanceInput, Outline, OutlineItem } from "../schema.js";
import type { HostSkillStore } from "../../skills/types.js";
import type { LlmUsage } from "../../llm/usage.js";
import { type DeckBrief } from "../../deckgen/brief.js";
export declare const ManuscriptSchema: z.ZodObject<{
    title: z.ZodString;
    language: z.ZodString;
    audience: z.ZodOptional<z.ZodString>;
    thesis: z.ZodString;
    sections: z.ZodArray<z.ZodObject<{
        title: z.ZodString;
        summary: z.ZodString;
        facts: z.ZodArray<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type Manuscript = z.infer<typeof ManuscriptSchema>;
export declare const SlideBriefSchema: z.ZodObject<{
    purpose: z.ZodString;
    topic: z.ZodString;
    keyPoints: z.ZodArray<z.ZodString>;
    imagery: z.ZodOptional<z.ZodString>;
    notes: z.ZodOptional<z.ZodString>;
    coreMessage: z.ZodOptional<z.ZodString>;
    audienceMove: z.ZodOptional<z.ZodString>;
    relationships: z.ZodOptional<z.ZodEnum<{
        contrast: "contrast";
        flow: "flow";
        link: "link";
        membership: "membership";
        none: "none";
        order: "order";
        overlap: "overlap";
        parent: "parent";
    }>>;
    rhythm: z.ZodOptional<z.ZodEnum<{
        anchor: "anchor";
        breathing: "breathing";
        dense: "dense";
    }>>;
    carrier: z.ZodOptional<z.ZodEnum<{
        chart: "chart";
        device: "device";
        diagram: "diagram";
        photo: "photo";
        table: "table";
        typeOnly: "typeOnly";
    }>>;
    composition: z.ZodOptional<z.ZodEnum<{
        band: "band";
        "full-bleed": "full-bleed";
        grid: "grid";
        "header-stack": "header-stack";
        sidebar: "sidebar";
        split: "split";
        statement: "statement";
    }>>;
}, z.core.$strip>;
export type SlideBrief = z.infer<typeof SlideBriefSchema>;
export declare const DeckDesignBriefSchema: z.ZodObject<{
    mode: z.ZodOptional<z.ZodEnum<{
        briefing: "briefing";
        instructional: "instructional";
        narrative: "narrative";
        pyramid: "pyramid";
        showcase: "showcase";
    }>>;
    systemId: z.ZodPreprocess<z.ZodOptional<z.ZodString>, unknown>;
    paletteIntent: z.ZodOptional<z.ZodString>;
    motif: z.ZodOptional<z.ZodString>;
    folio: z.ZodOptional<z.ZodBoolean>;
    photoRhythm: z.ZodOptional<z.ZodEnum<{
        anchors: "anchors";
        bookends: "bookends";
        editorial: "editorial";
        none: "none";
    }>>;
}, z.core.$strip>;
export declare const DeckBriefsSchema: z.ZodObject<{
    deck: z.ZodOptional<z.ZodObject<{
        mode: z.ZodOptional<z.ZodEnum<{
            briefing: "briefing";
            instructional: "instructional";
            narrative: "narrative";
            pyramid: "pyramid";
            showcase: "showcase";
        }>>;
        systemId: z.ZodPreprocess<z.ZodOptional<z.ZodString>, unknown>;
        paletteIntent: z.ZodOptional<z.ZodString>;
        motif: z.ZodOptional<z.ZodString>;
        folio: z.ZodOptional<z.ZodBoolean>;
        photoRhythm: z.ZodOptional<z.ZodEnum<{
            anchors: "anchors";
            bookends: "bookends";
            editorial: "editorial";
            none: "none";
        }>>;
    }, z.core.$strip>>;
    slides: z.ZodArray<z.ZodObject<{
        purpose: z.ZodString;
        topic: z.ZodString;
        keyPoints: z.ZodArray<z.ZodString>;
        imagery: z.ZodOptional<z.ZodString>;
        notes: z.ZodOptional<z.ZodString>;
        coreMessage: z.ZodOptional<z.ZodString>;
        audienceMove: z.ZodOptional<z.ZodString>;
        relationships: z.ZodOptional<z.ZodEnum<{
            contrast: "contrast";
            flow: "flow";
            link: "link";
            membership: "membership";
            none: "none";
            order: "order";
            overlap: "overlap";
            parent: "parent";
        }>>;
        rhythm: z.ZodOptional<z.ZodEnum<{
            anchor: "anchor";
            breathing: "breathing";
            dense: "dense";
        }>>;
        carrier: z.ZodOptional<z.ZodEnum<{
            chart: "chart";
            device: "device";
            diagram: "diagram";
            photo: "photo";
            table: "table";
            typeOnly: "typeOnly";
        }>>;
        composition: z.ZodOptional<z.ZodEnum<{
            band: "band";
            "full-bleed": "full-bleed";
            grid: "grid";
            "header-stack": "header-stack";
            sidebar: "sidebar";
            split: "split";
            statement: "statement";
        }>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type DeckBriefs = z.infer<typeof DeckBriefsSchema>;
export interface OrganizedDeck {
    slides: SlideBrief[];
    deck: DeckBrief;
}
export declare function researchManuscript(model: LanguageModel, guidance: GuidanceInput, outline: Outline, signal: AbortSignal | undefined, host?: HostSkillStore, onUsage?: (usage: LlmUsage) => void): Promise<Manuscript>;
export declare function coerceManuscript(v: unknown, fallbackLang: string): unknown;
export declare function manuscriptFromOutline(outline: Outline, guidance: GuidanceInput): Manuscript;
export declare function organizeDeckContent(model: LanguageModel, args: {
    outline: Outline;
    manuscript: Manuscript;
    language?: string;
    signal?: AbortSignal;
    onUsage?: (usage: LlmUsage) => void;
    host?: HostSkillStore;
}): Promise<OrganizedDeck>;
/** Tolerate loose enums (e.g. "Order", "dark tech") and per-page aliases before zod parses. */
export declare function coerceDeckBriefs(v: unknown): unknown;
export declare function organizeSlideContent(model: LanguageModel, args: {
    outline: Outline;
    item: OutlineItem;
    slideIdx: number;
    manuscript: Manuscript;
    language?: string;
    signal?: AbortSignal;
    onUsage?: (usage: LlmUsage) => void;
}): Promise<SlideBrief>;
export declare function briefFromOutlineItem(item: OutlineItem, topic: string): SlideBrief;
