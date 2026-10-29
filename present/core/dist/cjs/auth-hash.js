"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseAuthHash = parseAuthHash;
exports.authHandoffHash = authHandoffHash;
exports.authTotpHash = authTotpHash;
exports.authOauthSignupHash = authOauthSignupHash;
exports.stripAuthQuery = stripAuthQuery;
const AUTH_QUERY_KEYS = [
    "token",
    "totp_token",
    "oauth_signup_token",
    "oauth_signup_email",
];
function parseAuthHash(hash) {
    const raw = (hash ?? "").startsWith("#") ? hash.slice(1) : (hash ?? "");
    if (!raw.trim())
        return {};
    const params = new URLSearchParams(raw);
    const handoff = params.get("ppt-handoff")?.trim() || undefined;
    const totp = params.get("ppt-totp")?.trim() || undefined;
    const token = params.get("ppt-oauth-signup")?.trim();
    const email = params.get("email")?.trim();
    const whitelist = params.get("whitelist") === "1";
    return {
        handoff,
        totp,
        oauthSignup: token && email ? { token, email, ...(whitelist ? { whitelist: true } : {}) } : undefined,
    };
}
function authHandoffHash(token) {
    const p = new URLSearchParams();
    p.set("ppt-handoff", token);
    return p.toString();
}
function authTotpHash(token) {
    const p = new URLSearchParams();
    p.set("ppt-totp", token);
    return p.toString();
}
function authOauthSignupHash(token, email, opts) {
    const p = new URLSearchParams();
    p.set("ppt-oauth-signup", token);
    p.set("email", email);
    if (opts?.whitelist)
        p.set("whitelist", "1");
    return p.toString();
}
function stripAuthQuery(params) {
    for (const k of AUTH_QUERY_KEYS)
        params.delete(k);
}
