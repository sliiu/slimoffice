// 单张 stock 图：query → dataURL（Unsplash / Pexels，与 enrich/images 同源）。
//
// 选优逻辑（P0-2/3）：
//   - 不再无脑取 hits[0]，而是在整批候选里按 (1) 去重 (2) 目标比例匹配 (3) 分辨率
//     综合打分，挑最合适的一张。目标比例来自调用方（bg=slide 比例，hero/inline=预留
//     bbox 比例），避免把竖图硬塞进宽 slot 被拉伸 / 裁掉主体。
//   - usedUrls 是 deck 级共享集合：命中过的原图 url 记进去，同一篇里尽量不重复出现
//     同一张照片（弱模型经常给多页写近似 query）。
import { searchPexels, searchUnsplash, toDataUrl } from "../../tools/helpers/images.js";
/** 平均色 → 相对亮度 (0..1) 与 HSL 饱和度 (0..1)；解析失败返回 undefined。 */
export function hitToneOf(color) {
    const m = /^#?([0-9a-f]{6})$/i.exec((color ?? "").trim());
    if (!m)
        return undefined;
    const n = parseInt(m[1], 16);
    const r = ((n >> 16) & 255) / 255;
    const g = ((n >> 8) & 255) / 255;
    const b = (n & 255) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const s = max === min ? 0 : (max - min) / (1 - Math.abs(max + min - 1));
    return { l, s };
}
/** 0 = 完美贴合基调；越大越偏离。无 tone 或无平均色 = 0（不影响排序）。 */
export function toneDistance(color, tone) {
    if (!tone)
        return 0;
    const t = hitToneOf(color);
    if (!t)
        return 0.5;
    const want = tone === "dark" ? 0.28 : 0.72;
    return Math.abs(t.l - want) + t.s * 0.5;
}
/**
 * 在一批候选里挑最合适的一张：
 *   1. 先排除 usedUrls 里已出现过的（去重）；若全被用过则退回全量（宁可重复也别没图）。
 *   2. 有 targetAspect 时按 log 比例距离升序（对称，不偏向宽/窄）。
 *   3. 比例接近程度相当（差 < 0.05）时，用像素面积做次级排序，取更清晰的。
 */
export function pickBestHit(hits, targetAspect, usedUrls, tone) {
    const valid = hits.filter((h) => !!h.url);
    if (valid.length === 0)
        return undefined;
    const fresh = usedUrls ? valid.filter((h) => !usedUrls.has(h.url)) : valid;
    const pool = fresh.length > 0 ? fresh : valid;
    const scored = pool.map((h) => {
        const aspect = h.h > 0 ? h.w / h.h : (targetAspect ?? 1);
        const dist = targetAspect && targetAspect > 0 ? Math.abs(Math.log(aspect / targetAspect)) : 0;
        return { h, dist, tone: toneDistance(h.color, tone), lettered: hasLettering(h.alt), px: h.w * h.h };
    });
    // 图里自带文字的（书脊 / 招牌 / 网页截图）先让位：它会和压在上面的标题打架；
    // 然后比例明显更接近的优先；比例相当时看基调贴合度；再相当时取更清晰的一张。
    scored.sort((a, b) => {
        if (a.lettered !== b.lettered)
            return a.lettered ? 1 : -1;
        if (Math.abs(a.dist - b.dist) > 0.05)
            return a.dist - b.dist;
        if (Math.abs(a.tone - b.tone) > 0.08)
            return a.tone - b.tone;
        return b.px - a.px;
    });
    return scored[0]?.h;
}
/**
 * The alt text says the picture is mostly lettering — a shelf of book spines, a shop sign, a
 * screenshot, a poster. Stock search has no "no text in image" filter, so this is the proxy.
 */
export function hasLettering(alt) {
    if (!alt)
        return false;
    return /\b(books?|book ?shelf|spines?|magazines?|newspapers?|sign(age|s|board)?|neon|poster|billboard|screenshot|website|web ?page|app screen|text|letters?|lettering|typography|words?|quote|logo|menu|chalkboard|whiteboard with|sticky notes?)\b/i.test(alt);
}
/** Clauses that describe what must NOT be in the picture — stock search has no negation. */
const NEGATION = /\b(no|not|without|never)\b/i;
/** Words that describe the request, not the subject; they only dilute a keyword search. */
const FILLER = /\b(photo(graph)?s?|image|picture|shot|conceptual|cinematic|editorial|stock|style|mood|feel(ing)?|sense of [\w\s]+?(?=,|$)|split[- ]screen|montage|composite|\d+:\d+|16x9|4k|hd)\b/gi;
/**
 * Turn an author's image idea into something a stock API can match. Models write prose
 * ("Split-screen conceptual photo: left side …, cool blue rim light, no text in image"); Unsplash /
 * Pexels rank on keywords, so the negations and framing words are dropped, the subject clauses are
 * kept, and the whole thing is capped at ten words. Short ideas pass through untouched.
 */
export function stockQueryFromIdea(idea) {
    const raw = idea.replace(/\([^)]*\)/g, " ").trim();
    if (!raw)
        return raw;
    if (raw.split(/\s+/).length <= 10 && !NEGATION.test(raw))
        return raw;
    const clauses = raw
        .split(/[,;:.]|\s[—–-]\s/)
        .map((c) => c.replace(FILLER, " ").replace(/\s+/g, " ").trim())
        .filter((c) => c && !NEGATION.test(c));
    // Whole clauses while they fit; once five words are in, a clause that would overflow is dropped
    // rather than cut mid-phrase.
    const words = [];
    for (const c of clauses) {
        const ws = c.split(" ");
        if (words.length >= 5 && words.length + ws.length > 10)
            break;
        for (const w of ws) {
            if (words.length >= 10)
                break;
            words.push(w);
        }
        if (words.length >= 10)
            break;
    }
    return words.join(" ") || raw;
}
/**
 * Queries to try in order: the compacted idea, then its first clause, then its first three words.
 * Stock search is AND-ish — "empty conference hall after a talk house lights up" returns nothing on
 * Unsplash while "empty conference hall" returns pages — so a miss backs off to the subject.
 */
export function stockQueryLadder(idea) {
    const full = stockQueryFromIdea(idea);
    const firstClause = idea
        .replace(/\([^)]*\)/g, " ")
        .split(/[,;:.]|\s[—–-]\s/)[0]
        .replace(FILLER, " ")
        .replace(/\s+/g, " ")
        .trim();
    const subjectWords = full.split(" ").slice(0, 3);
    while (subjectWords.length > 1 && /^(a|an|the|at|on|in|of|with|and|or|for|to|by|over|under)$/i.test(subjectWords.at(-1)))
        subjectWords.pop();
    const subject = subjectWords.join(" ");
    const out = [];
    for (const q of [full, firstClause, subject])
        if (q && !out.includes(q))
            out.push(q);
    return out;
}
export async function fetchStockImageDataUrl(idea, config, opts = {}) {
    const { signal, targetAspect, usedUrls, tone } = opts;
    const unsplashKey = config.imagery.unsplashKey.trim();
    const pexelsKey = config.imagery.pexelsKey.trim();
    let candidates = [];
    for (const query of stockQueryLadder(idea)) {
        if (signal?.aborted)
            break;
        if (unsplashKey) {
            try {
                candidates = await searchUnsplash(query, unsplashKey, signal);
            }
            catch { }
        }
        if (candidates.length === 0 && pexelsKey) {
            try {
                candidates = await searchPexels(query, pexelsKey, signal);
            }
            catch { }
        }
        if (candidates.length > 0)
            break;
    }
    const hit = pickBestHit(candidates, targetAspect, usedUrls, tone);
    if (!hit)
        return null;
    try {
        const dataUrl = await toDataUrl({ kind: "url", url: hit.url });
        usedUrls?.add(hit.url);
        return { dataUrl, w: hit.w, h: hit.h };
    }
    catch {
        return null;
    }
}
