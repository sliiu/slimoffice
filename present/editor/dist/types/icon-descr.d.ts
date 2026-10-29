export declare function encodeIconDescr(iconId: string, color: string): string;
export declare function decodeIconDescr(descr: string | undefined): {
    iconId: string;
    color: string;
} | null;
