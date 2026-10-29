/**
 * Copy voice — the rules that keep generated slide text from reading like a model wrote it.
 *
 * The symptoms are consistent across models: every title an antithesis ("X 不是 Y" / "not X,
 * it's Y"), four-character couplets stacked page after page, launch-copy verbs (赋能 / 打造 /
 * unlock / empower), and copy that narrates the slide's own design ("the photo is the canvas").
 * One prompt block is shared by every stage that writes words — outline, organizer, canvas
 * author, chat — and `lintCopyVoice` gives callers a deterministic check on the result.
 */
/** Prompt lines; the same block for every writing stage. */
export declare const COPY_VOICE_LINES: readonly string[];
export declare const COPY_VOICE_BLOCK: string;
export interface CopyVoiceHit {
    /** Which rule fired. */
    rule: "antithesis" | "buzzword" | "meta" | "exclamation";
    /** The offending text (trimmed, ≤ 80 chars). */
    text: string;
    /** Matched fragment for buzzword / meta hits. */
    match?: string;
}
/**
 * Deterministic check over a deck's visible copy. `titles` are checked for antithesis framing
 * (one is tolerated deck-wide); every string is checked for buzzwords, meta copy and exclamation
 * marks. Returns hits in input order; empty = clean.
 */
export declare function lintCopyVoice(input: {
    titles?: readonly string[];
    body?: readonly string[];
}): CopyVoiceHit[];
/**
 * 单句检查。跟整稿 lint 不同：一句「不是…而是…」在这里也算违规。
 * 改写时用它拒绝模型交回来的、仍然带套话的句子。
 */
export declare function singleCopyIssues(text: string): CopyVoiceHit[];
/** One line per hit, for logs and repair prompts. */
export declare function formatCopyVoiceHits(hits: readonly CopyVoiceHit[]): string[];
