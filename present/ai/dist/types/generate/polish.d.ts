/**
 * Post-outline polish for the product generate path (deckgen).
 *
 * The discarded PPTAgent lifecycle used to own research → organize → compile →
 * images → QA → art director. Compile is now deckgen (canvas author or no-key
 * fill); these passes still run around it so a reviewed outline gets denser copy,
 * real imagery, contrast repair, and a conservative recolor pass.
 *
 * Design / P0 throw-gates stay off: they assume PPTAgent layout names (cards,
 * cover photos, web-exclusive quota) and would fail every whitelist deck.
 */
import type { Presentation } from "@sliiu/present-core";
import type { LlmUsage } from "../llm/usage.js";
import { ModelCallBudget } from "./call-budget.js";
import type { GuidanceInput, Outline, PresentationSpec } from "./schema.js";
import type { GenerateOptions, PipelineEvent } from "./types.js";
export interface PolishContext {
    emit: (event: PipelineEvent) => void;
    recordUsage: (usage: LlmUsage) => void;
    budget: ModelCallBudget;
}
export declare function createPolishContext(opts: GenerateOptions): PolishContext;
export declare function cloneOutline(outline: Outline): Outline;
/** After organize (≤8 bullets) clip to deckgen slot caps so pagesFromOutline does not throw. */
export declare function clampOutlineToDeckgenSlots(outline: Outline): Outline;
/** Map outline imageIdea onto the post-compile enrich spec (bg vs hero). */
export declare function specFromOutlineImagery(outline: Outline): PresentationSpec;
/**
 * Optional LLM content pass. No-ops when text config is unusable so unit tests
 * still compile the reviewed outline synchronously-enough (no network).
 */
export declare function enrichOutlineContent(outlineInput: Outline, guidance: GuidanceInput, opts: GenerateOptions, ctx: PolishContext): Promise<Outline>;
/** Images → QA repair → art director. Mutates `pres`. Motion stays in the adapter. */
export declare function polishGeneratedDeck(pres: Presentation, outline: Outline | undefined, guidance: GuidanceInput, opts: GenerateOptions, ctx: PolishContext): Promise<void>;
