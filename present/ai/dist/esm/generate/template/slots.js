// 参考模板槽位诱导 + 填内容（PPTAgent Stage I/II 的 SlimPPT 移植）。
//
// 流程：
//   1. induceReferenceSchemas(pres) —— 每页功能类型 + 可填 text 槽位（shapeId / role / maxChars）
//   2. mapOutlineToReference(outline, schemas) —— 大纲页 → 参考页索引
//   3. LLM 按 shapeId 产出 fills → fillSlotsByShapeId 写回 clone 页
//   4. assembleReferencePresentation —— 拼成新 Presentation（保留参考页几何/装饰/图片）
//
// 与 compile/layouts 路径的关系：有 referencePresentation 时优先走本模块；
// 映射失败的页回退到常规 SlideSpec compile。
const DEFAULT_LENGTH_FACTOR = 1.25;
function deepClone(v) {
    if (typeof structuredClone === "function")
        return structuredClone(v);
    return JSON.parse(JSON.stringify(v));
}
function shapeText(sh) {
    return sh.paragraphs
        .flatMap((p) => p.runs.map((r) => r.text))
        .join("")
        .trim();
}
function guessRole(sh, area, slideArea, yRatio) {
    const name = (sh.name ?? "").toLowerCase();
    if (name.includes("eyebrow") || name.includes("label") || name.includes("kicker"))
        return "eyebrow";
    if (name.includes("caption") || name.includes("attribution") || name.includes("footer"))
        return "caption";
    if (name.includes("title") || name.includes("heading") || name.includes("hero"))
        return "title";
    if (name.includes("body") || name.includes("bullet") || name.includes("content") || name.includes("card")) {
        return "body";
    }
    const font = sh.paragraphs[0]?.runs[0]?.fontSize ?? 18;
    if (font >= 28 || (area / slideArea > 0.08 && yRatio < 0.35))
        return "title";
    if (font <= 14 && yRatio < 0.25)
        return "eyebrow";
    if (font <= 14 && yRatio > 0.75)
        return "caption";
    return "body";
}
function inferFunctionalType(slide, slideIndex, total, slots) {
    if (slideIndex === 0)
        return "opening";
    if (slideIndex === total - 1 && total > 1)
        return "ending";
    const titles = slots.filter((s) => s.role === "title");
    const bodies = slots.filter((s) => s.role === "body");
    const titleText = titles[0]?.sampleText ?? "";
    const bodyJoined = bodies.map((b) => b.sampleText).join(" ");
    const multiPara = bodies.some((b) => b.paragraphCount >= 3);
    const richBody = bodies.length >= 2 || multiPara || bodyJoined.length >= 100;
    // TOC：多短行 + 编号感
    const firstBodyLine = bodyJoined.split(/\n/)[0] ?? "";
    const numbered = /^(0?\d+|第.+[章节部]|part\s*\d+)/i.test(firstBodyLine);
    if (bodies.length >= 3 &&
        bodyJoined.length < 280 &&
        (numbered || /agenda|目录|contents/i.test(titleText))) {
        return "toc";
    }
    // Section：标题短、正文很少（且不是多段 bullets）
    if (!richBody && bodies.length <= 1 && titleText.length <= 40 && bodyJoined.length < 80) {
        return "section";
    }
    if (!richBody && /^(0?\d+|part\s*\d+|第.+[章节])/i.test(titleText) && bodyJoined.length < 120) {
        return "section";
    }
    return "content";
}
/** 从单页诱导槽位（兼容旧 API）。 */
export function induceSlotsFromSlide(slide, slideIndex, size, lengthFactor = DEFAULT_LENGTH_FACTOR) {
    const schema = induceSlideSchema(slide, slideIndex, 1, size, lengthFactor);
    return { slideId: schema.slideId, slideIndex: schema.slideIndex, slots: schema.slots };
}
/** 单页完整 schema（功能类型 + 槽位）。 */
export function induceSlideSchema(slide, slideIndex, totalSlides, size, lengthFactor = DEFAULT_LENGTH_FACTOR) {
    const slideArea = Math.max(1, size.width * size.height);
    const slots = [];
    for (const layer of slide.layers) {
        for (const sh of layer.shapes) {
            if (!sh.visible || sh.kind !== "text")
                continue;
            if (sh.id.startsWith("dec_") || (sh.name ?? "").startsWith("dec_"))
                continue;
            const text = shapeText(sh);
            if (!text)
                continue;
            const area = Math.max(1, sh.bbox.w * sh.bbox.h);
            const yRatio = sh.bbox.y / Math.max(1, size.height);
            const maxChars = Math.max(12, Math.round(text.length * lengthFactor));
            slots.push({
                shapeId: sh.id,
                role: guessRole(sh, area, slideArea, yRatio),
                sampleText: text.slice(0, 240),
                maxChars,
                paragraphCount: Math.max(1, sh.paragraphs.length),
                area,
                bbox: { ...sh.bbox },
            });
        }
    }
    slots.sort((a, b) => b.area - a.area);
    const functionalType = inferFunctionalType(slide, slideIndex, totalSlides, slots);
    const title = slots.find((s) => s.role === "title")?.sampleText ?? slide.name ?? `Slide ${slideIndex + 1}`;
    const summary = `${functionalType}: ${title.slice(0, 48)}${slots.length ? ` (${slots.length} slots)` : ""}`;
    return {
        slideId: slide.id,
        slideIndex,
        functionalType,
        summary,
        slots,
    };
}
/** 整篇诱导。 */
export function induceSlotsFromPresentation(pres, lengthFactor = DEFAULT_LENGTH_FACTOR) {
    return induceReferenceSchemas(pres, lengthFactor).map((s) => ({
        slideId: s.slideId,
        slideIndex: s.slideIndex,
        slots: s.slots,
    }));
}
export function induceReferenceSchemas(pres, lengthFactor = DEFAULT_LENGTH_FACTOR) {
    const n = pres.slides.length;
    return pres.slides.map((s, i) => induceSlideSchema(s, i, n, pres.size, lengthFactor));
}
function setShapeTextPreservingStyle(sh, text, paragraphCount) {
    const lines = paragraphCount > 1
        ? text
            .split(/\n+/)
            .map((l) => l.replace(/^[\s•\-\u2022]+/, "").trim())
            .filter(Boolean)
        : [text.trim()];
    if (lines.length === 0)
        lines.push("");
    const proto = sh.paragraphs[0];
    const protoRun = proto?.runs[0] ? { ...proto.runs[0] } : { text: "" };
    const paragraphs = lines.map((line, i) => {
        const src = sh.paragraphs[Math.min(i, sh.paragraphs.length - 1)] ?? proto;
        const run = { ...protoRun, text: line };
        const p = { runs: [run] };
        if (src?.align)
            p.align = src.align;
        if (src?.lineHeight !== undefined)
            p.lineHeight = src.lineHeight;
        if (src?.bullet)
            p.bullet = { ...src.bullet };
        if (src?.marginLeft !== undefined)
            p.marginLeft = src.marginLeft;
        if (src?.indent !== undefined)
            p.indent = src.indent;
        return p;
    });
    sh.paragraphs = paragraphs;
}
/**
 * 按 role 覆写槽位文字（旧 API）。每个 role 的 texts 按面积从大到小消费。
 */
export function fillSlotsOnSlide(slide, fills) {
    const byId = new Map();
    for (const layer of slide.layers) {
        for (const sh of layer.shapes)
            byId.set(sh.id, sh);
    }
    const size = {
        width: Math.max(...slide.layers.flatMap((l) => l.shapes.map((s) => s.bbox.x + s.bbox.w)), 960),
        height: Math.max(...slide.layers.flatMap((l) => l.shapes.map((s) => s.bbox.y + s.bbox.h)), 540),
    };
    const induced = induceSlotsFromSlide(slide, 0, size);
    let written = 0;
    for (const fill of fills) {
        const targets = induced.slots.filter((s) => s.role === fill.role);
        fill.texts.forEach((text, i) => {
            const slot = targets[i];
            if (!slot)
                return;
            const sh = byId.get(slot.shapeId);
            if (!sh || sh.kind !== "text")
                return;
            setShapeTextPreservingStyle(sh, text, slot.paragraphCount);
            written += 1;
        });
    }
    return written;
}
/** 按 shapeId 精确填槽（参考模板生成主路径）。 */
export function fillSlotsByShapeId(slide, fills, slotMeta) {
    const byId = new Map();
    for (const layer of slide.layers) {
        for (const sh of layer.shapes)
            byId.set(sh.id, sh);
    }
    const metaById = new Map((slotMeta ?? []).map((s) => [s.shapeId, s]));
    let written = 0;
    for (const fill of fills) {
        const sh = byId.get(fill.shapeId);
        if (!sh || sh.kind !== "text")
            continue;
        const meta = metaById.get(fill.shapeId);
        let text = fill.text.trim();
        if (meta && text.length > meta.maxChars + 20) {
            text = text.slice(0, meta.maxChars).trim();
        }
        setShapeTextPreservingStyle(sh, text, meta?.paragraphCount ?? Math.max(1, sh.paragraphs.length));
        written += 1;
    }
    return written;
}
function outlineHintToFunctional(hint) {
    switch (hint) {
        case "cover":
        case "hero":
            return "opening";
        case "closing":
            return "ending";
        case "section":
            return "section";
        case "agenda":
            return "toc";
        default:
            return "content";
    }
}
/**
 * 把大纲页映射到参考页：按功能类型优先，同类型轮询；无匹配返回 -1。
 */
export function mapOutlineToReference(outline, schemas) {
    const pools = {
        opening: [],
        toc: [],
        section: [],
        content: [],
        ending: [],
    };
    for (const s of schemas)
        pools[s.functionalType].push(s.slideIndex);
    // 兜底：content 池为空时用全部非 opening/ending
    if (pools.content.length === 0) {
        pools.content = schemas
            .filter((s) => s.functionalType !== "opening" && s.functionalType !== "ending")
            .map((s) => s.slideIndex);
    }
    if (pools.content.length === 0) {
        pools.content = schemas.map((s) => s.slideIndex);
    }
    const cursors = {
        opening: 0,
        toc: 0,
        section: 0,
        content: 0,
        ending: 0,
    };
    const pick = (type) => {
        const order = [type];
        if (type === "toc")
            order.push("section", "content");
        if (type === "section")
            order.push("toc", "content");
        if (type === "opening")
            order.push("content");
        if (type === "ending")
            order.push("content");
        for (const t of order) {
            const pool = pools[t];
            if (!pool.length)
                continue;
            const idx = pool[cursors[t] % pool.length];
            cursors[t] += 1;
            return idx;
        }
        return schemas[0] ? schemas[0].slideIndex : -1;
    };
    const refIndices = outline.slides.map((item, i) => {
        let type = outlineHintToFunctional(item.layoutHint);
        // 首末页强制
        if (i === 0 && (item.layoutHint === "cover" || item.layoutHint === "hero" || !item.layoutHint)) {
            type = "opening";
        }
        if (i === outline.slides.length - 1 && (item.layoutHint === "closing" || !item.layoutHint)) {
            type = "ending";
        }
        return pick(type);
    });
    return { refIndices };
}
/** 深拷贝参考页并刷新 id，避免与源 deck 冲突。 */
export function cloneReferenceSlide(slide, newIndex) {
    const cloned = deepClone(slide);
    const prefix = `ref_${Date.now().toString(36)}_${newIndex}_`;
    cloned.id = `${prefix}slide`;
    cloned.index = newIndex;
    cloned.name = `Slide ${newIndex + 1}`;
    for (const layer of cloned.layers) {
        layer.id = `${prefix}${layer.id}`;
        for (const sh of layer.shapes) {
            sh.id = `${prefix}${sh.id}`;
        }
    }
    return cloned;
}
/**
 * 注意：clone 会改 shapeId，填槽必须在 clone **之前**对原 slide 填，或维护 id 映射。
 * 推荐：先 clone（保留原 id 映射表）——我们改为 clone 时记录 old→new id。
 */
export function cloneReferenceSlideWithIdMap(slide, newIndex) {
    const cloned = deepClone(slide);
    const idMap = new Map();
    const prefix = `ref_${Date.now().toString(36)}_${newIndex}_`;
    cloned.id = `${prefix}slide`;
    cloned.index = newIndex;
    cloned.name = `Slide ${newIndex + 1}`;
    for (const layer of cloned.layers) {
        const oldLayerId = layer.id;
        layer.id = `${prefix}${oldLayerId}`;
        idMap.set(oldLayerId, layer.id);
        for (const sh of layer.shapes) {
            const oldId = sh.id;
            sh.id = `${prefix}${oldId}`;
            idMap.set(oldId, sh.id);
        }
    }
    return { slide: cloned, idMap };
}
/** 把 fills 的 shapeId 从参考页映射到 clone 页。 */
export function remapFills(fills, idMap) {
    return fills.map((f) => ({
        shapeId: idMap.get(f.shapeId) ?? f.shapeId,
        text: f.text,
    }));
}
export function remapSlots(slots, idMap) {
    return slots.map((s) => ({
        ...s,
        shapeId: idMap.get(s.shapeId) ?? s.shapeId,
    }));
}
/** 用填好的 slides 组装新 Presentation（继承参考尺寸 / 主题 / masters）。 */
export function assembleReferencePresentation(reference, slides) {
    const base = deepClone(reference);
    return {
        ...base,
        id: `pres_${Date.now().toString(36)}`,
        slides: slides.map((s, i) => ({ ...s, index: i })),
    };
}
/** 供 prompt 使用的紧凑槽位描述。 */
export function formatSlotsForPrompt(schema) {
    const lines = schema.slots.map((s) => `- shapeId="${s.shapeId}" role=${s.role} maxChars≈${s.maxChars} paragraphs=${s.paragraphCount} sample="${s.sampleText.slice(0, 60).replace(/"/g, "'")}"`);
    return [
        `slideIdx=${schema.slideIndex} (0-based) [${schema.functionalType}] — ${schema.summary}`,
        "Fill EVERY listed shapeId with new content (same language as the presentation). Keep length ≤ maxChars. For multi-paragraph slots, separate lines with \\n.",
        ...lines,
    ].join("\n");
}
