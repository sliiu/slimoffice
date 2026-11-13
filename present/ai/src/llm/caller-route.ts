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

let textRoute: SystemTextRoute | null = null;
let imageRoute: SystemImageRoute | null = null;

export function setSystemTextRoute(
  route: { model: string; baseURL: string; fetchImpl?: typeof fetch } | null,
): void {
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

export function systemTextRoute(): SystemTextRoute | null {
  return textRoute;
}

export function isSystemTextRouteActive(): boolean {
  return textRoute !== null;
}

export function setSystemImageRoute(
  route: { model: string; endpoint: string; fetchImpl?: typeof fetch } | null,
): void {
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

export function systemImageRoute(): SystemImageRoute | null {
  return imageRoute;
}
