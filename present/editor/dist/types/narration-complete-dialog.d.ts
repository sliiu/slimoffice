/** Shown after Record Slide Show — download narration or insert as audio on the deck. */
export declare function openNarrationCompleteDialog(doc: Document, blob: Blob, onInsert: (dataUrl: string, duration?: number) => void, opts?: {
    rehearse?: {
        slideCount: number;
        totalSeconds: number;
    };
}): void;
