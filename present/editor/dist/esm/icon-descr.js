const ICON_DESCR_PREFIX = "ppt-icon:";
export function encodeIconDescr(iconId, color) {
    return `${ICON_DESCR_PREFIX}${iconId}|${color}`;
}
export function decodeIconDescr(descr) {
    if (!descr?.startsWith(ICON_DESCR_PREFIX))
        return null;
    const rest = descr.slice(ICON_DESCR_PREFIX.length);
    const pipe = rest.indexOf("|");
    if (pipe < 0)
        return null;
    return { iconId: rest.slice(0, pipe), color: rest.slice(pipe + 1) || "#111827" };
}
