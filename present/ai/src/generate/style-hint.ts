// 视觉风格 hint 抽取 helper。
/** 从用户 guidance 提取视觉风格提示，供 theme / motion 生成使用。 */
export function guidanceStyleHint(g: {
  extraNotes?: string;
  scenario?: string;
  goals?: string;
  topic?: string;
}): string | undefined {
  const parts = [g.extraNotes, g.scenario, g.goals].filter((s) => s?.trim());
  if (parts.length === 0) return undefined;
  return parts.join(" · ");
}
