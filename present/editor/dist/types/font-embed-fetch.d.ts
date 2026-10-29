export declare function setGoogleFontProxyBase(base: string | undefined): void;
export declare function fetchGoogleFontBytes(cssUrl: string, weight?: number): Promise<Uint8Array | null>;
export declare function fetchPresetFontDataUrl(family: string, weight?: number): Promise<string | null>;
