import type { Presentation } from "@ppt/core";
import {
  getProofingLanguage,
  normalizeProofingLangId,
  PROOFING_LANG_META_KEY,
  setProofingLanguageMeta,
} from "@ppt/core";
import { getLocale } from "./i18n";

export interface ProofingLanguageOption {
  id: string;
  labelKey: string;
  /** BCP 47 tag for spellcheck / translate APIs */
  tag: string;
}

export const PROOFING_LANGUAGES: ProofingLanguageOption[] = [
  { id: "en", labelKey: "proofing.lang.en", tag: "en" },
  { id: "zh", labelKey: "proofing.lang.zh", tag: "zh-CN" },
  { id: "ja", labelKey: "proofing.lang.ja", tag: "ja" },
  { id: "ko", labelKey: "proofing.lang.ko", tag: "ko" },
  { id: "fr", labelKey: "proofing.lang.fr", tag: "fr" },
  { id: "de", labelKey: "proofing.lang.de", tag: "de" },
  { id: "es", labelKey: "proofing.lang.es", tag: "es" },
  { id: "pt", labelKey: "proofing.lang.pt", tag: "pt" },
];

export { getProofingLanguage, setProofingLanguageMeta };

/** 将 UI locale 映射到校对语言 id（无显式存储时作为默认值）。 */
export function localeToProofingLangId(locale?: string): string {
  const l = (locale ?? getLocale()).toLowerCase();
  if (l.startsWith("zh")) return "zh";
  if (l.startsWith("ja")) return "ja";
  if (l.startsWith("ko")) return "ko";
  if (l.startsWith("fr")) return "fr";
  if (l.startsWith("de")) return "de";
  if (l.startsWith("es")) return "es";
  if (l.startsWith("pt")) return "pt";
  return "en";
}

/** presentation 元数据中显式存储的校对语言；未设置时返回 undefined。 */
export function getStoredProofingLanguage(pres: Presentation): string | undefined {
  return normalizeProofingLangId(pres.meta?.[PROOFING_LANG_META_KEY]);
}

/** 运行时校对语言：优先元数据，否则跟随当前 UI locale。 */
export function getEffectiveProofingLanguage(pres: Presentation): string {
  const stored = getStoredProofingLanguage(pres);
  if (stored !== undefined) return stored;
  return localeToProofingLangId();
}

export function proofingLangTag(pres: Presentation): string {
  const id = getEffectiveProofingLanguage(pres);
  return PROOFING_LANGUAGES.find((l) => l.id === id)?.tag ?? "en";
}
