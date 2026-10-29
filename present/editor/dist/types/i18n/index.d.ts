import { type MessageKey } from "./messages-en.js";
export type Locale = string;
type MessageMap = Partial<Record<MessageKey, string>>;
export declare function setLocale(locale: Locale): void;
export declare function getLocale(): Locale;
export declare function registerMessages(locale: Locale, msgs: MessageMap): void;
export declare function t(key: MessageKey, params?: Record<string, string | number>): string;
export type { MessageKey };
