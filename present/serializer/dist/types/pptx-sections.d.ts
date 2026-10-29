import type { DeckSection, Presentation } from "@sliiu/present-core";
import type { RoundTripOptions } from "./pptx-roundtrip.js";
type MutableArchive = {
    files: Map<string, Uint8Array>;
};
export declare const SECTION_LST_URI = "{521415D9-36F7-43E2-AB2F-B90AF26B5E84}";
/** 把编辑器里的 `sec_open` 之类 id 折成 Office 认的 {GUID}。已是 GUID 则原样（大写）。 */
export declare function sectionIdToGuid(id: string): string;
/** from-scratch sldId 约定与 `renderPresentation` 一致：256 + index。 */
export declare function fromScratchSldIds(slideCount: number): number[];
export declare function renderSectionLstXml(sections: DeckSection[], sldIds: number[]): string;
export declare function renderSectionExtXml(sections: DeckSection[], sldIds: number[]): string;
export declare function patchSectionLst(pres: Presentation, archive: MutableArchive, opts: RoundTripOptions): void;
export {};
