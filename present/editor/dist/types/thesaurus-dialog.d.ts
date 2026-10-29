export declare function fetchSynonyms(word: string): Promise<string[]>;
export declare function fetchRelatedWords(word: string): Promise<string[]>;
export declare function fetchAntonyms(word: string): Promise<string[]>;
export declare function openThesaurusDialog(doc: Document, initialWord: string, onPick: (synonym: string) => void): void;
