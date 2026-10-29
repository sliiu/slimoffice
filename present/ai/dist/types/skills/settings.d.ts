import type { SkillDescriptor, SkillEnabledState } from "./types.js";
/**
 * 合并 storage + descriptor 默认值，得到每个 skill 的最终 enabled 状态。
 *
 * descriptor 列表由 registry 拼接（builtin + user via HostSkillStore），调用方
 * 负责传入全集 —— settings 模块不感知来源差异。
 */
export declare function resolveStates(descriptors: SkillDescriptor[]): SkillEnabledState[];
/** 设置某个 skill 的启用状态（持久化）。 */
export declare function setEnabled(id: string, enabled: boolean): void;
/** 三态 toggle（缺省时回退到当前 resolved 值的反向）。 */
export declare function toggleEnabled(id: string, currentValue: boolean): boolean;
/** 删除某 id 的持久化状态（user skill 被删时调用，避免悬挂 key）。 */
export declare function clearStored(id: string): void;
