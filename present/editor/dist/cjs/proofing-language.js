"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setProofingLanguageMeta = exports.getProofingLanguage = exports.PROOFING_LANGUAGES = void 0;
exports.localeToProofingLangId = localeToProofingLangId;
exports.getStoredProofingLanguage = getStoredProofingLanguage;
exports.getEffectiveProofingLanguage = getEffectiveProofingLanguage;
exports.proofingLangTag = proofingLangTag;
const core_1 = require("@sliiu/present-core");
Object.defineProperty(exports, "getProofingLanguage", { enumerable: true, get: function () { return core_1.getProofingLanguage; } });
Object.defineProperty(exports, "setProofingLanguageMeta", { enumerable: true, get: function () { return core_1.setProofingLanguageMeta; } });
const i18n_1 = require("./i18n");
exports.PROOFING_LANGUAGES = [
    { id: "en", labelKey: "proofing.lang.en", tag: "en" },
    { id: "zh", labelKey: "proofing.lang.zh", tag: "zh-CN" },
    { id: "ja", labelKey: "proofing.lang.ja", tag: "ja" },
    { id: "ko", labelKey: "proofing.lang.ko", tag: "ko" },
    { id: "fr", labelKey: "proofing.lang.fr", tag: "fr" },
    { id: "de", labelKey: "proofing.lang.de", tag: "de" },
    { id: "es", labelKey: "proofing.lang.es", tag: "es" },
    { id: "pt", labelKey: "proofing.lang.pt", tag: "pt" },
];
/** 将 UI locale 映射到校对语言 id（无显式存储时作为默认值）。 */
function localeToProofingLangId(locale) {
    const l = (locale ?? (0, i18n_1.getLocale)()).toLowerCase();
    if (l.startsWith("zh"))
        return "zh";
    if (l.startsWith("ja"))
        return "ja";
    if (l.startsWith("ko"))
        return "ko";
    if (l.startsWith("fr"))
        return "fr";
    if (l.startsWith("de"))
        return "de";
    if (l.startsWith("es"))
        return "es";
    if (l.startsWith("pt"))
        return "pt";
    return "en";
}
/** presentation 元数据中显式存储的校对语言；未设置时返回 undefined。 */
function getStoredProofingLanguage(pres) {
    return (0, core_1.normalizeProofingLangId)(pres.meta?.[core_1.PROOFING_LANG_META_KEY]);
}
/** 运行时校对语言：优先元数据，否则跟随当前 UI locale。 */
function getEffectiveProofingLanguage(pres) {
    const stored = getStoredProofingLanguage(pres);
    if (stored !== undefined)
        return stored;
    return localeToProofingLangId();
}
function proofingLangTag(pres) {
    const id = getEffectiveProofingLanguage(pres);
    return exports.PROOFING_LANGUAGES.find((l) => l.id === id)?.tag ?? "en";
}
