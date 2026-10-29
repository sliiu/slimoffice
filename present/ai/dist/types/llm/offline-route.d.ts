export interface SystemTextRoute {
    model: string;
    baseURL: string;
    fetchImpl: typeof fetch;
}
export interface SystemImageRoute {
    model: string;
    endpoint: string;
}
export declare function setSystemTextRoute(_route: {
    model: string;
    baseURL: string;
} | null): void;
export declare function systemTextRoute(): SystemTextRoute | null;
export declare function isSystemTextRouteActive(): boolean;
export declare function setSystemImageRoute(_route: {
    model: string;
    endpoint: string;
} | null): void;
export declare function systemImageRoute(): SystemImageRoute | null;
