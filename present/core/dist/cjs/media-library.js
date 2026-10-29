"use strict";
/** User media library (images / audio / video) shared across decks. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MEDIA_LIBRARY_ID_RE = exports.MEDIA_LIBRARY_MAX_ITEM_BYTES = exports.MEDIA_LIBRARY_DEFAULT_CATEGORY_ID = void 0;
exports.emptyMediaLibraryIndex = emptyMediaLibraryIndex;
exports.kindFromMime = kindFromMime;
exports.isAllowedLibraryMime = isAllowedLibraryMime;
exports.sanitizeLibraryName = sanitizeLibraryName;
exports.newLibraryId = newLibraryId;
exports.assertLibraryId = assertLibraryId;
exports.normalizeMediaLibraryIndex = normalizeMediaLibraryIndex;
exports.MEDIA_LIBRARY_DEFAULT_CATEGORY_ID = "cat_default";
exports.MEDIA_LIBRARY_MAX_ITEM_BYTES = 80 * 1024 * 1024;
exports.MEDIA_LIBRARY_ID_RE = /^[a-zA-Z0-9_-]{4,64}$/;
function emptyMediaLibraryIndex() {
    return {
        v: 1,
        categories: [
            { id: exports.MEDIA_LIBRARY_DEFAULT_CATEGORY_ID, name: "Uncategorized", order: 0 },
        ],
        items: [],
    };
}
function kindFromMime(mime) {
    const m = (mime || "").split(";")[0].trim().toLowerCase();
    if (m.startsWith("image/"))
        return "image";
    if (m.startsWith("video/"))
        return "video";
    if (m.startsWith("audio/"))
        return "audio";
    return null;
}
function isAllowedLibraryMime(mime) {
    return kindFromMime(mime) !== null;
}
function sanitizeLibraryName(raw, fallback = "Untitled") {
    const name = raw.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 160);
    return name || fallback;
}
function newLibraryId(prefix) {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${prefix}_${hex}`;
}
function assertLibraryId(id) {
    if (!exports.MEDIA_LIBRARY_ID_RE.test(id))
        throw new Error("INVALID_LIBRARY_ID");
}
function normalizeMediaLibraryIndex(raw) {
    const empty = emptyMediaLibraryIndex();
    if (!raw || typeof raw !== "object")
        return empty;
    const rec = raw;
    const categories = [];
    const seenCat = new Set();
    if (Array.isArray(rec.categories)) {
        for (const row of rec.categories) {
            if (!row || typeof row !== "object")
                continue;
            const id = String(row.id ?? "");
            if (!exports.MEDIA_LIBRARY_ID_RE.test(id) || seenCat.has(id))
                continue;
            seenCat.add(id);
            categories.push({
                id,
                name: sanitizeLibraryName(String(row.name ?? ""), "Untitled"),
                order: Number.isFinite(row.order) ? Number(row.order) : categories.length,
            });
        }
    }
    if (!categories.some((c) => c.id === exports.MEDIA_LIBRARY_DEFAULT_CATEGORY_ID)) {
        categories.unshift(empty.categories[0]);
    }
    categories.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    const items = [];
    const seenItem = new Set();
    if (Array.isArray(rec.items)) {
        for (const row of rec.items) {
            if (!row || typeof row !== "object")
                continue;
            const id = String(row.id ?? "");
            const hash = String(row.hash ?? "").toLowerCase();
            const kind = row.kind === "image" || row.kind === "video" || row.kind === "audio" ? row.kind : null;
            if (!exports.MEDIA_LIBRARY_ID_RE.test(id) || seenItem.has(id) || !kind)
                continue;
            if (!/^[a-f0-9]{64}$/.test(hash))
                continue;
            seenItem.add(id);
            const categoryId = seenCat.has(String(row.categoryId ?? ""))
                ? String(row.categoryId)
                : exports.MEDIA_LIBRARY_DEFAULT_CATEGORY_ID;
            items.push({
                id,
                categoryId,
                kind,
                name: sanitizeLibraryName(String(row.name ?? ""), "Untitled"),
                mime: String(row.mime ?? "application/octet-stream").slice(0, 120),
                hash,
                bytes: Math.max(0, Math.floor(Number(row.bytes) || 0)),
                width: Number.isFinite(row.width) ? Number(row.width) : undefined,
                height: Number.isFinite(row.height) ? Number(row.height) : undefined,
                duration: Number.isFinite(row.duration) ? Number(row.duration) : undefined,
                createdAt: Math.max(0, Math.floor(Number(row.createdAt) || Date.now())),
                updatedAt: Math.max(0, Math.floor(Number(row.updatedAt) || Date.now())),
            });
        }
    }
    return { v: 1, categories, items };
}
