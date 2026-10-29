import type { Presentation, TextStyles } from "@sliiu/present-core";
import type { RoundTripOptions } from "./pptx-roundtrip.js";
type MutableArchive = {
    files: Map<string, Uint8Array>;
};
/** From-scratch `<p:defaultTextStyle>`：有 IR 就按级写出，否则 PowerPoint 默认 18pt + 校对语言。 */
export declare function renderDefaultTextStyleXml(lang: string, styles?: TextStyles): string;
export declare function patchDefaultTextStyleLang(pres: Presentation, archive: MutableArchive, opts: RoundTripOptions): void;
export {};
