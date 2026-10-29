// 生成 schema 专属的字段名别名归一 + JSON 生成便捷封装。
//
// 把模型常见的"语义对但字段拼错"映射回 schema 真正期望的名字。只做"明确等价"
// 的字段映射，绝不改语义，避免任何具体模型的硬编码 patch。
import { generateJson } from "../llm/json.js";
const FIELD_ALIASES = {
    // outline / slide bullets
    bulletPoints: "bullets",
    bullet_points: "bullets",
    points: "bullets",
    items: "bullets",
    // theme
    theme: "themeId",
    themeID: "themeId",
    // layout hint
    layout: "layoutHint",
    layout_hint: "layoutHint",
    // two-column
    leftColumn: "leftBullets",
    rightColumn: "rightBullets",
    left: "leftBullets",
    right: "rightBullets",
    // table
    header: "headers",
    columns: "headers",
    data: "rows",
};
/** 递归扫描，对 object / array 同等处理；非对象原样返回。 */
export function normalizeAliases(v) {
    if (Array.isArray(v))
        return v.map(normalizeAliases);
    if (v && typeof v === "object") {
        const o = v;
        const agenda = o.kind === "agenda";
        const out = {};
        for (const [k, val] of Object.entries(o)) {
            if (agenda && (k === "items" || k === "bullets"))
                continue;
            const next = FIELD_ALIASES[k] ?? k;
            if (out[next] === undefined)
                out[next] = normalizeAliases(val);
        }
        if (agenda) {
            const src = o.items ?? o.bullets;
            if (src !== undefined) {
                out.items = Array.isArray(src)
                    ? src.map((x) => (typeof x === "string" ? { label: x } : normalizeAliases(x)))
                    : normalizeAliases(src);
            }
        }
        return out;
    }
    return v;
}
/**
 * 生成阶段统一的"JSON + 别名归一 + zod 校验"调用（llm/json 的 generate 特化）。
 * postNormalize：schema 专属补丁（如 motion 的 rolesOverride: null → {}），
 * 在别名归一之后、zod 之前跑。
 */
export async function generateSpecJson(model, schema, system, prompt, signal, postNormalize, onUsage, timing, sources) {
    return generateJson({
        model,
        schema,
        system,
        prompt,
        signal,
        normalize: (v) => {
            const n = normalizeAliases(v);
            return postNormalize ? postNormalize(n) : n;
        },
        ...(onUsage ? { onUsage } : {}),
        ...(timing?.timeoutMs != null ? { timeoutMs: timing.timeoutMs } : {}),
        ...(timing?.retryOnTimeout != null ? { retryOnTimeout: timing.retryOnTimeout } : {}),
        ...(sources?.files?.length ? { files: sources.files } : {}),
        ...(sources?.responses ? { responses: sources.responses } : {}),
    });
}
