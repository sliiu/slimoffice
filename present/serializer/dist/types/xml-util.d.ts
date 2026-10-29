export declare const PPT_NAMESPACES: {
    p: string;
    a: string;
    r: string;
    pic: string;
};
export declare function xmlHeader(): string;
export declare function esc(s: string | number | boolean | undefined): string;
/**
 * 把内存里的 CSS font-family 列表（如 `"Tahoma, Calibri", Tahoma, Calibri`）
 * 折回 OOXML `<a:latin typeface="…">` 接受的单字体名。
 *
 * **为什么需要这个**：parser 把 `<a:latin typeface="Tahoma, Calibri"/>` 读成一个
 * **单一** typeface 字符串 `"Tahoma, Calibri"`，再被 `cssFontFamily(...)` 包
 * 一层 CSS 引号变成 `"Tahoma, Calibri"`，并附加 ea/cs/默认 fallback 拼成
 * `'"Tahoma, Calibri", Tahoma, Calibri'`。如果 serializer 不做反向解析，写回时
 * 就把整条 CSS list 塞进 typeface 属性，下一次 parser 又会再包一层引号 →
 * 每次 open-save 字符串都膨胀，破坏 round-trip 幂等。
 *
 * 行为：
 *   - 接收任意 CSS font-family 写法（用逗号分隔的列表，元素可加双/单引号）
 *   - 解析出第一项（按 OOXML 规范，`<a:latin typeface>` 是单值）
 *   - 去掉外层引号并 unescape `\"` / `\'`
 *   - 字符串为空 / undefined 时返回 undefined（调用方据此决定是否写 a:latin 子节点）
 *
 * **注意**：这条规则只拆 latin 槽位用的单字体名。东亚槽由 `pickEaTypeface`
 * 另写 `<a:ea>`（含「微软雅黑」这种与 latin 同名的情况）。
 */
export declare function firstCssTypeface(css: string | undefined): string | undefined;
/**
 * 内存 `TextRun.underline`（true / "single" / "double" / "dotted" / "dashed" / "wavy"）
 * → OOXML ST_TextUnderlineType（ECMA-376 §20.1.10.82）。
 * 内存形态是 parser 端 mapUnderline 归一化后的值（"sng"→"single" 等），写回时必须
 * 反向映射 —— 直接写 "single" 不是合法枚举值，PowerPoint 会当作 schema 错误。
 */
export declare function underlineToOoxml(u: boolean | "single" | "double" | "dotted" | "dashed" | "wavy" | undefined): string | undefined;
export type Attrs = Record<string, string | number | boolean | undefined>;
export declare function attrs(o: Attrs): string;
export declare function tag(name: string, a?: Attrs, body?: string): string;
export declare function pxToEmu(px: number): number;
/** 与 parser `stHundredthPtToPx` 对偶：px → OOXML 百分之一磅（spc / sz / spcPts）。 */
export declare function pxToHundredthPt(px: number): number;
export declare function angleToEmu(deg: number): number;
/**
 * 把任意颜色字符串归一化成 `{ hex: "RRGGBB", alpha: 0..1 | undefined }`。
 *
 * 支持的输入：
 *   - `#rgb` / `#rrggbb` / `#rrggbbaa`（标准 hex）
 *   - 裸 hex（不带 `#`）
 *   - CSS `rgb(r,g,b)` / `rgba(r,g,b,a)`（大小写无关、空格可选）
 *
 * 不支持的（如 `hsl()` / 命名色 `red`）会被保守地输出为 `000000`，避免写出非法
 * `<a:srgbClr val="...">` 让 PowerPoint / WPS 解析失败（典型症状：整张幻灯片中
 * 这条 run 之后的渲染丢失，例如 `<p:bg>` 上的覆盖矩形被忽略）。
 *
 * 历史上这里只是大写截断字符串，AI compile/layouts.ts 写出的
 * `rgba(255,255,255,0.85)` 会变成 `val="RGBA(255,255,255,0.85)"` → WPS 拒绝渲染。
 */
export declare function parseColor(color: string | undefined): {
    hex: string;
    alpha?: number;
};
/**
 * 兼容旧调用方：仅取 6-hex 部分（丢弃 alpha 通道）。
 * 新代码请尽量用 `parseColor`，并把 alpha 写到 `<a:alpha val="…"/>` 里。
 */
export declare function hex(color: string): string;
