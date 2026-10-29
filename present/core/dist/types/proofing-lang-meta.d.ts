import type { Presentation } from "./slide.js";
export declare const PROOFING_LANG_META_KEY = "proofingLang";
/** presentation tags part 中 SlimPPT 校对语言元数据键名。 */
export declare const PROOFING_LANG_META_TAG = "SlimPPT.ProofingLang.v1";
export declare function normalizeProofingLangId(lang: unknown): string | undefined;
/** SlimPPT 校对语言 id → OOXML `a:defRPr@lang`（Office 拼写检查认这个）。 */
export declare function ooxmlLangFromProofingId(id: string): string;
/** OOXML `lang` / BCP-47 → SlimPPT 校对语言 id。无法识别时返回 undefined。 */
export declare function proofingIdFromOoxmlLang(lang: string | undefined): string | undefined;
export declare function getProofingLanguage(pres: Presentation): string;
export declare function setProofingLanguageMeta(pres: Presentation, langId: string | undefined): void;
/** 序列化校对语言 id（经 tags 侧车 round-trip；默认 `en` 省略）。 */
export declare function buildProofingLangMeta(pres: Presentation): string | undefined;
export declare function applyProofingLangMeta(pres: Presentation, raw: string | undefined): void;
