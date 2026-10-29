import type { HyperlinkRef } from "./shape.js";
export declare function sanitizeExternalUrl(raw: string | undefined | null): string | undefined;
export declare function isSafeExternalUrl(raw: string | undefined | null): boolean;
export declare function sanitizeHyperlinkRef(h: HyperlinkRef | undefined): HyperlinkRef | undefined;
