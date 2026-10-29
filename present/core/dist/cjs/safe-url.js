"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeExternalUrl = sanitizeExternalUrl;
exports.isSafeExternalUrl = isSafeExternalUrl;
exports.sanitizeHyperlinkRef = sanitizeHyperlinkRef;
const SAFE_EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);
function sanitizeExternalUrl(raw) {
    if (raw == null)
        return undefined;
    let s = raw.trim();
    if (!s)
        return undefined;
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s))
        s = `https://${s}`;
    try {
        const u = new URL(s);
        if (!SAFE_EXTERNAL_PROTOCOLS.has(u.protocol))
            return undefined;
        if ((u.protocol === "http:" || u.protocol === "https:") && !u.hostname)
            return undefined;
        return u.href;
    }
    catch {
        return undefined;
    }
}
function isSafeExternalUrl(raw) {
    return sanitizeExternalUrl(raw) !== undefined;
}
function sanitizeHyperlinkRef(h) {
    if (!h)
        return undefined;
    const out = { ...h };
    if (out.kind === "url") {
        const target = sanitizeExternalUrl(out.target);
        if (target)
            out.target = target;
        else
            delete out.target;
    }
    if (out.invalidUrl) {
        const inv = sanitizeExternalUrl(out.invalidUrl);
        if (inv)
            out.invalidUrl = inv;
        else
            delete out.invalidUrl;
    }
    if (out.kind === "url" && !out.target && !out.action && !out.sound)
        return undefined;
    return out;
}
