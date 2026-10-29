/** Width / line estimates for truncate-or-split. Never used to shrink font size. */
export declare function estTextWidth(text: string, fontSize: number): number;
export declare function estLines(text: string, fontSize: number, maxW: number): number;
/** Truncate to `maxChars` (grapheme-ish by code point). Never changes font size. */
export declare function truncateChars(text: string, maxChars: number): {
    text: string;
    truncated: boolean;
};
/** Truncate so estimated lines stay within `maxLines` at a locked font size. */
export declare function truncateToLines(text: string, fontSize: number, maxW: number, maxLines: number): {
    text: string;
    truncated: boolean;
};
export declare function chunk<T>(items: T[], size: number): T[][];
