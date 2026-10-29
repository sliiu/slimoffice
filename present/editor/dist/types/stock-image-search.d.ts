export interface StockImageHit {
    url: string;
    thumb: string;
    w: number;
    h: number;
    source: "unsplash" | "pexels";
    alt?: string;
    authorName?: string;
    authorUrl?: string;
}
export declare function searchUnsplash(query: string, key: string, signal?: AbortSignal): Promise<StockImageHit[]>;
export declare function searchPexels(query: string, key: string, signal?: AbortSignal): Promise<StockImageHit[]>;
export declare function searchStockImages(query: string, keys: {
    unsplashKey?: string;
    pexelsKey?: string;
}, signal?: AbortSignal): Promise<StockImageHit[]>;
export declare function stockImageToDataUrl(url: string): Promise<string>;
export declare function probeImageSize(dataUrl: string): Promise<{
    w: number;
    h: number;
}>;
