import { type XmlNode } from "./xml.js";
export interface ThemeFontSet {
    latin?: string;
    ea?: string;
    cs?: string;
    sym?: string;
}
export interface ThemeStyleEntry {
    tag: string;
    raw: XmlNode;
}
export interface ObjectDefaults {
    spDef?: XmlNode;
    lnDef?: XmlNode;
    txDef?: XmlNode;
}
export interface ThemeData {
    name?: string;
    schemeColors: Map<string, string>;
    /**
     * theme part 自身的 rels（由 loadThemeForPart 挂上）。fillStyleLst / bgFillStyleLst
     * 里的 `<a:blip r:embed>` 是 theme part 作用域的 rId，解析这些 style entry 时必须用
     * 这份 rels，而不是引用方（master/layout/slide）的 rels。
     */
    rels?: import("./parts.js").RelMap;
    fontMajor?: string;
    fontMinor?: string;
    fontMajorSet?: ThemeFontSet;
    fontMinorSet?: ThemeFontSet;
    fillStyleLst?: ThemeStyleEntry[];
    lnStyleLst?: ThemeStyleEntry[];
    effectStyleLst?: ThemeStyleEntry[];
    bgFillStyleLst?: ThemeStyleEntry[];
    objectDefaults?: ObjectDefaults;
}
export declare function parseTheme(xml: XmlNode | undefined): ThemeData;
/**
 * 把 clrMap 应用到 theme，得到「按该 part 的槽位映射解析 schemeClr」的有效 theme。
 *
 * 注意：映射的**读取端**永远是原始 clrScheme 值（dk1/lt1/... 与 accent/hlink 原值），
 * 写入端只覆盖槽位别名 —— 先整体取原值快照再写，避免 accent1→accent2 / accent2→accent1
 * 这类交换映射出现「读到已被覆盖的值」的错误串联。
 *
 * 常见 Office 默认映射（bg1=lt1 tx1=dk1 bg2=lt2 tx2=dk2、其余恒等）与 parseTheme 里
 * 预置的别名一致，此时原样返回同一个 theme 对象（零行为变化）。
 */
export declare function applyClrMapToTheme(theme: ThemeData | undefined, clrMap: Record<string, string> | undefined): ThemeData | undefined;
export interface ResolvedColor {
    color: string;
    alpha: number;
}
export declare function resolveColor(node: XmlNode | undefined, theme: ThemeData | undefined): string | undefined;
export declare function resolveColorEx(node: XmlNode | undefined, theme: ThemeData | undefined): ResolvedColor | undefined;
