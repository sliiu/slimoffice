export declare function fetchTranslation(text: string, fromTag: string, toTag: string): Promise<string>;
export declare function openTranslateDialog(doc: Document, opts: {
    sourceText: string;
    fromLang: string;
    toLang: string;
    onApply: (translated: string) => void;
}): void;
