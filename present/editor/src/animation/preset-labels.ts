import { t, type MessageKey } from "../i18n";

export function presetDisplayName(
  cls: string,
  presetId: number | undefined,
  fallback?: string,
): string {
  if (presetId === undefined || presetId === null) return fallback ?? "—";
  const key = `anim.preset.${cls}.${presetId}` as MessageKey;
  const label = t(key);
  return label === key ? (fallback ?? `#${presetId}`) : label;
}
