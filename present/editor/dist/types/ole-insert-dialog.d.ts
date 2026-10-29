export interface OleInsertResult {
    fileName: string;
    embedSrc: string;
    showAsIcon: boolean;
}
export declare function openOleInsertDialog(doc: Document): Promise<OleInsertResult | null>;
