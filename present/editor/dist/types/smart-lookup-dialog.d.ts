export interface LookupMeaning {
    partOfSpeech: string;
    definition: string;
    example?: string;
}
export interface SmartLookupResult {
    word: string;
    phonetic?: string;
    meanings: LookupMeaning[];
    wiki?: {
        title: string;
        extract: string;
        url: string;
    };
}
export declare function fetchSmartLookup(word: string, langTag: string): Promise<SmartLookupResult>;
export declare function openSmartLookupDialog(doc: Document, initialWord: string, langTag: string): void;
