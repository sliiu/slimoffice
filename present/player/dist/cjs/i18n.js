"use strict";
// Player 运行时 i18n
//
// player（含内置插件）在放映态会渲染少量 UI 文本：右键菜单项、白板工具栏、
// 激光笔菜单等。editor 的 i18n 在 @sliiu/present-editor，但 player 是可独立分发的运行时
// （导出的单文件 HTML / zip 里只带 player.iife.js，不含 editor），所以这里维护一份
// 独立、精简的文案表。
//
// 用法：
//   const tr = createTranslator(opts.locale);   // mount() 内
//   tr("menu.next")                              // → "Next" / "下一页"
//
// 新增 UI 文本时：在 PlayerMessageKey 里加 key，并在 en / zhCN 两张表里补齐。
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_PLAYER_LOCALE = void 0;
exports.resolvePlayerLocale = resolvePlayerLocale;
exports.createTranslator = createTranslator;
const en = {
    "menu.prev": "Previous",
    "menu.next": "Next",
    "menu.first": "First slide",
    "menu.last": "Last slide",
    "menu.fullscreen": "Toggle fullscreen",
    "menu.end": "End show",
    "wb.menu.toggle": "Whiteboard",
    "wb.menu.clear": "Clear whiteboard (this slide)",
    "wb.pen": "✎ Pen",
    "wb.pen.title": "Pen",
    "wb.highlight": "🖍 Highlight",
    "wb.highlight.title": "Highlighter",
    "wb.eraser": "⌫ Eraser",
    "wb.eraser.title": "Eraser",
    "wb.clear": "Clear",
    "wb.clear.title": "Clear current slide",
    "wb.close": "Close",
    "wb.close.title": "Close whiteboard (Esc)",
    "laser.menu.toggle": "Laser pointer",
    "outline.panel.title": "Outline",
    "outline.untitled": "Untitled",
    "notes.panel.title": "Speaker Notes",
    "notes.empty": "(No speaker notes for this slide)",
    "thumb.panel.title": "Thumbnails",
    "screenshot.menu.save": "Save slide image (PNG)",
    "screenshot.toolbar": "📷",
    "menu.black": "Black screen",
    "menu.white": "White screen",
    "menu.grid": "See all slides",
    "menu.help": "Shortcut help",
    "chrome.blackHint": "B · resume",
    "chrome.whiteHint": ", · resume",
    "chrome.endTitle": "End of slideshow",
    "chrome.endHint": "Click or Esc to exit · ← previous",
    "chrome.endReplay": "Play from start",
    "chrome.endHome": "Home",
    "chrome.paused": "Autoplay paused (P)",
    "help.title": "Slideshow shortcuts",
    "help.next": "Next animation / slide",
    "help.prev": "Previous slide",
    "help.jump": "Jump to slide N",
    "help.black": "Black screen",
    "help.white": "White screen",
    "help.grid": "See all slides",
    "help.laser": "Laser pointer",
    "help.ink": "Pen / whiteboard",
    "help.full": "Fullscreen",
    "help.pause": "Pause autoplay",
    "help.help": "This list",
    "help.end": "End show",
    "narration.title": "This slideshow has narration",
    "narration.body": "Audio will play during the show. Continue with sound on?",
    "narration.play": "Play with sound",
    "narration.mute": "Play muted",
    "passpad.panel.title": "PassPad",
    "passpad.connecting": "Connecting to PassPad companion…",
    "passpad.linked": "Remote linked. Notes are sent to the AI Passport.",
    "passpad.disconnected": "Disconnected. Start PassPad companion, then reload playback.",
    "passpad.unreachable": "Companion not reachable at 127.0.0.1:19520",
    "passpad.unreachableHint": "Companion not reachable. Run `pnpm companion` in PassPad.",
    "lecture.pause": "Pause",
    "lecture.resume": "Resume",
};
const zhCN = {
    "menu.prev": "上一页",
    "menu.next": "下一页",
    "menu.first": "第一页",
    "menu.last": "最后一页",
    "menu.fullscreen": "切换全屏",
    "menu.end": "结束放映",
    "wb.menu.toggle": "白板",
    "wb.menu.clear": "清除白板（本页）",
    "wb.pen": "✎ 画笔",
    "wb.pen.title": "画笔",
    "wb.highlight": "🖍 荧光笔",
    "wb.highlight.title": "荧光笔",
    "wb.eraser": "⌫ 橡皮",
    "wb.eraser.title": "橡皮擦",
    "wb.clear": "清除",
    "wb.clear.title": "清除当前页",
    "wb.close": "关闭",
    "wb.close.title": "关闭白板 (Esc)",
    "laser.menu.toggle": "激光笔",
    "outline.panel.title": "大纲",
    "outline.untitled": "未命名",
    "notes.panel.title": "演讲者备注",
    "notes.empty": "（本页无演讲者备注）",
    "thumb.panel.title": "缩略图",
    "screenshot.menu.save": "保存幻灯片图片 (PNG)",
    "screenshot.toolbar": "📷",
    "menu.black": "黑屏",
    "menu.white": "白屏",
    "menu.grid": "查看所有幻灯片",
    "menu.help": "快捷键说明",
    "chrome.blackHint": "B · 恢复",
    "chrome.whiteHint": ", · 恢复",
    "chrome.endTitle": "放映结束",
    "chrome.endHint": "单击或 Esc 退出 · ← 返回上一页",
    "chrome.endReplay": "从头播放",
    "chrome.endHome": "首页",
    "chrome.paused": "自动播放已暂停 (P)",
    "help.title": "放映快捷键",
    "help.next": "下一项动画 / 下一页",
    "help.prev": "上一页",
    "help.jump": "跳到第 N 页",
    "help.black": "黑屏",
    "help.white": "白屏",
    "help.grid": "查看所有幻灯片",
    "help.laser": "激光笔",
    "help.ink": "画笔 / 白板",
    "help.full": "全屏",
    "help.pause": "暂停自动播放",
    "help.help": "本说明",
    "help.end": "结束放映",
    "narration.title": "本演示包含旁白",
    "narration.body": "放映时会播放声音。是否开启声音继续？",
    "narration.play": "播放声音",
    "narration.mute": "静音放映",
    "passpad.panel.title": "PassPad",
    "passpad.connecting": "正在连接 PassPad 伴侣服务…",
    "passpad.linked": "遥控已连接，备注已发送至 AI Passport。",
    "passpad.disconnected": "已断开。请先启动 PassPad 伴侣服务，然后重新放映。",
    "passpad.unreachable": "无法连接 127.0.0.1:19520 上的伴侣服务",
    "passpad.unreachableHint": "无法连接伴侣服务。请在 PassPad 项目中运行 `pnpm companion`。",
    "lecture.pause": "暂停",
    "lecture.resume": "继续",
};
const CATALOGS = { en, "zh-CN": zhCN };
exports.DEFAULT_PLAYER_LOCALE = "en";
/**
 * 把任意 locale 字符串归一到受支持的 catalog key。"zh" / "zh-cn" / "zh-CN" / "zh-TW"
 * 等都归到 "zh-CN"，其余一律回退到 "en"。
 */
function resolvePlayerLocale(locale) {
    if (!locale)
        return exports.DEFAULT_PLAYER_LOCALE;
    const lower = locale.toLowerCase();
    if (lower === "zh" || lower.startsWith("zh-") || lower.startsWith("zh_"))
        return "zh-CN";
    return exports.DEFAULT_PLAYER_LOCALE;
}
/** 创建一个绑定到指定 locale 的翻译函数。缺失 key 回退到英文。 */
function createTranslator(locale) {
    const resolved = resolvePlayerLocale(locale);
    const dict = CATALOGS[resolved] ?? en;
    return (key) => dict[key] ?? en[key] ?? key;
}
