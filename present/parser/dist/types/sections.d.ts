import type { DeckSection } from "@sliiu/present-core";
import { type XmlNode } from "./xml.js";
export declare const SECTION_LST_URI = "{521415D9-36F7-43E2-AB2F-B90AF26B5E84}";
export declare function parsePresentationSectionLst(presEl: XmlNode | undefined, slideCount: number): DeckSection[];
