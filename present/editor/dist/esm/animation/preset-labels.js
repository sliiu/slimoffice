import { t } from "../i18n/index.js";
export function presetDisplayName(cls, presetId, fallback) {
    if (presetId === undefined || presetId === null)
        return fallback ?? "—";
    const key = `anim.preset.${cls}.${presetId}`;
    const label = t(key);
    return label === key ? (fallback ?? `#${presetId}`) : label;
}
