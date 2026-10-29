// 编辑器 i18n 入口。
//
// 设计要点：
//   1. 单例模式：整个进程共享 currentLocale 与 messages 表。所有 t() 调用都在调用
//      时刻读取当前 locale —— 这意味着 setLocale 后必须重新调用 mountEditor / refresh
//      才能让 UI 文本切换（DOM 中的 textContent 不是 reactive 的）。
//   2. 默认 locale = "en"。 mountEditor 可以通过 opts.locale 覆盖。
//   3. 缺失 key 时 fallback 到 en；en 也找不到时返回 key 本身（便于在开发期定位）。
//   4. 参数占位用 {name} 风格，避免与 ICU MessageFormat 混淆——本项目暂不需要复数 / 性别变体。
//   5. registerMessages 暴露给外部，方便用户在 mountEditor 之前注入第三方语言包。
import { en } from "./messages-en.js";
import { zhCN } from "./messages-zh.js";
const DEFAULT_LOCALE = "en";
const messages = {
    en,
    // 别名：alias "zh"、"zh-cn"、"zh-CN" 都指向 zhCN（用户可能用任意一种）。
    zh: zhCN,
    "zh-cn": zhCN,
    "zh-CN": zhCN,
};
let currentLocale = DEFAULT_LOCALE;
export function setLocale(locale) {
    currentLocale = locale;
}
export function getLocale() {
    return currentLocale;
}
export function registerMessages(locale, msgs) {
    const existing = messages[locale];
    if (existing) {
        messages[locale] = { ...existing, ...msgs };
    }
    else {
        messages[locale] = msgs;
    }
}
// 把 "{name}" 占位符替换为 params 中对应字段；缺失字段保持 "{name}" 不变（开发期能看到）。
function interpolate(template, params) {
    if (!params)
        return template;
    return template.replace(/\{(\w+)\}/g, (m, key) => {
        const v = params[key];
        return v === undefined || v === null ? m : String(v);
    });
}
export function t(key, params) {
    const dict = messages[currentLocale] ?? messages[DEFAULT_LOCALE];
    const tpl = dict[key] ?? messages[DEFAULT_LOCALE][key] ?? key;
    return interpolate(tpl, params);
}
