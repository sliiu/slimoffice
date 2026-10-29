import type { DeckSection, Presentation } from "./slide.js";
/** presentation tags part 中 SlimPPT 幻灯片节元数据键名。 */
export declare const SECTIONS_META_TAG = "SlimPPT.Sections.v1";
export declare function normalizeDeckSections(sections: DeckSection[] | undefined, slideCount?: number): DeckSection[];
/** 序列化 `pres.sections`（经 tags 侧车 round-trip）。 */
export declare function buildDeckSectionsMeta(pres: Presentation): string | undefined;
export declare function applyDeckSectionsMeta(pres: Presentation, raw: string | undefined): void;
