/** 放映键盘：快捷键匹配 + 数字跳页缓冲。无 DOM 依赖，方便单测。 */
export interface KeyLike {
    key: string;
    code?: string;
    ctrlKey: boolean;
    metaKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
}
/** `shortcut`（菜单上的提示，如 `←` / `F` / `Esc`）是否匹配这次 keydown。 */
export declare function shortcutMatches(shortcut: string | undefined, e: KeyLike): boolean;
export type DigitJumpResult = {
    kind: "ignore";
} | {
    kind: "buffer";
    buffer: string;
} | {
    kind: "jump";
    index0: number;
} | {
    kind: "clear";
};
/**
 * 数字 + Enter 跳到第 N 页（1-based）。`slideCount` 是可见序列长度。
 * Backspace 删一位；Esc 清空缓冲（若有）。
 */
export declare function applyDigitJumpKey(buffer: string, key: string, slideCount: number): DigitJumpResult;
export interface TypingTargetLike {
    tagName?: string;
    isContentEditable?: boolean;
}
export declare function isTypingTarget(el: EventTarget | TypingTargetLike | null): boolean;
