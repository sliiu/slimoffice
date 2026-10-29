export declare function placeCommentPopover(anchor: {
    x: number;
    y: number;
}, size: {
    width: number;
    height: number;
}, viewport: {
    width: number;
    height: number;
}): {
    left: number;
    top: number;
};
export declare function openAnchoredCommentDialog(doc: Document, opts: {
    anchor: {
        x: number;
        y: number;
    };
    targetLabel?: string;
    participants?: string[];
}): Promise<string | null>;
