import type { SmartArtLayoutKind } from "@sliiu/present-core";
export interface SmartArtPickerResult {
    layout: SmartArtLayoutKind;
}
export declare function openSmartArtDialog(doc: Document): Promise<SmartArtPickerResult | null>;
