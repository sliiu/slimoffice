import type { Presentation, ShowProperties } from "@sliiu/present-core";
export declare const REL_TYPE_PRES_PROPS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/presProps";
export declare const CT_PRES_PROPS = "application/vnd.openxmlformats-officedocument.presentationml.presProps+xml";
type MutableArchive = {
    files: Map<string, Uint8Array>;
};
export declare function renderShowPrXml(s: ShowProperties, existingExtLst?: string): string;
export declare function renderPresPropsXml(s: ShowProperties): string;
export declare function injectScratchPresProps(pres: Presentation, files: Record<string, string>): void;
export declare function patchPresProps(pres: Presentation, archive: MutableArchive, opts?: {
    debug?: boolean;
}): void;
export {};
