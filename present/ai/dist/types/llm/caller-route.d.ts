/**
 * Optional text and image endpoints. When set, createLlm and image generation
 * use these instead of a key stored in the browser.
 * Pass fetchImpl to attach credentials. This package never sets cookies itself.
 */
export interface SystemTextRoute {
    model: string;
    baseURL: string;
    fetchImpl: typeof fetch;
}
export interface SystemImageRoute {
    model: string;
    endpoint: string;
    fetchImpl?: typeof fetch;
}
export declare function setSystemTextRoute(route: {
    model: string;
    baseURL: string;
    fetchImpl?: typeof fetch;
} | null): void;
export declare function systemTextRoute(): SystemTextRoute | null;
export declare function isSystemTextRouteActive(): boolean;
export declare function setSystemImageRoute(route: {
    model: string;
    endpoint: string;
    fetchImpl?: typeof fetch;
} | null): void;
export declare function systemImageRoute(): SystemImageRoute | null;
