import { type CustomStyleFamilyDef } from "./style-families.js";
import { setEnabled, toggleEnabled, clearStored } from "./settings.js";
import type { RegisteredVisualSystem } from "../deckgen/visual-system.js";
import type { HostSkillStore, SkillDescriptor, SkillInjectionContext, SkillSpec, SkillView } from "./types.js";
/**
 * 内置 skill descriptor 列表（不可变；增删 builtin = 改源代码 + 编译）。
 *
 * defaultEnabled = true：所有 builtin 默认 on。
 */
export declare const BUILTIN_SKILLS: SkillDescriptor[];
/** 模板库里的一条：宿主 UI 把它作为"一键添加"入口，添加后走 host.save 成为 user skill。 */
export interface SampleSkill {
    spec: SkillSpec;
    raw: string;
}
/**
 * 内置**模板**（samples/*.md）。与 builtin 不同：不注入 prompt、不出现在 listSkills，
 * 只供宿主展示"从模板添加"。用户添加后是一份可编辑 / 可删除的 user skill —— 这保持了
 * "builtin 目录为空则不注入任何内置规则"的产品约定，同时让 apple_keynote 这类风格
 * 不再只能靠手工上传 .md。
 */
export declare function listSampleSkills(): SampleSkill[];
/** 给 UI 用：判断某 id 是否属于内置 skill（user 同 id 时表示"覆盖内置"）。 */
export declare function isBuiltinSkillId(id: string): boolean;
/**
 * UI 用：返回 skills 全集 + enabled 状态。顺序为 builtin 在前、user 在后；
 * 同来源内部按定义/创建顺序，保持 UI 稳定。
 */
export declare function listSkills(host?: HostSkillStore): SkillView[];
/** User-defined visual systems currently contributed by enabled skills (UI / diagnostics). */
export declare function listSkillVisualSystems(host?: HostSkillStore): RegisteredVisualSystem[];
/** 用于 UI / tool：取某个 id 的 view（builtin 或 user 都行）。 */
export declare function getSkill(id: string, host?: HostSkillStore): SkillView | undefined;
/** 单个 skill 在某次注入调用中的最终状态（给 UI 徽章 / 调试用）。 */
export type SkillInjectionStatus = "injected" | "partial" | "omitted-budget" | "empty" | "stage-mismatch" | "disabled";
export interface SkillInjectionRecord {
    id: string;
    source: "builtin" | "user";
    status: SkillInjectionStatus;
    /** 实际注入字节数（omitted / disabled 等为 0）。 */
    bytes: number;
}
/**
 * 按 stage 过滤 + 拼接所有 enabled skill 的 body 段，作为可注入 prompt 的 fragments 数组。
 * 调用方（prompts/index.ts）把这些 fragment 当成普通 string 与其他段落一起 join。
 * 路由 / 预算 / 优先级细节见 assembleSkillInjection。
 */
export declare function getEnabledSkillFragments(ctx: SkillInjectionContext): string[];
/**
 * UI 用：报告某次（假想的）注入调用里每条 skill 的最终状态。
 * Capabilities tab 用它渲染"部分注入 / 超预算未注入"徽章，让截断不再静默。
 */
export declare function getSkillInjectionReport(ctx: SkillInjectionContext): SkillInjectionRecord[];
/** 内置 + enabled user skill 注册的自定义 styleFamily id 全集。 */
export declare function getKnownStyleFamilyIds(host?: HostSkillStore): string[];
/** 某族的 styleHint（builtin 表 / 自定义 skill 声明 / 回退 id）。 */
export declare function styleFamilyHint(id: string, host?: HostSkillStore): string;
/** design-spec system prompt 用的 family 列表行。 */
export declare function styleFamilyListLines(host?: HostSkillStore): string[];
export type { CustomStyleFamilyDef };
/**
 * 抽取所有 enabled + stage 命中的 skill 的 checklist 小节文本（roadmap L4）。
 * 供 art-director 二次评审把"当前启用 skill 自己的验收标准"当 rubric，而非通用 prompt。
 * 按 styleFamily / layoutKinds 走同一套小节路由（先过滤命中的小节，再抽 checklist）。
 */
export declare function getEnabledChecklist(ctx: SkillInjectionContext): string[];
/**
 * 便捷别名：直接拼好的单个字符串，给只需要一段文本的调用方用。
 * 等价于 `getEnabledSkillFragments(ctx).join("\n\n")`。
 */
export declare function getEnabledSkillsPromptSection(ctx: SkillInjectionContext): string;
export { setEnabled as setSkillEnabled, toggleEnabled as toggleSkillEnabled, clearStored as clearSkillEnabled };
