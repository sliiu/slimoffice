/**
 * Optional text and image endpoints. When set, createLlm and image generation
 * use these instead of a key stored in the browser.
 * Pass fetchImpl to attach credentials. This package never sets cookies itself.
 */
let textRoute = null;
let imageRoute = null;
export function setSystemTextRoute(route) {
    if (!route?.baseURL.trim()) {
        textRoute = null;
        return;
    }
    const baseURL = route.baseURL.replace(/\/$/, "");
    textRoute = {
        model: route.model.trim() || "auto",
        baseURL,
        fetchImpl: route.fetchImpl ?? fetch,
    };
}
export function systemTextRoute() {
    return textRoute;
}
export function isSystemTextRouteActive() {
    return textRoute !== null;
}
export function setSystemImageRoute(route) {
    if (!route?.endpoint.trim()) {
        imageRoute = null;
        return;
    }
    imageRoute = {
        model: route.model.trim() || "auto",
        endpoint: route.endpoint,
        fetchImpl: route.fetchImpl,
    };
}
export function systemImageRoute() {
    return imageRoute;
}
