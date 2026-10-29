import type { z } from "zod";
import type { GenerateBriefFieldId } from "./brief-fields.js";
import type { CustomStyleFamilyDef } from "./style-families.js";
import type { CustomVisualSystemDef } from "../deckgen/custom-system.js";
/**
 * Skill 注入位置：
 *   - "generate" → outline / slide / theme system prompt（生成阶段，无 tool calling）
 *   - "chat"     → chat system prompt
 *   - "both"     → 同时注入到 generate + chat
 *
 * 当前 VISUAL_DESIGN_GUIDELINES 等价于 stage="both"（outline+slide+theme+chat 4 处）。
 */
export type SkillStage = "generate" | "chat" | "both";
/** Skill 的纯数据形态（持久化、上传、API 传输都用这个）。 */
export interface SkillSpec {
    /** 唯一 id —— lower_snake，与 MCP id 共享命名空间（不冲突）。 */
    id: string;
    /** UI 显示名（用户写啥就用啥，不强制 i18n）。 */
    name: string;
    /** 一行描述 —— 用户在 UI 上 hover 看；模型用它判断"何时启用"。 */
    description: string;
    /** 注入位置（默认 both）。 */
    stage: SkillStage;
    /**
     * Optional generate-wizard fields this skill expects (comma list in frontmatter).
     * UI unions enabled skills' briefFields on the options step.
     */
    briefFields?: GenerateBriefFieldId[];
    /**
     * Optional free-form brief questions this skill wants answered before generating
     * (comma list in frontmatter, e.g. `briefCustom: 品牌主色, 竞品名单`).
     * UI renders one text input per label; answers are appended to guidance notes.
     */
    briefCustom?: string[];
    /**
     * Optional custom style families this skill registers (comma list in frontmatter).
     * Expands the generate wizard style-family picker and design-spec enum when enabled.
     */
    styleFamilies?: CustomStyleFamilyDef[];
    /**
     * Custom deckgen visual systems declared in the body as ```visual-system JSON blocks
     * (derived at parse time; the blocks stay in `body` so editing round-trips, and are
     * stripped from the text that reaches the prompt). Registered while the skill is enabled.
     */
    visualSystems?: CustomVisualSystemDef[];
    /** Markdown body —— 直接拼到 system prompt 末尾，不做转义。 */
    body: string;
}
/** 包含来源 / 默认开关的运行时 descriptor。 */
export interface SkillDescriptor extends SkillSpec {
    /** "builtin" = 内置（不可编辑/删除）；"user" = 用户自定义（来自 HostSkillStore）。 */
    source: "builtin" | "user";
    /** builtin 用；user skill 一律默认启用（用户主动添加的）。 */
    defaultEnabled: boolean;
}
/** registry 给宿主的合并视图（descriptor + enabled）。 */
export interface SkillView extends SkillDescriptor {
    enabled: boolean;
}
/**
 * 单个 skill 的开关状态（localStorage 序列化形态）。
 * 注意：内容不存这里——内容由 HostSkillStore 管。
 */
export interface SkillEnabledState {
    id: string;
    enabled: boolean;
}
/**
 * 宿主注入的 user skill 存储抽象。
 *
 * 与 HostChatStore 同心智：@sliiu/present-ai 不直接读 localStorage，playground 侧基于
 * 自己的存储格式实现这个接口。
 *
 * 设计要点：
 *   - `save` 接受原始 .md 文本（含 frontmatter），由宿主自己解析并校验；
 *     校验失败时返回 `{ ok: false, error }`，调用方（UI）展示给用户。
 *   - `list` 返回 mtime 用来在 UI 上排序"最近编辑"。
 *   - `remove` 必须保留（user skill 与 builtin 不同，需要删）。
 */
export interface HostSkillStore {
    list: () => Array<{
        spec: SkillSpec;
        mtime: number;
    }>;
    load: (id: string) => SkillSpec | null;
    save: (id: string, raw: string) => {
        ok: true;
        spec: SkillSpec;
    } | {
        ok: false;
        error: string;
    };
    remove: (id: string) => void;
}
/** 注入 system prompt 时按 stage 选 skill 的参数。 */
export interface SkillInjectionContext {
    stage: "outline" | "slide" | "theme" | "chat";
    /** 用户自定义 skills 来源（可选；不传则只看 builtin）。 */
    host?: HostSkillStore | undefined;
    /**
     * 当前风格族 id（roadmap L2）。传入时，getEnabledSkillFragments 会按小节 `<!-- applies -->`
     * 注解过滤，只注入命中该族 + 无注解（全局）的小节。缺省 / 空 = 不按族过滤（原样注入）。
     */
    styleFamily?: string | undefined;
    /**
     * 当前页 layout kind 列表（roadmap L2，slide 阶段用）。传入时按小节 `<!-- layout -->`
     * 注解过滤。缺省 = 不按 layout 过滤。
     */
    layoutKinds?: string[] | undefined;
}
/**
 * zod schema for SkillSpec —— 给 parse.ts 校验上传 / 编辑内容用。
 * 在 types.ts 里用 `import type` 引入避免循环；具体 schema 实例在 parse.ts 里。
 * 这里只声明类型，让 schema 跟 types 共享。
 */
export type SkillSpecZod = z.ZodType<SkillSpec>;
