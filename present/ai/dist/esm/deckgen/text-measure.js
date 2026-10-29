/** Width / line estimates for truncate-or-split. Never used to shrink font size. */
export function estTextWidth(text, fontSize) {
    let units = 0;
    for (const ch of text) {
        const code = ch.codePointAt(0) ?? 0;
        units += code >= 0x2e80 ? 1 : 0.56;
    }
    return units * fontSize;
}
export function estLines(text, fontSize, maxW) {
    return Math.max(1, Math.ceil(estTextWidth(text, fontSize) / Math.max(1, maxW)));
}
/** Truncate to `maxChars` (grapheme-ish by code point). Never changes font size. */
export function truncateChars(text, maxChars) {
    const chars = [...text.trim()];
    if (chars.length <= maxChars)
        return { text: chars.join(""), truncated: false };
    if (maxChars <= 1)
        return { text: "…", truncated: true };
    return { text: `${chars.slice(0, maxChars - 1).join("")}…`, truncated: true };
}
/** Truncate so estimated lines stay within `maxLines` at a locked font size. */
export function truncateToLines(text, fontSize, maxW, maxLines) {
    const src = text.trim();
    if (estLines(src, fontSize, maxW) <= maxLines)
        return { text: src, truncated: false };
    const chars = [...src];
    let lo = 1;
    let hi = chars.length;
    let best = "…";
    while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        const cand = `${chars.slice(0, mid).join("")}…`;
        if (estLines(cand, fontSize, maxW) <= maxLines) {
            best = cand;
            lo = mid + 1;
        }
        else {
            hi = mid - 1;
        }
    }
    return { text: best, truncated: true };
}
export function chunk(items, size) {
    if (size <= 0)
        return [items];
    const out = [];
    for (let i = 0; i < items.length; i += size)
        out.push(items.slice(i, i + size));
    return out.length ? out : [[]];
}
