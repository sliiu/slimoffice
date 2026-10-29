export declare const LOCALE_STORAGE_KEY = "pp.locale";
export declare const LOCALE_EXPLICIT_KEY = "pp.locale.explicit";
export type UiLocale = "en" | "zh-CN";
export declare function envDefaultLocale(raw?: string | null): UiLocale;
export declare function normalizeUiLocale(raw: string | null | undefined, fallback?: UiLocale): UiLocale;
export declare function readUrlLocale(search: string): string | null;
export declare function readStoredUiLocale(): string | null;
export declare function persistUiLocale(locale: UiLocale): void;
/**
 * First language the UI can actually show.
 * zh* → zh-CN, en* → en. Any other reported language is English,
 * because those are the only two catalogs. Empty input stays unset.
 */
export declare function browserUiLocale(languages: readonly string[] | null | undefined): UiLocale | null;
export declare function readBrowserUiLocale(): UiLocale | null;
/**
 * Guest surfaces (share, collab invite, live audience).
 * URL → explicit saved choice → browser → fallback (publisher or env).
 * A browser language we do not ship still wins over the publisher's language.
 */
export declare function pickGuestLocale(input: {
    url?: string | null;
    stored?: string | null;
    storedExplicit?: boolean;
    languages?: readonly string[] | null;
    fallback?: string | null;
}): UiLocale;
/** URL → account → explicit localStorage → browser → env default. */
export declare function resolveUiLocale(input: {
    url?: string | null;
    account?: string | null;
    stored?: string | null;
    browser?: string | null;
    envDefault?: string | null;
}): UiLocale;
