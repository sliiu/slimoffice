const AUTH_QUERY_KEYS = [
  "token",
  "totp_token",
  "oauth_signup_token",
  "oauth_signup_email",
] as const;

export interface AuthHash {
  handoff?: string;
  totp?: string;
  oauthSignup?: { token: string; email: string; whitelist?: boolean };
}

export function parseAuthHash(hash: string | undefined | null): AuthHash {
  const raw = (hash ?? "").startsWith("#") ? hash!.slice(1) : (hash ?? "");
  if (!raw.trim()) return {};
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

export function authHandoffHash(token: string): string {
  const p = new URLSearchParams();
  p.set("ppt-handoff", token);
  return p.toString();
}

export function authTotpHash(token: string): string {
  const p = new URLSearchParams();
  p.set("ppt-totp", token);
  return p.toString();
}

export function authOauthSignupHash(token: string, email: string, opts?: { whitelist?: boolean }): string {
  const p = new URLSearchParams();
  p.set("ppt-oauth-signup", token);
  p.set("email", email);
  if (opts?.whitelist) p.set("whitelist", "1");
  return p.toString();
}

export function stripAuthQuery(params: URLSearchParams): void {
  for (const k of AUTH_QUERY_KEYS) params.delete(k);
}
