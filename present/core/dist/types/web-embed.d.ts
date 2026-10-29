/** Web embed provider id (YouTube / Vimeo). `custom` is rejected. */
export type WebEmbedProvider = "youtube" | "vimeo" | "custom";
export interface NormalizedWebEmbed {
    embedUrl: string;
    provider: WebEmbedProvider;
    originalUrl: string;
}
export declare const WEB_EMBED_DESCR_PREFIX = "ppt-web-embed:";
export declare function encodeWebEmbedDescr(embed: NormalizedWebEmbed): string;
export declare function decodeWebEmbedDescr(descr?: string): NormalizedWebEmbed | null;
export declare function isAllowedWebEmbedSrc(src: string | undefined | null): boolean;
/** Parse a user URL into a YouTube / Vimeo HTTPS iframe `src`. */
export declare function normalizeWebEmbedUrl(input: string): NormalizedWebEmbed | null;
