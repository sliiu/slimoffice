// Generate wizard brief fields — declared per skill via frontmatter `briefFields`.
//
// Enabled skills (stage generate | both) union their briefFields; the UI surfaces
// editable inputs on the options step without hardcoding skill ids.

import type { SkillView } from "./types";

/** Keys aligned with GuidanceInput / generate wizard content fields. */
export const GENERATE_BRIEF_FIELD_IDS = [
  "topic",
  "audience",
  "scenario",
  "goals",
  "styleFamily",
  "slideCount",
  "language",
  "extraNotes",
] as const;

export type GenerateBriefFieldId = (typeof GENERATE_BRIEF_FIELD_IDS)[number];

const FIELD_ID_SET = new Set<string>(GENERATE_BRIEF_FIELD_IDS);

export function isGenerateBriefFieldId(s: string): s is GenerateBriefFieldId {
  return FIELD_ID_SET.has(s);
}

/** Parse `briefFields: audience, scenario, goals` from skill frontmatter. */
export function parseBriefFieldsCsv(raw: string | undefined): GenerateBriefFieldId[] {
  if (!raw?.trim()) return [];
  const out: GenerateBriefFieldId[] = [];
  for (const part of raw.split(",")) {
    const id = part.trim();
    if (!id) continue;
    if (isGenerateBriefFieldId(id)) {
      if (!out.includes(id)) out.push(id);
    } else {
      console.warn(`[skills] unknown briefFields entry "${id}" — ignored`);
    }
  }
  return out;
}

export function formatBriefFieldsCsv(fields: GenerateBriefFieldId[] | undefined): string {
  if (!fields?.length) return "";
  return fields.join(", ");
}

export interface BriefFieldValues {
  topic: string;
  audience: string;
  scenario: string;
  goals: string;
  styleFamily: string;
  /** Design P1 visual system (wizard default A). */
  visualSystem: "A" | "B";
  slideCount: string;
  language: string;
  extraNotes: string;
}

export interface ResolvedBriefField {
  field: GenerateBriefFieldId;
  /** Skill display names that requested this field. */
  requestedBy: string[];
}

export interface ResolvedCustomBriefField {
  /** 自由文本 label（skill frontmatter `briefCustom` 里的原文，如"品牌主色"）。 */
  label: string;
  /** Skill display names that requested this field. */
  requestedBy: string[];
}

/**
 * Union free-form briefCustom labels from enabled generate-affecting skills.
 * 同名 label（大小写不敏感）合并 requestedBy；显示用第一次出现的原文。
 */
export function resolveCustomBriefFields(
  skills: Array<Pick<SkillView, "id" | "name" | "enabled" | "stage" | "briefCustom">>,
): ResolvedCustomBriefField[] {
  const byKey = new Map<string, ResolvedCustomBriefField>();
  for (const skill of skills) {
    if (!skill.enabled) continue;
    if (skill.stage !== "generate" && skill.stage !== "both") continue;
    for (const label of skill.briefCustom ?? []) {
      const key = label.toLowerCase();
      const entry = byKey.get(key) ?? { label, requestedBy: [] };
      if (!entry.requestedBy.includes(skill.name)) entry.requestedBy.push(skill.name);
      byKey.set(key, entry);
    }
  }
  return [...byKey.values()];
}

/** Union briefFields from enabled skills that affect the generate path. */
export function resolveRequiredBriefFields(
  skills: Array<Pick<SkillView, "id" | "name" | "enabled" | "stage" | "briefFields">>,
): ResolvedBriefField[] {
  const byField = new Map<GenerateBriefFieldId, string[]>();
  for (const skill of skills) {
    if (!skill.enabled) continue;
    if (skill.stage !== "generate" && skill.stage !== "both") continue;
    for (const field of skill.briefFields ?? []) {
      const list = byField.get(field) ?? [];
      if (!list.includes(skill.name)) list.push(skill.name);
      byField.set(field, list);
    }
  }
  return GENERATE_BRIEF_FIELD_IDS.filter((f) => byField.has(f)).map((field) => ({
    field,
    requestedBy: byField.get(field)!,
  }));
}

export function isBriefFieldFilled(field: GenerateBriefFieldId, values: BriefFieldValues): boolean {
  const raw = values[field]?.trim() ?? "";
  if (field === "slideCount") {
    const n = parseInt(raw, 10);
    return !isNaN(n) && n > 0;
  }
  // styleFamily 是下拉选择，其空值 = "自动（由主题/场景推断）"，本身就是一个合法且完整的
  // 选择（让 AI 推断风格），不是"未指定"。因此恒视为已填，避免选"自动"时被误报未填写。
  if (field === "styleFamily") return true;
  return raw.length > 0;
}

/** True if any skill (enabled or not) declares this field in briefFields. */
export function isSkillGatedBriefField(
  skills: Array<Pick<SkillView, "stage" | "briefFields">>,
  field: GenerateBriefFieldId,
): boolean {
  return skills.some(
    (s) => (s.stage === "generate" || s.stage === "both") && (s.briefFields ?? []).includes(field),
  );
}

/** Content-step visibility: always on unless skill-gated and no enabled skill requests it. */
export function isBriefFieldVisibleForGenerate(
  skills: Array<Pick<SkillView, "id" | "name" | "enabled" | "stage" | "briefFields">>,
  field: GenerateBriefFieldId,
): boolean {
  if (field === "topic") return true;
  if (!isSkillGatedBriefField(skills, field)) return true;
  return resolveRequiredBriefFields(skills).some((r) => r.field === field);
}
