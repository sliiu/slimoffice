export interface StockImagePickerResult {
    dataUrl: string;
    natural: {
        w: number;
        h: number;
    };
    attribution?: string;
}
export interface StockImagePickerOptions {
    keys: {
        unsplashKey?: string;
        pexelsKey?: string;
    };
    onMissingKeys?: () => void;
}
/** Insert → Online Pictures：Unsplash / Pexels 搜索并插入。 */
export declare function openStockImagePickerDialog(doc: Document, opts: StockImagePickerOptions): Promise<StockImagePickerResult | null>;
