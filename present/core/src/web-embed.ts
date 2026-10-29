/** Web embed provider id (YouTube / Vimeo). `custom` is rejected. */
export type WebEmbedProvider = "youtube" | "vimeo" | "custom";

export interface NormalizedWebEmbed {
  embedUrl: string;
  provider: WebEmbedProvider;
  originalUrl: string;
}

function youtubeEmbedId(id: string): string {
  return `https://www.youtube.com/embed/${id}`;
}

function parseYoutube(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, "");
  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? youtubeEmbedId(id) : null;
  }
  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname.startsWith("/embed/")) {
      const id = url.pathname.split("/")[2];
      return id ? youtubeEmbedId(id) : null;
    }
    if (url.pathname.startsWith("/shorts/")) {
      const id = url.pathname.split("/")[2];
      return id ? youtubeEmbedId(id) : null;
    }
    const v = url.searchParams.get("v");
    return v ? youtubeEmbedId(v) : null;
  }
  return null;
}

function parseVimeo(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, "");
  if (host === "vimeo.com") {
    const id = url.pathname.match(/^\/(\d+)/)?.[1];
    return id ? `https://player.vimeo.com/video/${id}` : null;
  }
  if (host === "player.vimeo.com") {
    const id = url.pathname.match(/^\/video\/(\d+)/)?.[1];
    return id ? `https://player.vimeo.com/video/${id}` : null;
  }
  return null;
}

export const WEB_EMBED_DESCR_PREFIX = "ppt-web-embed:";

export function encodeWebEmbedDescr(embed: NormalizedWebEmbed): string {
  const url = embed.originalUrl || embed.embedUrl;
  return `${WEB_EMBED_DESCR_PREFIX}${embed.provider}:${url}`;
}

export function decodeWebEmbedDescr(descr?: string): NormalizedWebEmbed | null {
  if (!descr?.startsWith(WEB_EMBED_DESCR_PREFIX)) return null;
  const rest = descr.slice(WEB_EMBED_DESCR_PREFIX.length);
  const i = rest.indexOf(":");
  if (i < 0) return normalizeWebEmbedUrl(rest);
  return normalizeWebEmbedUrl(rest.slice(i + 1));
}

export function isAllowedWebEmbedSrc(src: string | undefined | null): boolean {
  if (!src) return false;
  try {
    const u = new URL(src);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "youtube-nocookie.com") {
      return u.pathname.startsWith("/embed/");
    }
    if (host === "player.vimeo.com") {
      return /^\/video\/\d+/.test(u.pathname);
    }
    return false;
  } catch {
    return false;
  }
}

/** Parse a user URL into a YouTube / Vimeo HTTPS iframe `src`. */
export function normalizeWebEmbedUrl(input: string): NormalizedWebEmbed | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;

    const yt = parseYoutube(url);
    if (yt) {
      return { embedUrl: yt, provider: "youtube", originalUrl: trimmed };
    }

    const vm = parseVimeo(url);
    if (vm) {
      return { embedUrl: vm, provider: "vimeo", originalUrl: trimmed };
    }

    return null;
  } catch {
    return null;
  }
}
