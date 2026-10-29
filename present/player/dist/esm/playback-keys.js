/** 放映键盘：快捷键匹配 + 数字跳页缓冲。无 DOM 依赖，方便单测。 */
const KEY_ALIASES = {
    "←": ["ArrowLeft"],
    "→": ["ArrowRight"],
    "↑": ["ArrowUp"],
    "↓": ["ArrowDown"],
    Esc: ["Escape"],
    Escape: ["Escape"],
    Space: [" ", "Spacebar"],
    " ": [" ", "Spacebar"],
    Home: ["Home"],
    End: ["End"],
    Enter: ["Enter", "NumpadEnter"],
    F1: ["F1"],
    PageUp: ["PageUp"],
    PageDown: ["PageDown"],
};
function normKey(k) {
    if (k === " ")
        return " ";
    return k.length === 1 ? k.toLowerCase() : k;
}
/** `shortcut`（菜单上的提示，如 `←` / `F` / `Esc`）是否匹配这次 keydown。 */
export function shortcutMatches(shortcut, e) {
    if (!shortcut || e.ctrlKey || e.metaKey || e.altKey)
        return false;
    const raw = shortcut.trim();
    if (!raw)
        return false;
    const aliased = KEY_ALIASES[raw];
    if (aliased)
        return aliased.includes(e.key) || (e.code !== undefined && aliased.includes(e.code));
    if (raw.length === 1) {
        if (e.shiftKey && raw.toLowerCase() !== raw)
            return e.key === raw;
        return normKey(e.key) === normKey(raw);
    }
    return e.key === raw || e.code === raw;
}
const DIGIT_RE = /^[0-9]$/;
/**
 * 数字 + Enter 跳到第 N 页（1-based）。`slideCount` 是可见序列长度。
 * Backspace 删一位；Esc 清空缓冲（若有）。
 */
export function applyDigitJumpKey(buffer, key, slideCount) {
    if (slideCount <= 0)
        return { kind: "ignore" };
    if (DIGIT_RE.test(key)) {
        const next = (buffer + key).slice(0, 4);
        return { kind: "buffer", buffer: next };
    }
    if (key === "Backspace" && buffer) {
        const next = buffer.slice(0, -1);
        return next ? { kind: "buffer", buffer: next } : { kind: "clear" };
    }
    if (key === "Escape" && buffer)
        return { kind: "clear" };
    if ((key === "Enter" || key === "NumpadEnter") && buffer) {
        const n = Number.parseInt(buffer, 10);
        if (!Number.isFinite(n) || n <= 0)
            return { kind: "clear" };
        const index0 = Math.max(0, Math.min(slideCount - 1, n - 1));
        return { kind: "jump", index0 };
    }
    return { kind: "ignore" };
}
export function isTypingTarget(el) {
    if (!el || typeof el !== "object")
        return false;
    const node = el;
    const tag = (node.tagName ?? "").toUpperCase();
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || node.isContentEditable === true;
}
