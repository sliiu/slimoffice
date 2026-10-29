export interface SystemTextRoute {
  model: string;
  baseURL: string;
  fetchImpl: typeof fetch;
}

export interface SystemImageRoute {
  model: string;
  endpoint: string;
}

export function setSystemTextRoute(_route: { model: string; baseURL: string } | null): void {}

export function systemTextRoute(): SystemTextRoute | null {
  return null;
}

export function isSystemTextRouteActive(): boolean {
  return false;
}

export function setSystemImageRoute(_route: { model: string; endpoint: string } | null): void {}

export function systemImageRoute(): SystemImageRoute | null {
  return null;
}
