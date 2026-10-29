import type { HyperlinkRef } from "./shape";

const SAFE_EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

export function sanitizeExternalUrl(raw: string | undefined | null): string | undefined {
  if (raw == null) return undefined;
  let s = raw.trim();
  if (!s) return undefined;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (!SAFE_EXTERNAL_PROTOCOLS.has(u.protocol)) return undefined;
    if ((u.protocol === "http:" || u.protocol === "https:") && !u.hostname) return undefined;
    return u.href;
  } catch {
    return undefined;
  }
}

export function isSafeExternalUrl(raw: string | undefined | null): boolean {
  return sanitizeExternalUrl(raw) !== undefined;
}

export function sanitizeHyperlinkRef(h: HyperlinkRef | undefined): HyperlinkRef | undefined {
  if (!h) return undefined;
  const out: HyperlinkRef = { ...h };
  if (out.kind === "url") {
    const target = sanitizeExternalUrl(out.target);
    if (target) out.target = target;
    else delete out.target;
  }
  if (out.invalidUrl) {
    const inv = sanitizeExternalUrl(out.invalidUrl);
    if (inv) out.invalidUrl = inv;
    else delete out.invalidUrl;
  }
  if (out.kind === "url" && !out.target && !out.action && !out.sound) return undefined;
  return out;
}
