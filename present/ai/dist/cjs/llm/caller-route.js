"use strict";
/**
 * Optional text and image endpoints. When set, createLlm and image generation
 * use these instead of a key stored in the browser.
 * Pass fetchImpl to attach credentials. This package never sets cookies itself.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.setSystemTextRoute = setSystemTextRoute;
exports.systemTextRoute = systemTextRoute;
exports.isSystemTextRouteActive = isSystemTextRouteActive;
exports.setSystemImageRoute = setSystemImageRoute;
exports.systemImageRoute = systemImageRoute;
let textRoute = null;
let imageRoute = null;
function setSystemTextRoute(route) {
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
function systemTextRoute() {
    return textRoute;
}
function isSystemTextRouteActive() {
    return textRoute !== null;
}
function setSystemImageRoute(route) {
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
function systemImageRoute() {
    return imageRoute;
}
