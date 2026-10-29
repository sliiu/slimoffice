// Skills 注册表 —— builtin（编译期注入的 .md）+ user（来自 HostSkillStore）合并。
//
// 设计要点：
//   1. builtin md 由 scripts/sync-skills.mjs 生成为 builtin/index.ts 字符串常量
//      （不用 Vite `?raw`：@sliiu/present-ai 需要同时在浏览器与 Node/MCP server 下加载）。
//   2. user skills 通过宿主注入的 HostSkillStore 提供 —— registry 永远不直接
//      访问 localStorage（保持 @sliiu/present-ai 不依赖宿主存储格式）。
//   3. `getEnabledFragments({ stage, host })` 是 prompts/index.ts 唯一调用点：
//      按 stage 过滤 + 按 enabled 状态拼接，再做 32KB 总长度兜底。
//   4. 优先级（产品决策：**user 压过 builtin**）：
//      - 同 id：user 版 shadow builtin 版（删除 user 版即恢复 builtin）；
//      - prompt 内容冲突：user 片段注入在 builtin 之后，且带显式"以下 user skill
//        优先"声明（代码硬约束仍然最高，skill 文本覆盖不了 schema / QA clamp）；
//      - 32KB 注入预算：user 先占，builtin 用剩余 —— 保证用户 skill 不会被内置
//        规则挤出 prompt。
import { parseSkill } from "./parse.js";
import { filterSkillBody, extractChecklistSections, parseSkillSections } from "./sections.js";
import { STYLE_FAMILY_IDS, STYLE_FAMILY_STYLE_HINTS } from "../generate/schema.js";
import { resolveCustomStyleFamilies, } from "./style-families.js";
import { resolveStates, setEnabled, toggleEnabled, clearStored } from "./settings.js";
import { resolveCustomVisualSystems, stripVisualSystemBlocks, syncCustomVisualSystems } from "./visual-systems.js";
// ---------------------------------------------------------------------------
// builtin: sync-skills.mjs 把 md 文件生成为字符串常量（builtin/index.ts），
// 这里用同一个 parse 走一遍校验。任何 builtin 写错都会在 import 时崩溃 ——
// 这是个好事，问题在 build 时就暴露。
// ---------------------------------------------------------------------------
import { BUILTIN_SKILL_RAWS } from "./builtin/index.js";
import { SAMPLE_SKILL_RAWS } from "./samples/index.js";
function parseBuiltin(raw) {
    // builtin 由我们维护；这里 throws 在开发态相当于 build assert。
    // builtin: true 放宽 body 上限（用户上传仍是 8KB）。
    return parseSkill(raw, { builtin: true });
}
const BUILTIN_SPECS = BUILTIN_SKILL_RAWS.map(parseBuiltin);
/**
 * 内置 skill descriptor 列表（不可变；增删 builtin = 改源代码 + 编译）。
 *
 * defaultEnabled = true：所有 builtin 默认 on。
 */
export const BUILTIN_SKILLS = BUILTIN_SPECS.map((spec) => ({
    ...spec,
    source: "builtin",
    defaultEnabled: true,
}));
/**
 * 内置**模板**（samples/*.md）。与 builtin 不同：不注入 prompt、不出现在 listSkills，
 * 只供宿主展示"从模板添加"。用户添加后是一份可编辑 / 可删除的 user skill —— 这保持了
 * "builtin 目录为空则不注入任何内置规则"的产品约定，同时让 apple_keynote 这类风格
 * 不再只能靠手工上传 .md。
 */
export function listSampleSkills() {
    const out = [];
    for (const raw of SAMPLE_SKILL_RAWS) {
        try {
            out.push({ spec: parseSkill(raw, { builtin: true }), raw });
        }
        catch {
            // 模板由我们维护；解析失败在 parse 测试里会暴露，这里不让 UI 崩。
        }
    }
    return out;
}
/**
 * 合并 builtin + user 的全集 descriptor。同 id 冲突时 **user 优先**：
 * builtin 被 shadow（不出现在列表 / 不注入），用户删除自己的版本即恢复。
 * 这让用户可以"改写内置规则"——上传同 id 的 .md 就等于编辑 builtin。
 *
 * 注意：host 是可选的；不传 = 只看 builtin（用于 ai package 内部默认调用）。
 */
function collectDescriptors(host) {
    const builtins = BUILTIN_SKILLS.slice();
    if (!host)
        return builtins;
    const userDescriptors = [];
    const userIds = new Set();
    try {
        const userEntries = host.list();
        for (const entry of userEntries) {
            userDescriptors.push({
                ...entry.spec,
                source: "user",
                defaultEnabled: true,
            });
            userIds.add(entry.spec.id);
        }
    }
    catch (e) {
        console.warn("[skills] HostSkillStore.list() failed", e);
    }
    const visibleBuiltins = builtins.filter((b) => {
        if (userIds.has(b.id)) {
            console.info(`[skills] builtin "${b.id}" is shadowed by a user skill with the same id.`);
            return false;
        }
        return true;
    });
    return [...visibleBuiltins, ...userDescriptors];
}
/** 给 UI 用：判断某 id 是否属于内置 skill（user 同 id 时表示"覆盖内置"）。 */
export function isBuiltinSkillId(id) {
    return BUILTIN_SKILLS.some((b) => b.id === id);
}
/**
 * UI 用：返回 skills 全集 + enabled 状态。顺序为 builtin 在前、user 在后；
 * 同来源内部按定义/创建顺序，保持 UI 稳定。
 */
export function listSkills(host) {
    const descriptors = collectDescriptors(host);
    const states = resolveStates(descriptors);
    const views = descriptors.map((d) => {
        const state = states.find((s) => s.id === d.id);
        return {
            ...d,
            enabled: state?.enabled ?? d.defaultEnabled,
        };
    });
    // The full skill set is only known here (builtin + host). Keep the deckgen registry of
    // user-defined visual systems in step with it: enabled skills contribute, disabled ones drop out.
    // Without a host we only see builtins and leave whatever the host registered earlier alone.
    if (host)
        syncCustomVisualSystems(views);
    return views;
}
/** User-defined visual systems currently contributed by enabled skills (UI / diagnostics). */
export function listSkillVisualSystems(host) {
    return resolveCustomVisualSystems(listSkills(host));
}
/** 用于 UI / tool：取某个 id 的 view（builtin 或 user 都行）。 */
export function getSkill(id, host) {
    return listSkills(host).find((v) => v.id === id);
}
/** 32KB 安全上限：避免 user skill 失控时把 prompt 撑爆 OOM 或 token 飙升。 */
const MAX_INJECTED_BYTES = 32 * 1024;
const textEncoder = new TextEncoder();
function byteLen(s) {
    return textEncoder.encode(s).length;
}
/**
 * user skill 片段前的优先级声明 —— 产品决策：user skill 压过 builtin。
 * 注意措辞里保留"代码硬约束不可覆盖"：schema clamp / QA 对比度检查等在代码层
 * 执行，skill 文本无论怎么写都绕不过，这里明说以免模型自我矛盾。
 */
const USER_PRECEDENCE_NOTE = [
    "## User-defined custom skills (highest priority)",
    "",
    "The sections below come from the user's own custom skills. Where their guidance",
    "conflicts with any built-in skill guidance above, FOLLOW THE USER'S CUSTOM SKILLS.",
    "(Hard constraints enforced by tool schemas / code-side QA still apply regardless.)",
].join("\n");
/**
 * 注入装配核心：stage 过滤 → 小节路由 → 预算分配 → 排序输出。
 *
 * stage 路由规则：
 *   - "outline" / "slide" / "theme" → 命中 spec.stage === "generate" 或 "both"
 *   - "chat"                         → 命中 spec.stage === "chat" 或 "both"
 *
 * 预算（32KB）分配：**user 先占、builtin 用剩余** —— user skill 优先级最高，
 * 不允许被内置规则挤出 prompt。单条放不下时按小节截断（保留前缀小节），
 * 一节都放不下才整条省略；两种情况都 console.warn 且反映在 records 里。
 *
 * 输出顺序：builtin 在前、user 在后；两者都存在时在 user 片段前插入优先级声明，
 * 明确"user skill 与内置规则冲突时以 user 为准"。
 */
function assembleSkillInjection(ctx) {
    const views = listSkills(ctx.host);
    const generateStages = ["outline", "slide", "theme"];
    const isGenerate = generateStages.includes(ctx.stage);
    const isChat = ctx.stage === "chat";
    const records = [];
    const builtinCands = [];
    const userCands = [];
    for (const v of views) {
        const record = { id: v.id, source: v.source, status: "injected", bytes: 0 };
        records.push(record);
        if (!v.enabled) {
            record.status = "disabled";
            continue;
        }
        const matchStage = v.stage === "both" ||
            (isGenerate && v.stage === "generate") ||
            (isChat && v.stage === "chat");
        if (!matchStage) {
            record.status = "stage-mismatch";
            continue;
        }
        // 小节级过滤（roadmap L2）：按当前 styleFamily / layoutKinds 只留命中的 + 全局小节。
        const body = stripVisualSystemBlocks(filterSkillBody(v.body, {
            ...(ctx.styleFamily ? { styleFamily: ctx.styleFamily } : {}),
            ...(ctx.layoutKinds ? { layoutKinds: ctx.layoutKinds } : {}),
            stage: isChat ? "chat" : "generate",
        }));
        if (!body) {
            record.status = "empty";
            continue;
        }
        const cand = { view: v, body, bytes: byteLen(body), record };
        (v.source === "user" ? userCands : builtinCands).push(cand);
    }
    // 预算分配。user 先占（优先级最高），builtin 分剩余。
    let remaining = MAX_INJECTED_BYTES;
    const included = new Map(); // id -> 实际注入的 body
    const allocate = (cands) => {
        for (const c of cands) {
            if (c.bytes <= remaining) {
                included.set(c.view.id, c.body);
                c.record.bytes = c.bytes;
                remaining -= c.bytes;
                continue;
            }
            // 整条放不下 → 按小节截断，保留能塞进预算的前缀小节。
            const sections = parseSkillSections(c.body);
            const keep = [];
            let used = 0;
            for (const sec of sections) {
                const b = byteLen(sec.text) + 2; // +2 = 小节间 "\n\n"
                if (used + b > remaining)
                    break;
                keep.push(sec.text);
                used += b;
            }
            if (keep.length > 0) {
                included.set(c.view.id, keep.join("\n\n"));
                c.record.bytes = used;
                c.record.status = "partial";
                remaining -= used;
                console.warn(`[skills] "${c.view.id}" partially injected (${used}B of ${c.bytes}B): 32KB budget exceeded`);
            }
            else {
                c.record.status = "omitted-budget";
                console.warn(`[skills] "${c.view.id}" omitted entirely: 32KB budget exceeded`);
            }
        }
    };
    allocate(userCands);
    allocate(builtinCands);
    const fragments = [];
    for (const c of builtinCands) {
        const b = included.get(c.view.id);
        if (b)
            fragments.push(b);
    }
    const userBodies = userCands
        .map((c) => included.get(c.view.id))
        .filter((b) => !!b);
    if (userBodies.length > 0) {
        if (fragments.length > 0)
            fragments.push(USER_PRECEDENCE_NOTE);
        fragments.push(...userBodies);
    }
    return { fragments, records };
}
/**
 * 按 stage 过滤 + 拼接所有 enabled skill 的 body 段，作为可注入 prompt 的 fragments 数组。
 * 调用方（prompts/index.ts）把这些 fragment 当成普通 string 与其他段落一起 join。
 * 路由 / 预算 / 优先级细节见 assembleSkillInjection。
 */
export function getEnabledSkillFragments(ctx) {
    return assembleSkillInjection(ctx).fragments;
}
/**
 * UI 用：报告某次（假想的）注入调用里每条 skill 的最终状态。
 * Capabilities tab 用它渲染"部分注入 / 超预算未注入"徽章，让截断不再静默。
 */
export function getSkillInjectionReport(ctx) {
    return assembleSkillInjection(ctx).records;
}
/** 内置 + enabled user skill 注册的自定义 styleFamily id 全集。 */
export function getKnownStyleFamilyIds(host) {
    const custom = resolveCustomStyleFamilies(listSkills(host));
    return [...STYLE_FAMILY_IDS, ...custom.map((c) => c.id)];
}
/** 某族的 styleHint（builtin 表 / 自定义 skill 声明 / 回退 id）。 */
export function styleFamilyHint(id, host) {
    if (id in STYLE_FAMILY_STYLE_HINTS) {
        return STYLE_FAMILY_STYLE_HINTS[id];
    }
    const custom = resolveCustomStyleFamilies(listSkills(host));
    return custom.find((c) => c.id === id)?.hint ?? id;
}
/** design-spec system prompt 用的 family 列表行。 */
export function styleFamilyListLines(host) {
    const lines = STYLE_FAMILY_IDS.map((f) => `    - ${f}: ${STYLE_FAMILY_STYLE_HINTS[f]}`);
    for (const c of resolveCustomStyleFamilies(listSkills(host))) {
        lines.push(`    - ${c.id}: ${c.hint} (custom — from user skill)`);
    }
    return lines;
}
/**
 * 抽取所有 enabled + stage 命中的 skill 的 checklist 小节文本（roadmap L4）。
 * 供 art-director 二次评审把"当前启用 skill 自己的验收标准"当 rubric，而非通用 prompt。
 * 按 styleFamily / layoutKinds 走同一套小节路由（先过滤命中的小节，再抽 checklist）。
 */
export function getEnabledChecklist(ctx) {
    const views = listSkills(ctx.host);
    const out = [];
    const generateStages = ["outline", "slide", "theme"];
    const isGenerate = generateStages.includes(ctx.stage);
    const isChat = ctx.stage === "chat";
    for (const v of views) {
        if (!v.enabled)
            continue;
        const matchStage = v.stage === "both" ||
            (isGenerate && v.stage === "generate") ||
            (isChat && v.stage === "chat");
        if (!matchStage)
            continue;
        const scoped = stripVisualSystemBlocks(filterSkillBody(v.body, {
            ...(ctx.styleFamily ? { styleFamily: ctx.styleFamily } : {}),
            ...(ctx.layoutKinds ? { layoutKinds: ctx.layoutKinds } : {}),
            stage: isChat ? "chat" : "generate",
        }));
        for (const sec of extractChecklistSections(scoped))
            out.push(sec);
    }
    return out;
}
/**
 * 便捷别名：直接拼好的单个字符串，给只需要一段文本的调用方用。
 * 等价于 `getEnabledSkillFragments(ctx).join("\n\n")`。
 */
export function getEnabledSkillsPromptSection(ctx) {
    return getEnabledSkillFragments(ctx).join("\n\n");
}
export { setEnabled as setSkillEnabled, toggleEnabled as toggleSkillEnabled, clearStored as clearSkillEnabled };
