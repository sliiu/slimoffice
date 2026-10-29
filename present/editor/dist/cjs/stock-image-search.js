"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchUnsplash = searchUnsplash;
exports.searchPexels = searchPexels;
exports.searchStockImages = searchStockImages;
exports.stockImageToDataUrl = stockImageToDataUrl;
exports.probeImageSize = probeImageSize;
async function searchUnsplash(query, key, signal) {
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=12&orientation=landscape`;
    const resp = await fetch(url, {
        headers: { Authorization: `Client-ID ${key}` },
        signal,
    });
    if (!resp.ok)
        throw new Error(`Unsplash HTTP ${resp.status}`);
    const json = (await resp.json());
    return (json.results ?? [])
        .map((r) => ({
        url: r.urls?.regular ?? r.urls?.small ?? "",
        thumb: r.urls?.thumb ?? r.urls?.small ?? "",
        w: r.width ?? 1600,
        h: r.height ?? 1066,
        source: "unsplash",
        alt: r.alt_description ?? undefined,
        authorName: r.user?.name ?? undefined,
        authorUrl: r.user?.links?.html ?? undefined,
    }))
        .filter((h) => !!h.url);
}
async function searchPexels(query, key, signal) {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=12&orientation=landscape`;
    const resp = await fetch(url, {
        headers: { Authorization: key },
        signal,
    });
    if (!resp.ok)
        throw new Error(`Pexels HTTP ${resp.status}`);
    const json = (await resp.json());
    return (json.photos ?? [])
        .map((p) => ({
        url: p.src?.large ?? p.src?.medium ?? "",
        thumb: p.src?.tiny ?? p.src?.medium ?? "",
        w: p.width ?? 1600,
        h: p.height ?? 1066,
        source: "pexels",
        alt: p.alt ?? undefined,
        authorName: p.photographer ?? undefined,
        authorUrl: p.photographer_url ?? undefined,
    }))
        .filter((h) => !!h.url);
}
async function searchStockImages(query, keys, signal) {
    const tasks = [];
    const unsplashKey = keys.unsplashKey?.trim();
    const pexelsKey = keys.pexelsKey?.trim();
    if (unsplashKey) {
        tasks.push(searchUnsplash(query, unsplashKey, signal).catch(() => []));
    }
    if (pexelsKey) {
        tasks.push(searchPexels(query, pexelsKey, signal).catch(() => []));
    }
    if (!tasks.length)
        return [];
    const batches = await Promise.all(tasks);
    const seen = new Set();
    const out = [];
    for (const batch of batches) {
        for (const hit of batch) {
            if (seen.has(hit.url))
                continue;
            seen.add(hit.url);
            out.push(hit);
        }
    }
    return out;
}
async function stockImageToDataUrl(url) {
    if (url.startsWith("data:"))
        return url;
    const resp = await fetch(url, { mode: "cors" });
    if (!resp.ok)
        throw new Error(`fetch image failed: HTTP ${resp.status}`);
    const blob = await resp.blob();
    return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
        reader.readAsDataURL(blob);
    });
}
function probeImageSize(dataUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth || img.width, h: img.naturalHeight || img.height });
        img.onerror = () => reject(new Error("Failed to decode image"));
        img.src = dataUrl;
    });
}
