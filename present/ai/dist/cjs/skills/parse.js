"use strict";
// Skill `.md` 解析 —— frontmatter + body 切分 + zod 校验。
//
// 设计要点：
//   1. 不引 gray-matter / js-yaml —— frontmatter 字段只有 5 个，手写解析更可控
//      （依赖少、产物小、错误信息可定制）。
//   2. 支持 Cursor SKILL.md 实际用到的 YAML 子集：
//      - 单行 `key: value`（value 可带成对引号，自动剥掉）；
//      - 折叠 / 字面块标量 `key: >-` / `key: |`（Cursor 生成的 SKILL.md 描述
//        普遍是 `description: >-` 多行折叠）；
//      不支持嵌套对象 / 锚点等高级 YAML 语法。
//   3. id 归一化：Cursor 的 name 是 kebab-case（`ppt-deck-workflow`），本系统 id
//      是 lower_snake —— 解析时自动把 `-` 归一为 `_`，让同一个 .md 两边直接复用。
//   4. 输入为 raw `.md` 字符串；输出为 `SkillSpec`（解析失败抛带行号的 `SkillParseError`）。
//   5. 容错点：不存在 frontmatter → 抛 `MissingFrontmatterError`，UI 借此弹补全表单。
//
// frontmatter 形态：
//   ```
//   ---
//   name: ppt_visual_design        ← 同时作为 id（kebab 会归一为 lower_snake）
//   description: ...一行话（或 `>-` 折叠多行）
//   stage: both | generate | chat  ← 可省（默认 both）
//   ---
//   <Markdown body>
//   ```
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkillSpecSchema = exports.SkillParseError = exports.MissingFrontmatterError = void 0;
exports.parseSkill = parseSkill;
exports.stringifySkill = stringifySkill;
exports.composeRawFromUserInput = composeRawFromUserInput;
const zod_1 = require("zod");
const brief_fields_1 = require("./brief-fields");
const style_families_1 = require("./style-families");
const custom_system_1 = require("../deckgen/custom-system");
/** 区分"完全缺 frontmatter"与"frontmatter 损坏"——UI 文案不一样。 */
class MissingFrontmatterError extends Error {
    constructor() {
        super("missing-frontmatter");
        this.name = "MissingFrontmatterError";
    }
}
exports.MissingFrontmatterError = MissingFrontmatterError;
/** 通用解析错误（含行号 / 字段定位）。 */
class SkillParseError extends Error {
    line;
    constructor(message, line) {
        super(message);
        this.line = line;
        this.name = "SkillParseError";
    }
}
exports.SkillParseError = SkillParseError;
const ID_RE = /^[a-z][a-z0-9_]{1,63}$/;
const FAMILY_ID_RE = /^[a-z][a-z0-9_]{0,63}$/;
const SkillStageSchema = zod_1.z.enum(["generate", "chat", "both"]);
const BriefFieldIdSchema = zod_1.z.enum(brief_fields_1.GENERATE_BRIEF_FIELD_IDS);
/** zod schema —— 给宿主存储 save 时再过一遍。 */
exports.SkillSpecSchema = zod_1.z.object({
    id: zod_1.z
        .string()
        .regex(ID_RE, "id must be lower_snake (a-z, 0-9, _) and start with a letter, ≤64 chars"),
    name: zod_1.z.string().min(1, "name is required").max(120),
    description: zod_1.z.string().min(1, "description is required").max(500),
    stage: SkillStageSchema,
    briefFields: zod_1.z.array(BriefFieldIdSchema).optional().default([]),
    briefCustom: zod_1.z
        .array(zod_1.z.string().min(1).max(60, "each custom brief label must be ≤ 60 chars"))
        .max(8, "at most 8 custom brief fields")
        .optional()
        .default([]),
    styleFamilies: zod_1.z
        .array(zod_1.z.object({
        id: zod_1.z.string().regex(FAMILY_ID_RE, "style family id must be lower_snake"),
        hint: zod_1.z.string().min(1).max(200),
    }))
        .max(8, "at most 8 custom style families")
        .optional()
        .default([]),
    visualSystems: zod_1.z.array(custom_system_1.CustomVisualSystemSchema).max(4, "at most 4 custom visual systems per skill").optional().default([]),
    body: zod_1.z.string().min(1, "body is required").max(8 * 1024, "body must be ≤ 8KB"),
});
// 内置 skill 由我们维护，不受用户上传的 8KB 防滥用上限约束；32KB 仍是注入 prompt 的合理量级上限。
const BuiltinSkillSpecSchema = exports.SkillSpecSchema.extend({
    body: zod_1.z.string().min(1, "body is required").max(32 * 1024, "builtin body must be ≤ 32KB"),
});
/** 自定义 brief 字段的 csv 解析（自由文本 label，逗号分隔，去重去空）。 */
function parseCustomBriefCsv(raw) {
    if (!raw?.trim())
        return [];
    const out = [];
    for (const part of raw.split(",")) {
        const label = part.trim();
        if (label && !out.includes(label))
            out.push(label);
    }
    return out;
}
/** 剥掉成对的单/双引号（YAML 单行标量常见写法）。 */
function unquote(v) {
    if (v.length >= 2) {
        const first = v[0];
        const last = v[v.length - 1];
        if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
            return v.slice(1, -1);
        }
    }
    return v;
}
/** 行首空白宽度（YAML 块标量靠缩进界定范围）。 */
function indentWidth(line) {
    const m = line.match(/^[ \t]*/);
    return m ? m[0].length : 0;
}
/**
 * 切分 raw → { frontmatter 字段, body }。
 *
 * frontmatter 规则：
 *   - 首行必须是 `---`（允许前置空行）。
 *   - 直到下一行 `---` 为止之间是 frontmatter。
 *   - 每行格式 `key: value`；value 支持三种形态：
 *     a. 单行标量（可带成对引号，自动剥掉）；
 *     b. 折叠块 `key: >` / `>-` / `>+` —— 后续缩进行折叠成一行（换行 → 空格）；
 *     c. 字面块 `key: |` / `|-` / `|+` —— 后续缩进行保留换行。
 *   - 空行 / `#` 注释行允许，跳过。
 */
function splitFrontmatter(raw) {
    const lines = raw.split(/\r?\n/);
    // 跳过文件首部空行。
    let idx = 0;
    while (idx < lines.length && lines[idx].trim() === "")
        idx++;
    if (idx >= lines.length || lines[idx].trim() !== "---") {
        throw new MissingFrontmatterError();
    }
    const fmStart = idx;
    idx++;
    const data = {};
    let foundEnd = false;
    while (idx < lines.length) {
        const line = lines[idx];
        if (line.trim() === "---") {
            foundEnd = true;
            idx++;
            break;
        }
        const trimmed = line.trim();
        if (trimmed === "" || trimmed.startsWith("#")) {
            idx++;
            continue;
        }
        const colon = line.indexOf(":");
        if (colon <= 0) {
            throw new SkillParseError(`frontmatter line ${idx + 1}: expected "key: value", got "${line}"`, idx + 1);
        }
        const key = line.slice(0, colon).trim();
        const value = line.slice(colon + 1).trim();
        if (!key) {
            throw new SkillParseError(`frontmatter line ${idx + 1}: empty key`, idx + 1);
        }
        const blockMatch = value.match(/^([>|])[+-]?$/);
        if (blockMatch) {
            // YAML 块标量：吃掉后续所有"缩进比 key 深"的行，直到缩进回退 / `---` / 新 key。
            const keyIndent = indentWidth(line);
            const buf = [];
            idx++;
            while (idx < lines.length) {
                const cont = lines[idx];
                if (cont.trim() === "") {
                    buf.push("");
                    idx++;
                    continue;
                }
                if (cont.trim() === "---" || indentWidth(cont) <= keyIndent)
                    break;
                buf.push(cont.trim());
                idx++;
            }
            // 去掉尾部空行；folded (>) 用空格连接，literal (|) 保留换行。
            while (buf.length > 0 && buf[buf.length - 1] === "")
                buf.pop();
            data[key] = blockMatch[1] === ">" ? buf.filter((l) => l !== "").join(" ") : buf.join("\n");
            continue;
        }
        data[key] = unquote(value);
        idx++;
    }
    if (!foundEnd) {
        throw new SkillParseError(`frontmatter at line ${fmStart + 1} is not closed by '---'`, fmStart + 1);
    }
    // body：跳过 frontmatter 后所有内容，保留原换行。
    const body = lines.slice(idx).join("\n").trim();
    return { data, body, fmStartLine: fmStart + 1 };
}
/**
 * id 归一化：Cursor SKILL.md 的 name 是 kebab-case（如 `ppt-deck-workflow`），
 * 本系统 id 约定 lower_snake。把 `-`、空格统一成 `_`、转小写后再过 ID_RE，
 * 让同一个 .md 文件不改内容就能上传。归一失败（如以数字开头）由 zod 报错。
 */
function normalizeId(raw) {
    return raw.trim().toLowerCase().replace(/[-\s]+/g, "_");
}
/** 解析单个 raw `.md` 文本为 SkillSpec；失败抛错。 */
function parseSkill(raw, opts = {}) {
    const { data, body } = splitFrontmatter(raw);
    const idRaw = data.id ?? data.name; // 兼容 Cursor SKILL.md 只写 name 的写法
    if (!idRaw) {
        throw new SkillParseError("frontmatter must contain `name` (and optionally `id`).");
    }
    const id = normalizeId(idRaw);
    const name = (data.displayName ?? data.name ?? id).trim();
    const description = (data.description ?? "").trim();
    const stage = ((data.stage ?? "both").trim().toLowerCase() || "both");
    const briefFields = (0, brief_fields_1.parseBriefFieldsCsv)(data.briefFields);
    const briefCustom = parseCustomBriefCsv(data.briefCustom);
    const styleFamilies = (0, style_families_1.parseStyleFamiliesCsv)(data.styleFamilies);
    let visualSystems;
    try {
        visualSystems = (0, custom_system_1.extractCustomVisualSystems)(body).defs;
    }
    catch (e) {
        if (e instanceof custom_system_1.CustomVisualSystemError)
            throw new SkillParseError(e.message);
        throw e;
    }
    const schema = opts.builtin ? BuiltinSkillSpecSchema : exports.SkillSpecSchema;
    const result = schema.safeParse({ id, name, description, stage, briefFields, briefCustom, styleFamilies, visualSystems, body });
    if (!result.success) {
        const first = result.error.issues[0];
        if (first) {
            const path = first.path.join(".");
            throw new SkillParseError(`${path}: ${first.message}`);
        }
        throw new SkillParseError("invalid skill spec");
    }
    return result.data;
}
/**
 * 由表单字段（id / name / description / stage / body）反向构造 raw `.md`。
 * UI 编辑器保存时用：让 HostSkillStore 永远只接受 raw 形态，与 .md 上传走同一条路。
 */
function stringifySkill(spec) {
    // 单行字段里的换行（来自 `|` 字面块解析或用户粘贴）折叠成空格，
    // 否则写回的 frontmatter 是坏的（下一行会被当成新 key 解析）。
    const oneline = (s) => s.replace(/\s*\n\s*/g, " ").trim();
    const lines = [
        "---",
        `id: ${spec.id}`,
        `name: ${oneline(spec.name)}`,
        `description: ${oneline(spec.description)}`,
        `stage: ${spec.stage}`,
    ];
    const briefCsv = (0, brief_fields_1.formatBriefFieldsCsv)(spec.briefFields);
    if (briefCsv)
        lines.push(`briefFields: ${briefCsv}`);
    if (spec.briefCustom?.length)
        lines.push(`briefCustom: ${spec.briefCustom.map(oneline).join(", ")}`);
    const sfCsv = (0, style_families_1.formatStyleFamiliesCsv)(spec.styleFamilies);
    if (sfCsv)
        lines.push(`styleFamilies: ${sfCsv}`);
    lines.push("---", "", spec.body.trim(), "");
    return lines.join("\n");
}
/**
 * UI 上"frontmatter 缺失补全"用：把整段当成 body、附加用户填写的 metadata，
 * 输出可被 parseSkill 接受的 raw 字符串。
 */
function composeRawFromUserInput(args) {
    return stringifySkill({
        id: args.id,
        name: args.name,
        description: args.description,
        stage: args.stage,
        briefFields: args.briefFields,
        briefCustom: args.briefCustom,
        styleFamilies: args.styleFamilies,
        body: args.body,
    });
}
