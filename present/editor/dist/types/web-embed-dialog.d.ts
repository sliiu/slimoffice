import { normalizeWebEmbedUrl } from "@sliiu/present-core";
export interface WebEmbedDialogResult {
    embed: NonNullable<ReturnType<typeof normalizeWebEmbedUrl>>;
}
export declare function openWebEmbedDialog(doc: Document): Promise<WebEmbedDialogResult | null>;
