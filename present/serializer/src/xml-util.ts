export const PPT_NAMESPACES = {
  p: "http://schemas.openxmlformats.org/presentationml/2006/main",
  a: "http://schemas.openxmlformats.org/drawingml/2006/main",
  r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  pic: "http://schemas.openxmlformats.org/drawingml/2006/picture",
};

export function xmlHeader(): string {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
}

export function esc(s: string | number | boolean | undefined): string {
  if (s === undefined || s === null) return "";
  const str = String(s);
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

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
export function firstCssTypeface(css: string | undefined): string | undefined {
  if (!css) return undefined;
  let i = 0;
  while (i < css.length && /\s/.test(css[i]!)) i++;
  if (i >= css.length) return undefined;
  let first: string;
  const q = css[i];
  if (q === '"' || q === "'") {
    i++;
    let out = "";
    while (i < css.length && css[i] !== q) {
      if (css[i] === "\\" && i + 1 < css.length) {
        out += css[i + 1];
        i += 2;
      } else {
        out += css[i++];
      }
    }
    first = out;
  } else {
    const comma = css.indexOf(",", i);
    first = (comma < 0 ? css.slice(i) : css.slice(i, comma)).trim();
  }
  first = first.trim();
  return first || undefined;
}

/**
 * 内存 `TextRun.underline`（true / "single" / "double" / "dotted" / "dashed" / "wavy"）
 * → OOXML ST_TextUnderlineType（ECMA-376 §20.1.10.82）。
 * 内存形态是 parser 端 mapUnderline 归一化后的值（"sng"→"single" 等），写回时必须
 * 反向映射 —— 直接写 "single" 不是合法枚举值，PowerPoint 会当作 schema 错误。
 */
export function underlineToOoxml(
  u: boolean | "single" | "double" | "dotted" | "dashed" | "wavy" | undefined,
): string | undefined {
  if (!u) return undefined;
  switch (u) {
    case "double":
      return "dbl";
    case "dotted":
      return "dotted";
    case "dashed":
      return "dash";
    case "wavy":
      return "wavy";
    default:
      return "sng";
  }
}

export type Attrs = Record<string, string | number | boolean | undefined>;

export function attrs(o: Attrs): string {
  const parts: string[] = [];
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (v === undefined || v === null || v === false) continue;
    if (v === true) parts.push(k);
    else parts.push(`${k}="${esc(v)}"`);
  }
  return parts.length ? " " + parts.join(" ") : "";
}

export function tag(name: string, a: Attrs = {}, body?: string): string {
  if (body === undefined || body === "") return `<${name}${attrs(a)}/>`;
  return `<${name}${attrs(a)}>${body}</${name}>`;
}

export function pxToEmu(px: number): number {
  return Math.round(px * 9525);
}

/** 与 parser `stHundredthPtToPx` 对偶：px → OOXML 百分之一磅（spc / sz / spcPts）。 */
export function pxToHundredthPt(px: number): number {
  return Math.round(px * 75);
}

export function angleToEmu(deg: number): number {
  return Math.round(deg * 60000);
}

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
export function parseColor(color: string | undefined): { hex: string; alpha?: number } {
  if (!color) return { hex: "000000" };
  const s = color.trim();
  if (!s) return { hex: "000000" };
  const m = /^rgba?\s*\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*([0-9.]+))?\s*\)$/i.exec(s);
  if (m) {
    const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
    const r = clamp(parseFloat(m[1]!));
    const g = clamp(parseFloat(m[2]!));
    const b = clamp(parseFloat(m[3]!));
    const aStr = m[4];
    const a = aStr !== undefined ? Math.max(0, Math.min(1, parseFloat(aStr))) : undefined;
    const toHex = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();
    const res: { hex: string; alpha?: number } = { hex: toHex(r) + toHex(g) + toHex(b) };
    if (a !== undefined && a < 1) res.alpha = a;
    return res;
  }
  const c = s.startsWith("#") ? s.slice(1) : s;
  if (/^[0-9a-f]{8}$/i.test(c)) {
    const a = parseInt(c.slice(6, 8), 16) / 255;
    const res: { hex: string; alpha?: number } = { hex: c.slice(0, 6).toUpperCase() };
    if (a < 1) res.alpha = a;
    return res;
  }
  if (/^[0-9a-f]{6}$/i.test(c)) return { hex: c.toUpperCase() };
  if (/^[0-9a-f]{3}$/i.test(c)) {
    return { hex: (c[0]! + c[0]! + c[1]! + c[1]! + c[2]! + c[2]!).toUpperCase() };
  }
  return { hex: "000000" };
}

/**
 * 兼容旧调用方：仅取 6-hex 部分（丢弃 alpha 通道）。
 * 新代码请尽量用 `parseColor`，并把 alpha 写到 `<a:alpha val="…"/>` 里。
 */
export function hex(color: string): string {
  return parseColor(color).hex;
}
