export const LOCALE_STORAGE_KEY = "pp.locale";
export const LOCALE_EXPLICIT_KEY = "pp.locale.explicit";
export function envDefaultLocale(raw) {
    return normalizeUiLocale(raw, "en");
}
export function normalizeUiLocale(raw, fallback = "en") {
    const s = (raw ?? "").trim();
    if (!s)
        return fallback;
    const lower = s.toLowerCase();
    if (lower === "zh-cn" || lower.startsWith("zh"))
        return "zh-CN";
    if (lower === "en" || lower.startsWith("en"))
        return "en";
    return fallback;
}
export function readUrlLocale(search) {
    const params = new URLSearchParams(search.startsWith("?") || search.length === 0 ? search : `?${search}`);
    const raw = params.get("locale") ?? params.get("lang");
    return raw?.trim() ? raw : null;
}
export function readStoredUiLocale() {
    try {
        if (typeof localStorage === "undefined")
            return null;
        if (localStorage.getItem(LOCALE_EXPLICIT_KEY) !== "1")
            return null;
        return localStorage.getItem(LOCALE_STORAGE_KEY);
    }
    catch {
        return null;
    }
}
export function persistUiLocale(locale) {
    try {
        if (typeof localStorage === "undefined")
            return;
        localStorage.setItem(LOCALE_STORAGE_KEY, locale);
        localStorage.setItem(LOCALE_EXPLICIT_KEY, "1");
    }
    catch {
        return;
    }
}
/**
 * First language the UI can actually show.
 * zh* → zh-CN, en* → en. Any other reported language is English,
 * because those are the only two catalogs. Empty input stays unset.
 */
export function browserUiLocale(languages) {
    const list = languages ?? [];
    let saw = false;
    for (const raw of list) {
        const s = (raw ?? "").trim();
        if (!s)
            continue;
        saw = true;
        const lower = s.toLowerCase();
        if (lower.startsWith("zh"))
            return "zh-CN";
        if (lower.startsWith("en"))
            return "en";
    }
    return saw ? "en" : null;
}
export function readBrowserUiLocale() {
    if (typeof navigator === "undefined")
        return null;
    const list = navigator.languages?.length
        ? navigator.languages
        : navigator.language
            ? [navigator.language]
            : [];
    return browserUiLocale(list);
}
/**
 * Guest surfaces (share, collab invite, live audience).
 * URL → explicit saved choice → browser → fallback (publisher or env).
 * A browser language we do not ship still wins over the publisher's language.
 */
export function pickGuestLocale(input) {
    const fallback = normalizeUiLocale(input.fallback, "en");
    if (input.url?.trim())
        return normalizeUiLocale(input.url, fallback);
    if (input.storedExplicit && input.stored?.trim())
        return normalizeUiLocale(input.stored, fallback);
    const browser = browserUiLocale(input.languages);
    if (browser)
        return browser;
    return fallback;
}
/** URL → account → explicit localStorage → browser → env default. */
export function resolveUiLocale(input) {
    const fallback = envDefaultLocale(input.envDefault);
    if (input.url?.trim())
        return normalizeUiLocale(input.url, fallback);
    if (input.account?.trim())
        return normalizeUiLocale(input.account, fallback);
    if (input.stored?.trim())
        return normalizeUiLocale(input.stored, fallback);
    if (input.browser?.trim())
        return normalizeUiLocale(input.browser, fallback);
    return fallback;
}
