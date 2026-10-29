// Skill 启用状态的持久化（仅"开/关"，不存内容）。
//
// 与 mcp/settings.ts 同构：
//   - 单 localStorage key 存 Record<id, { enabled }>；
//   - 未在 storage 中出现的 id 走 descriptor.defaultEnabled（builtin 用）；
//   - user skill 没有 defaultEnabled 概念 —— 用户主动创建/上传即默认 enabled，
//     resolveStates 时若 id 不在 storage 就回 enabled=true。
//
// 设计：与 MCP 拆分独立 key 而非合并 —— 两者语义不同（一个管 tool 集，一个管
// prompt 片段），分开存便于将来分别迁移 / 导入导出。

import type { SkillDescriptor, SkillEnabledState } from "./types";

const STORAGE_KEY = "pp.ai.skills.enabled";

interface MapEntry {
  enabled: boolean;
}

function readStored(): Record<string, MapEntry> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, MapEntry>;
  } catch {
    return {};
  }
}

function writeStored(map: Record<string, MapEntry>): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore quota
  }
}

/**
 * 合并 storage + descriptor 默认值，得到每个 skill 的最终 enabled 状态。
 *
 * descriptor 列表由 registry 拼接（builtin + user via HostSkillStore），调用方
 * 负责传入全集 —— settings 模块不感知来源差异。
 */
export function resolveStates(descriptors: SkillDescriptor[]): SkillEnabledState[] {
  const stored = readStored();
  return descriptors.map((d) => ({
    id: d.id,
    enabled: stored[d.id]?.enabled ?? d.defaultEnabled,
  }));
}

/** 设置某个 skill 的启用状态（持久化）。 */
export function setEnabled(id: string, enabled: boolean): void {
  const map = readStored();
  map[id] = { enabled };
  writeStored(map);
}

/** 三态 toggle（缺省时回退到当前 resolved 值的反向）。 */
export function toggleEnabled(id: string, currentValue: boolean): boolean {
  const next = !currentValue;
  setEnabled(id, next);
  return next;
}

/** 删除某 id 的持久化状态（user skill 被删时调用，避免悬挂 key）。 */
export function clearStored(id: string): void {
  const map = readStored();
  if (id in map) {
    delete map[id];
    writeStored(map);
  }
}
