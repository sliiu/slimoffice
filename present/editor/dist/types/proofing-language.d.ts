import type { Presentation } from "@sliiu/present-core";
import { getProofingLanguage, setProofingLanguageMeta } from "@sliiu/present-core";
export interface ProofingLanguageOption {
    id: string;
    labelKey: string;
    /** BCP 47 tag for spellcheck / translate APIs */
    tag: string;
}
export declare const PROOFING_LANGUAGES: ProofingLanguageOption[];
export { getProofingLanguage, setProofingLanguageMeta };
/** 将 UI locale 映射到校对语言 id（无显式存储时作为默认值）。 */
export declare function localeToProofingLangId(locale?: string): string;
/** presentation 元数据中显式存储的校对语言；未设置时返回 undefined。 */
export declare function getStoredProofingLanguage(pres: Presentation): string | undefined;
/** 运行时校对语言：优先元数据，否则跟随当前 UI locale。 */
export declare function getEffectiveProofingLanguage(pres: Presentation): string;
export declare function proofingLangTag(pres: Presentation): string;
