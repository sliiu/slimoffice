const GENERIC_FAMILY = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-sans-serif|ui-serif|ui-monospace|ui-rounded|emoji|math|fangsong|-apple-system|BlinkMacSystemFont)$/i;
const CJK_LATIN_FAMILY = /YaHei|Yahei|PingFang|Hiragino|Heiti|STHeiti|STSong|STKaiti|STFangsong|SimSun|SimHei|KaiTi|FangSong|Microsoft JhengHei|PMingLiU|MingLiU|Meiryo|Yu Gothic|YuGothic|Yu Mincho|Malgun|Gulim|Batang|Dotum|Noto Sans CJK|Noto Sans SC|Noto Sans TC|Noto Serif CJK|Source Han|WenQuanYi|Apple SD Gothic|Songti|Heiti SC|Heiti TC|LiHei|LiSong|MS Mincho|MS Gothic|YuMincho|Malgun Gothic/i;
/** 字体名本身是东亚字体（含中文名 / 微软雅黑等），应写入 `<a:ea>`。 */
export function looksCjkTypeface(name) {
    if (!name)
        return false;
    if (/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(name))
        return true;
    return CJK_LATIN_FAMILY.test(name);
}
/** 从 CSS font stack 提取东亚字体（ea），避免 PowerPoint / WPS 中文回退到默认宋体。 */
export function pickEaTypeface(family) {
    if (!family)
        return undefined;
    const trimmed = family.trim();
    if (!trimmed)
        return undefined;
    const parts = trimmed
        .split(",")
        .map((p) => primaryTypeface(p.trim()))
        .filter((p) => !!p && !GENERIC_FAMILY.test(p));
    const cjk = parts.find(looksCjkTypeface);
    if (cjk)
        return cjk;
    return undefined;
}
/** 从 CSS font stack 或裸 family 名提取 OOXML typeface（取第一个有效 family）。 */
export function primaryTypeface(family) {
    if (!family)
        return undefined;
    const trimmed = family.trim();
    if (!trimmed)
        return undefined;
    // "Poppins", "Inter", sans-serif → Poppins
    const quoted = /^["']([^"']+)["']/.exec(trimmed);
    if (quoted)
        return quoted[1].trim();
    // 无引号时取逗号前第一段
    const first = trimmed.split(",")[0]?.trim();
    return first || undefined;
}
/**
 * 推断「主题画布背景」—— AI 换主题后 slide.background 已更新，但 master/layout
 * 部件在内存里往往仍是模板旧底色（白）。导出时必须让 master/layout 的 `<p:bg>`
 * 与 slide 一致，否则 PowerPoint 仍按旧母版渲染，看起来「主题没换」。
 */
export function inferThemeCanvasBackground(pres) {
    for (const slide of pres.slides) {
        const bg = slide.background;
        if (!bg || bg.kind === "none")
            continue;
        if (bg.kind === "image")
            continue;
        return bg;
    }
    const bg1 = pres.theme?.colors?.bg1;
    if (bg1)
        return { kind: "solid", color: bg1.startsWith("#") ? bg1 : `#${bg1}` };
    return undefined;
}
/**
 * master / layout 导出时应使用的背景：仅当部件**自己**显式声明了一个与 slide 主题
 * 画布不同的底色时，才用 canvas 覆盖；部件原本依赖继承（`partBackground === undefined`）
 * 时保持继承，绝不注入显式 `<p:bg>` —— 否则普通"打开即保存"会给原本无 `<p:bg>` 的
 * 所有 layout 都加一个空白底色，污染 27+ part 字节，二次 round-trip 不收敛。
 *
 * 典型触发场景的归属：
 *   - AI 换主题 + master/layout 已有自家 bg → fired，更新到新 canvas（保持视觉一致）。
 *   - AI 换主题 + master/layout 依赖继承 → 不 fired，靠 theme.colors 重新解析继承结果。
 *   - 用户只打开未编辑 → 不 fired，layout 保留原始字节。
 */
export function backgroundForThemeExport(partBackground, pres) {
    if (partBackground === undefined)
        return undefined;
    const canvas = inferThemeCanvasBackground(pres);
    if (!canvas)
        return partBackground;
    if (paintEqual(canvas, partBackground))
        return partBackground;
    return canvas;
}
function paintEqual(a, b) {
    return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}
/** 比较 theme.colors/fonts 是否变化（round-trip 触发 theme XML patch 用）。 */
export function themeColorsFontsEqual(a, b) {
    const norm = (t) => t ? { colors: t.colors ?? null, fonts: t.fonts ?? null } : null;
    return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}
/**
 * 主题 major/minor 上的 ISO 15924 补字（ECMA-376 CT_SupplementalFont）。
 * 空 `<a:ea typeface="">` 在 Office 表示「用应用默认 CJK」；LibreOffice / 部分 WPS
 * 会当成缺字体。脚本槽给出真实家族名后，中日韩不会变成方框。
 */
export const THEME_SCRIPT_FONTS = [
    { script: "Jpan", typeface: "Yu Gothic" },
    { script: "Hang", typeface: "Malgun Gothic" },
    { script: "Hans", typeface: "Microsoft YaHei" },
    { script: "Hant", typeface: "Microsoft JhengHei" },
    { script: "Arab", typeface: "Arial" },
    { script: "Hebr", typeface: "Arial" },
    { script: "Thai", typeface: "Tahoma" },
];
function escTypeface(s) {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/"/g, "&quot;");
}
export function themeScriptFontsXml() {
    return THEME_SCRIPT_FONTS.map((f) => `<a:font script="${f.script}" typeface="${escTypeface(f.typeface)}"/>`).join("");
}
/** latin / ea / cs + 脚本补字。cs 永不写空 typeface（LibreOffice 会当成缺字体）。 */
export function themeTypefacesXml(latin, ea) {
    const eaFace = ea ?? "";
    return `<a:latin typeface="${escTypeface(latin)}"/><a:ea typeface="${escTypeface(eaFace)}"/><a:cs typeface="${escTypeface(latin)}"/>${themeScriptFontsXml()}`;
}
/**
 * Office 风格 fmtScheme（3 fill / 3 ln / 3 effect / 3 bgFill）。
 * from-scratch 以前三条都是实心 phClr，PowerPoint 套「中等/强烈」快速样式会变成一片纯色。
 */
export function officeFmtSchemeXml() {
    const solid = `<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>`;
    const ln = (w) => `<a:ln w="${w}" cap="flat" cmpd="sng" algn="ctr">${solid}<a:prstDash val="solid"/><a:miter lim="800000"/></a:ln>`;
    const shadow = `<a:outerShdw blurRad="40000" dist="23000" dir="5400000" algn="ctr" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="35000"/></a:srgbClr></a:outerShdw>`;
    return `<a:fmtScheme name="Office">
      <a:fillStyleLst>
        ${solid}
        <a:gradFill rotWithShape="1">
          <a:gsLst>
            <a:gs pos="0"><a:schemeClr val="phClr"><a:lumMod val="110000"/><a:satMod val="105000"/><a:tint val="67000"/></a:schemeClr></a:gs>
            <a:gs pos="50000"><a:schemeClr val="phClr"><a:lumMod val="105000"/><a:satMod val="103000"/><a:tint val="73000"/></a:schemeClr></a:gs>
            <a:gs pos="100000"><a:schemeClr val="phClr"><a:lumMod val="105000"/><a:satMod val="109000"/><a:tint val="81000"/></a:schemeClr></a:gs>
          </a:gsLst>
          <a:lin ang="5400000" scaled="0"/>
        </a:gradFill>
        <a:gradFill rotWithShape="1">
          <a:gsLst>
            <a:gs pos="0"><a:schemeClr val="phClr"><a:satMod val="103000"/><a:lumMod val="102000"/><a:tint val="94000"/></a:schemeClr></a:gs>
            <a:gs pos="50000"><a:schemeClr val="phClr"><a:satMod val="110000"/><a:lumMod val="100000"/><a:shade val="100000"/></a:schemeClr></a:gs>
            <a:gs pos="100000"><a:schemeClr val="phClr"><a:lumMod val="99000"/><a:satMod val="120000"/><a:shade val="78000"/></a:schemeClr></a:gs>
          </a:gsLst>
          <a:lin ang="5400000" scaled="0"/>
        </a:gradFill>
      </a:fillStyleLst>
      <a:lnStyleLst>
        ${ln(6350)}
        ${ln(12700)}
        ${ln(19050)}
      </a:lnStyleLst>
      <a:effectStyleLst>
        <a:effectStyle><a:effectLst/></a:effectStyle>
        <a:effectStyle><a:effectLst>${shadow}</a:effectLst></a:effectStyle>
        <a:effectStyle>
          <a:effectLst>${shadow}</a:effectLst>
          <a:scene3d>
            <a:camera prst="orthographicFront"><a:rot lat="0" lon="0" rev="0"/></a:camera>
            <a:lightRig rig="threePt" dir="t"><a:rot lat="0" lon="0" rev="1200000"/></a:lightRig>
          </a:scene3d>
          <a:sp3d><a:bevelT w="63500" h="25400"/></a:sp3d>
        </a:effectStyle>
      </a:effectStyleLst>
      <a:bgFillStyleLst>
        ${solid}
        <a:solidFill><a:schemeClr val="phClr"><a:tint val="95000"/><a:satMod val="170000"/></a:schemeClr></a:solidFill>
        <a:gradFill rotWithShape="1">
          <a:gsLst>
            <a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="93000"/><a:satMod val="150000"/><a:shade val="98000"/><a:lumMod val="102000"/></a:schemeClr></a:gs>
            <a:gs pos="50000"><a:schemeClr val="phClr"><a:tint val="98000"/><a:satMod val="130000"/><a:shade val="90000"/><a:lumMod val="103000"/></a:schemeClr></a:gs>
            <a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="63000"/><a:satMod val="120000"/></a:schemeClr></a:gs>
          </a:gsLst>
          <a:lin ang="5400000" scaled="0"/>
        </a:gradFill>
      </a:bgFillStyleLst>
    </a:fmtScheme>`;
}
/** 新建形状在 PowerPoint 里走的主题默认样式（缺了会落到黑框/无填充）。 */
export function objectDefaultsXml() {
    const style = (lnIdx, fillIdx, effectIdx, font, fontClr) => `<a:style><a:lnRef idx="${lnIdx}"><a:schemeClr val="accent1"/></a:lnRef><a:fillRef idx="${fillIdx}"><a:schemeClr val="accent1"/></a:fillRef><a:effectRef idx="${effectIdx}"><a:schemeClr val="accent1"/></a:effectRef><a:fontRef idx="${font}"><a:schemeClr val="${fontClr}"/></a:fontRef></a:style>`;
    return `<a:objectDefaults>
    <a:spDef><a:spPr/><a:bodyPr/><a:lstStyle/>${style(1, 3, 2, "minor", "lt1")}</a:spDef>
    <a:lnDef><a:spPr/><a:bodyPr/><a:lstStyle/>${style(2, 0, 1, "minor", "tx1")}</a:lnDef>
    <a:txDef><a:spPr/><a:bodyPr/><a:lstStyle/>${style(1, 0, 1, "minor", "tx1")}</a:txDef>
  </a:objectDefaults>`;
}
