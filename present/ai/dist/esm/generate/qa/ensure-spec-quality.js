// 生成后、compile 前：确定性落实 skill 节奏 / 视觉锚点（不调 LLM）。
//
// 弱模型常忽略 prompt 里的「禁止连续 bullets / 封面要有图」。这里把能机械修好的
// 直接改 SlideSpec，保证进 enrich / QA 的已经是「可用 + 较精美」的骨架。
import { bannedLayoutsForFamily } from "../schema.js";
const TEXT_HEAVY = new Set(["bullets", "content"]);
const VISUAL_BG_KINDS = new Set(["cover", "hero", "section", "closing", "stat", "quote"]);
/** 连续 text-heavy 的升级轮换次序。outline 阶段的节奏兜底也复用（保持两级一致）。 */
export const UPGRADE_FROM_BULLETS = [
    "cards",
    "banner",
    "image-text",
    "metrics",
    "process",
    "two-column",
];
function copyEnrichment(from, extra = {}) {
    const f = from;
    return {
        ...(f.bgImageQuery ? { bgImageQuery: f.bgImageQuery } : {}),
        ...(f.bgOverlay !== undefined ? { bgOverlay: f.bgOverlay } : {}),
        ...(f.heroImageQuery ? { heroImageQuery: f.heroImageQuery } : {}),
        ...(f.notes ? { notes: f.notes } : {}),
        ...extra,
    };
}
function bulletsOf(spec) {
    if (spec.kind === "bullets" || spec.kind === "image-text" || spec.kind === "banner") {
        return spec.bullets;
    }
    if (spec.kind === "content")
        return spec.body.split(/\n+/).filter(Boolean);
    if (spec.kind === "two-column")
        return [...spec.leftBullets, ...spec.rightBullets];
    if (spec.kind === "comparison")
        return [...spec.leftBullets, ...spec.rightBullets];
    if (spec.kind === "cards")
        return spec.cards.map((c) => `${c.title}: ${c.body}`);
    if (spec.kind === "agenda")
        return spec.items.map((i) => i.label);
    if (spec.kind === "process")
        return spec.steps.map((s) => s.title);
    if (spec.kind === "timeline")
        return spec.steps.map((s) => s.label);
    if (spec.kind === "metrics")
        return spec.metrics.map((m) => `${m.value}|${m.label}`);
    if (spec.kind === "chart")
        return spec.categories;
    return [titleOf(spec)];
}
function titleOf(spec) {
    if (spec.kind === "quote")
        return spec.quote.slice(0, 24);
    if (spec.kind === "stat")
        return spec.label;
    return spec.title ?? "Slide";
}
function toCards(spec) {
    const raw = bulletsOf(spec);
    const cards = (raw.length >= 2 ? raw : [titleOf(spec), ...raw]).slice(0, 4).map((b) => {
        const parts = b.split(/[:：—|-]/);
        return {
            title: (parts[0] ?? b).trim().slice(0, 24) || b.slice(0, 24),
            body: (parts.slice(1).join(":").trim() || b).slice(0, 80),
        };
    });
    while (cards.length < 2) {
        cards.push({ title: `Point ${cards.length + 1}`, body: titleOf(spec) });
    }
    return { kind: "cards", title: titleOf(spec), cards, ...copyEnrichment(spec) };
}
function toBanner(spec) {
    const bullets = bulletsOf(spec);
    return {
        kind: "banner",
        title: titleOf(spec),
        bullets: bullets.length > 0 ? bullets.slice(0, 6) : [titleOf(spec)],
        ...copyEnrichment(spec),
    };
}
function toImageText(spec, seed) {
    const bullets = bulletsOf(spec).slice(0, 6);
    const title = titleOf(spec);
    return {
        kind: "image-text",
        title,
        bullets: bullets.length > 0 ? bullets : [title],
        imageQuery: defaultImageQuery("inline", title, seed.topic, seed.idea),
        imagePosition: "right",
        ...copyEnrichment(spec),
    };
}
function toMetrics(spec) {
    const raw = bulletsOf(spec);
    const metrics = raw.slice(0, 4).map((b, i) => {
        const [value, ...rest] = b.split(/[|：:]/);
        return {
            value: (value ?? `${i + 1}x`).trim().slice(0, 8),
            label: (rest.join(":") || b).trim().slice(0, 28),
        };
    });
    while (metrics.length < 2) {
        metrics.push({ value: `${metrics.length + 1}x`, label: titleOf(spec).slice(0, 28) });
    }
    return { kind: "metrics", title: titleOf(spec), metrics, ...copyEnrichment(spec) };
}
function convertTo(kind, spec, seed) {
    switch (kind) {
        case "cards":
            return toCards(spec);
        case "banner":
            return toBanner(spec);
        case "image-text":
            return toImageText(spec, seed);
        case "metrics":
            return toMetrics(spec);
        case "two-column": {
            const raw = bulletsOf(spec);
            const half = Math.ceil(raw.length / 2) || 1;
            return {
                kind: "two-column",
                title: titleOf(spec),
                leftBullets: raw.slice(0, half).length ? raw.slice(0, half) : [titleOf(spec)],
                rightBullets: raw.slice(half).length ? raw.slice(half) : [""],
                ...copyEnrichment(spec),
            };
        }
        case "process": {
            const raw = bulletsOf(spec);
            while (raw.length < 3)
                raw.push(`Step ${raw.length + 1}`);
            return {
                kind: "process",
                title: titleOf(spec),
                steps: raw.slice(0, 5).map((t) => ({ title: t.slice(0, 24) })),
                ...copyEnrichment(spec),
            };
        }
        case "comparison": {
            const raw = bulletsOf(spec);
            const half = Math.ceil(raw.length / 2) || 1;
            return {
                kind: "comparison",
                title: titleOf(spec),
                leftLabel: "A",
                rightLabel: "B",
                leftBullets: raw.slice(0, half).length ? raw.slice(0, half) : [titleOf(spec)],
                rightBullets: raw.slice(half).length ? raw.slice(half) : [""],
                ...copyEnrichment(spec),
            };
        }
        default:
            return toCards(spec);
    }
}
export function remapSlideSpec(kind, spec, seed = {}) {
    return convertTo(kind, spec, seed);
}
/** 各角色的取景/光线修饰词 —— 只负责"怎么拍"，主体由前面的种子决定。 */
const IMAGE_QUERY_SUFFIX = {
    bg: "cinematic backdrop soft bokeh",
    inline: "product detail soft light",
    hero: "cinematic wide atmosphere",
};
/**
 * 兜底配图关键词。种子优先级：
 *   1. 大纲的 imageIdea —— LLM 已经按"主体 + 场景 + 光线"写好的英文方向，最贴题；
 *   2. topic + title 里的拉丁片段；
 *   3. 纯非拉丁（中文 deck 最常见）→ 原样保留标题/主题作为主体。
 *
 * 第 3 条以前直接返回 "cinematic abstract gradient soft bokeh atmosphere" 这类通用词，
 * 于是整篇中文 PPT 每页都在抓同一批抽象光斑图 —— 这正是"配图跟主题完全不符"的来源。
 * 图库搜中文基本必然 miss，但 miss 之后会回退 AI 生图，而生图模型完全读得懂中文主体；
 * 给它真实主体远好过给它一句放之四海而皆准的氛围词。
 */
export function defaultImageQuery(kind, title, topic, imageIdea) {
    const suffix = IMAGE_QUERY_SUFFIX[kind];
    const idea = imageIdea?.trim();
    // imageIdea 本身就是完整的取景描述，别再叠一层修饰词把它冲淡。
    if (idea && idea.length >= 4)
        return idea.slice(0, 160);
    const seed = [topic, title].filter(Boolean).join(" ");
    const latin = seed.match(/[A-Za-z][A-Za-z0-9\s-]{2,}/g)?.join(" ").trim();
    if (latin && latin.length >= 4)
        return `${latin.slice(0, 48)} ${suffix}`;
    const native = seed.trim();
    if (native)
        return `${native.slice(0, 48)} ${suffix}`;
    const defaults = {
        bg: "cinematic abstract gradient soft bokeh atmosphere",
        inline: "editorial product detail soft natural light",
        hero: "dramatic keynote stage lighting wide shot",
    };
    return defaults[kind] ?? defaults.bg;
}
function ensureBgQuery(spec, seed) {
    if (!VISUAL_BG_KINDS.has(spec.kind))
        return spec;
    const s = spec;
    if (s.bgImageQuery?.trim()) {
        if (s.bgOverlay === undefined)
            return { ...s, bgOverlay: 0.6 };
        return spec;
    }
    return {
        ...s,
        bgImageQuery: defaultImageQuery("bg", titleOf(spec), seed.topic, seed.idea),
        bgOverlay: s.bgOverlay ?? 0.6,
    };
}
function ensureNotes(spec) {
    const s = spec;
    if (s.notes?.trim())
        return spec;
    const title = titleOf(spec);
    return {
        ...s,
        notes: `Highlight: ${title}. Pause on the key number or visual, then bridge to the next slide.`,
    };
}
function ensureImageTextQuery(spec, seed) {
    if (spec.kind !== "image-text")
        return spec;
    if (spec.imageQuery?.trim())
        return spec;
    return {
        ...spec,
        imageQuery: defaultImageQuery("inline", spec.title, seed.topic, seed.idea),
    };
}
/**
 * bullets 页无任何配图（无 bg 无 hero）→ 补 heroImageQuery（右半屏配图，enrich
 * 插入时会自动把正文收缩到左侧）。"满屏文字页"是用户最直接的"内容单薄"观感来源。
 */
function ensureBulletsHeroQuery(spec, seed) {
    if (spec.kind !== "bullets")
        return spec;
    const s = spec;
    if (s.bgImageQuery?.trim() || s.heroImageQuery?.trim())
        return spec;
    return {
        ...s,
        heroImageQuery: defaultImageQuery("hero", titleOf(spec), seed.topic, seed.idea),
    };
}
/**
 * 确定性提升 SlideSpec 质量（mutate 副本，返回新数组）：
 *   1. 开场/收束版式
 *   2. 打破连续 text-heavy（升级为 cards/banner/…）
 *   3. 视觉页补 bgImageQuery；image-text 补 imageQuery
 *   4. 缺 notes 时补演讲备注
 */
export function ensureSlideSpecQuality(specs, guidance, opts = {}) {
    if (specs.length === 0)
        return { specs, fixes: [] };
    const fixes = [];
    const banned = new Set(bannedLayoutsForFamily(guidance.styleFamily));
    const upgrades = UPGRADE_FROM_BULLETS.filter((k) => !banned.has(k));
    let out = specs.map((s) => ({ ...s }));
    let upgradeIdx = 0;
    const seedAt = (i) => ({
        ...(guidance.topic ? { topic: guidance.topic } : {}),
        ...(opts.imageIdeas?.[i]?.trim() ? { idea: opts.imageIdeas[i].trim() } : {}),
    });
    // 1) opener / closer（仅整篇）
    if (!opts.partial) {
        const first = out[0];
        if (first.kind !== "cover" && first.kind !== "hero") {
            out[0] = {
                kind: "cover",
                title: titleOf(first),
                subtitle: guidance.topic && guidance.topic !== titleOf(first) ? guidance.topic.slice(0, 60) : undefined,
                ...copyEnrichment(first),
            };
            fixes.push(`opener remapped ${first.kind} → cover`);
        }
        const last = out[out.length - 1];
        if (out.length > 1 && last.kind !== "closing" && last.kind !== "hero") {
            out[out.length - 1] = {
                kind: "closing",
                title: titleOf(last),
                message: bulletsOf(last)[0],
                ...copyEnrichment(last),
            };
            fixes.push(`closer remapped ${last.kind} → closing`);
        }
    }
    // 2) break consecutive text-heavy
    const start = opts.partial ? 0 : 1;
    const end = opts.partial ? out.length : out.length - 1;
    for (let i = Math.max(1, start); i < end; i++) {
        const cur = out[i];
        const prev = out[i - 1];
        if (!TEXT_HEAVY.has(cur.kind) || !TEXT_HEAVY.has(prev.kind))
            continue;
        const target = upgrades[upgradeIdx % upgrades.length] ?? "cards";
        upgradeIdx += 1;
        out[i] = convertTo(target, cur, seedAt(i));
        fixes.push(`slide ${i + 1}: ${cur.kind} → ${out[i].kind} (rhythm)`);
    }
    // 3–4) imagery + notes
    out = out.map((s, i) => {
        const seed = seedAt(i);
        let next = ensureBgQuery(s, seed);
        next = ensureImageTextQuery(next, seed);
        next = ensureBulletsHeroQuery(next, seed);
        next = ensureNotes(next);
        return next;
    });
    return { specs: out, fixes };
}
