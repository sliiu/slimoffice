export interface StockImageHit {
  url: string;
  thumb: string;
  w: number;
  h: number;
  source: "unsplash" | "pexels";
  alt?: string;
  authorName?: string;
  authorUrl?: string;
}

export async function searchUnsplash(query: string, key: string, signal?: AbortSignal): Promise<StockImageHit[]> {
  const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=12&orientation=landscape`;
  const resp = await fetch(url, {
    headers: { Authorization: `Client-ID ${key}` },
    signal,
  });
  if (!resp.ok) throw new Error(`Unsplash HTTP ${resp.status}`);
  const json = (await resp.json()) as {
    results?: Array<{
      urls?: { regular?: string; small?: string; thumb?: string };
      width?: number;
      height?: number;
      alt_description?: string;
      user?: { name?: string; links?: { html?: string } };
    }>;
  };
  return (json.results ?? [])
    .map(
      (r): StockImageHit => ({
        url: r.urls?.regular ?? r.urls?.small ?? "",
        thumb: r.urls?.thumb ?? r.urls?.small ?? "",
        w: r.width ?? 1600,
        h: r.height ?? 1066,
        source: "unsplash",
        alt: r.alt_description ?? undefined,
        authorName: r.user?.name ?? undefined,
        authorUrl: r.user?.links?.html ?? undefined,
      }),
    )
    .filter((h) => !!h.url);
}

export async function searchPexels(query: string, key: string, signal?: AbortSignal): Promise<StockImageHit[]> {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=12&orientation=landscape`;
  const resp = await fetch(url, {
    headers: { Authorization: key },
    signal,
  });
  if (!resp.ok) throw new Error(`Pexels HTTP ${resp.status}`);
  const json = (await resp.json()) as {
    photos?: Array<{
      src?: { large?: string; medium?: string; tiny?: string };
      width?: number;
      height?: number;
      alt?: string;
      photographer?: string;
      photographer_url?: string;
    }>;
  };
  return (json.photos ?? [])
    .map(
      (p): StockImageHit => ({
        url: p.src?.large ?? p.src?.medium ?? "",
        thumb: p.src?.tiny ?? p.src?.medium ?? "",
        w: p.width ?? 1600,
        h: p.height ?? 1066,
        source: "pexels",
        alt: p.alt ?? undefined,
        authorName: p.photographer ?? undefined,
        authorUrl: p.photographer_url ?? undefined,
      }),
    )
    .filter((h) => !!h.url);
}

export async function searchStockImages(
  query: string,
  keys: { unsplashKey?: string; pexelsKey?: string },
  signal?: AbortSignal,
): Promise<StockImageHit[]> {
  const tasks: Promise<StockImageHit[]>[] = [];
  const unsplashKey = keys.unsplashKey?.trim();
  const pexelsKey = keys.pexelsKey?.trim();
  if (unsplashKey) {
    tasks.push(searchUnsplash(query, unsplashKey, signal).catch(() => []));
  }
  if (pexelsKey) {
    tasks.push(searchPexels(query, pexelsKey, signal).catch(() => []));
  }
  if (!tasks.length) return [];
  const batches = await Promise.all(tasks);
  const seen = new Set<string>();
  const out: StockImageHit[] = [];
  for (const batch of batches) {
    for (const hit of batch) {
      if (seen.has(hit.url)) continue;
      seen.add(hit.url);
      out.push(hit);
    }
  }
  return out;
}

export async function stockImageToDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;
  const resp = await fetch(url, { mode: "cors" });
  if (!resp.ok) throw new Error(`fetch image failed: HTTP ${resp.status}`);
  const blob = await resp.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
}

export function probeImageSize(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || img.width, h: img.naturalHeight || img.height });
    img.onerror = () => reject(new Error("Failed to decode image"));
    img.src = dataUrl;
  });
}
