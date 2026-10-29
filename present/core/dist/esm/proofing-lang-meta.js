export const PROOFING_LANG_META_KEY = "proofingLang";
/** presentation tags part 中 SlimPPT 校对语言元数据键名。 */
export const PROOFING_LANG_META_TAG = "SlimPPT.ProofingLang.v1";
const DEFAULT_PROOFING_LANG = "en";
export function normalizeProofingLangId(lang) {
    if (typeof lang !== "string" || !lang.trim())
        return undefined;
    return lang.trim();
}
/** SlimPPT 校对语言 id → OOXML `a:defRPr@lang`（Office 拼写检查认这个）。 */
export function ooxmlLangFromProofingId(id) {
    switch (id) {
        case "zh":
            return "zh-CN";
        case "ja":
            return "ja-JP";
        case "ko":
            return "ko-KR";
        case "fr":
            return "fr-FR";
        case "de":
            return "de-DE";
        case "es":
            return "es-ES";
        case "pt":
            return "pt-BR";
        default:
            return "en-US";
    }
}
/** OOXML `lang` / BCP-47 → SlimPPT 校对语言 id。无法识别时返回 undefined。 */
export function proofingIdFromOoxmlLang(lang) {
    if (!lang?.trim())
        return undefined;
    const l = lang.trim().toLowerCase();
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
    if (l.startsWith("en"))
        return "en";
    return undefined;
}
export function getProofingLanguage(pres) {
    const raw = pres.meta?.[PROOFING_LANG_META_KEY];
    return normalizeProofingLangId(raw) ?? DEFAULT_PROOFING_LANG;
}
export function setProofingLanguageMeta(pres, langId) {
    const lang = normalizeProofingLangId(langId);
    if (!lang || lang === DEFAULT_PROOFING_LANG) {
        if (!pres.meta)
            return;
        const next = { ...pres.meta };
        delete next[PROOFING_LANG_META_KEY];
        pres.meta = Object.keys(next).length ? next : undefined;
        return;
    }
    pres.meta = { ...pres.meta, [PROOFING_LANG_META_KEY]: lang };
}
/** 序列化校对语言 id（经 tags 侧车 round-trip；默认 `en` 省略）。 */
export function buildProofingLangMeta(pres) {
    const lang = getProofingLanguage(pres);
    if (lang === DEFAULT_PROOFING_LANG)
        return undefined;
    const payload = { v: 1, lang };
    return JSON.stringify(payload);
}
export function applyProofingLangMeta(pres, raw) {
    if (!raw?.trim())
        return;
    try {
        const o = JSON.parse(raw);
        if (o.v !== 1)
            return;
        setProofingLanguageMeta(pres, o.lang);
    }
    catch {
        // ignore malformed sidecar
    }
}
