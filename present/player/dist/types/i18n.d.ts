export type PlayerMessageKey = "menu.prev" | "menu.next" | "menu.first" | "menu.last" | "menu.fullscreen" | "menu.end" | "wb.menu.toggle" | "wb.menu.clear" | "wb.pen" | "wb.pen.title" | "wb.highlight" | "wb.highlight.title" | "wb.eraser" | "wb.eraser.title" | "wb.clear" | "wb.clear.title" | "wb.close" | "wb.close.title" | "laser.menu.toggle" | "outline.panel.title" | "outline.untitled" | "notes.panel.title" | "notes.empty" | "thumb.panel.title" | "screenshot.menu.save" | "screenshot.toolbar" | "menu.black" | "menu.white" | "menu.grid" | "menu.help" | "chrome.blackHint" | "chrome.whiteHint" | "chrome.endTitle" | "chrome.endHint" | "chrome.endReplay" | "chrome.endHome" | "chrome.paused" | "help.title" | "help.next" | "help.prev" | "help.jump" | "help.black" | "help.white" | "help.grid" | "help.laser" | "help.ink" | "help.full" | "help.pause" | "help.help" | "help.end" | "narration.title" | "narration.body" | "narration.play" | "narration.mute" | "passpad.panel.title" | "passpad.connecting" | "passpad.linked" | "passpad.disconnected" | "passpad.unreachable" | "passpad.unreachableHint" | "lecture.pause" | "lecture.resume";
export declare const DEFAULT_PLAYER_LOCALE = "en";
/**
 * 把任意 locale 字符串归一到受支持的 catalog key。"zh" / "zh-cn" / "zh-CN" / "zh-TW"
 * 等都归到 "zh-CN"，其余一律回退到 "en"。
 */
export declare function resolvePlayerLocale(locale: string | undefined): string;
export type PlayerTranslator = (key: PlayerMessageKey) => string;
/** 创建一个绑定到指定 locale 的翻译函数。缺失 key 回退到英文。 */
export declare function createTranslator(locale: string | undefined): PlayerTranslator;
