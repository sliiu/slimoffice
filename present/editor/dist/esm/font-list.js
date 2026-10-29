import { bindCombobox } from "@sliiu/present-ui";
// 编辑器公用的"常见字体清单"。
//
// 用途：
//   - ribbon / inspector / dialog 字体 combobox 候选项；
//   - 选择上覆盖三类常用情形：
//       1) Windows / Microsoft 系列（与 PowerPoint 默认环境对齐，确保 round-trip 字体名一致）；
//       2) macOS 系列（设计常用 + 系统中文字体）；
//       3) 中文字体（PingFang / 微软雅黑 / 宋体 / 黑体 等）。
//
// 设计原则：
//   - 只放"PowerPoint 默认能识别的字体名"（OOXML 写入的就是字体名字符串本身）。
//   - 全部用英文 family name；中文字体保留中文别名（PowerPoint 在 zh-CN 环境下也认）。
//   - 不内嵌字体文件，仅作为下拉候选 —— 实际渲染仍由浏览器解析系统字体。
export const FONT_FAMILIES = [
    // ── Windows 经典
    "Arial",
    "Arial Black",
    "Calibri",
    "Cambria",
    "Candara",
    "Comic Sans MS",
    "Consolas",
    "Corbel",
    "Courier New",
    "Franklin Gothic",
    "Garamond",
    "Georgia",
    "Helvetica",
    "Impact",
    "Lucida Console",
    "Lucida Sans Unicode",
    "Palatino Linotype",
    "Segoe UI",
    "Tahoma",
    "Times New Roman",
    "Trebuchet MS",
    "Verdana",
    // ── macOS / 通用
    "PingFang SC",
    "PingFang TC",
    "Hiragino Sans GB",
    "Hiragino Sans",
    "San Francisco",
    "SF Pro Display",
    "SF Pro Text",
    "Menlo",
    "Monaco",
    "Optima",
    "Avenir",
    "Avenir Next",
    "Futura",
    // ── 中文字体（PowerPoint 中文环境默认可识别）
    "微软雅黑",
    "Microsoft YaHei",
    "Microsoft JhengHei",
    "宋体",
    "SimSun",
    "新宋体",
    "NSimSun",
    "黑体",
    "SimHei",
    "仿宋",
    "FangSong",
    "楷体",
    "KaiTi",
    "华文细黑",
    "STHeiti Light",
    "华文黑体",
    "STHeiti",
    "华文楷体",
    "STKaiti",
    "华文宋体",
    "STSong",
    "华文仿宋",
    "STFangsong",
    "苹方",
    // ── Google / Web 安全
    "Roboto",
    "Open Sans",
    "Lato",
    "Montserrat",
    "Source Sans Pro",
    "Noto Sans",
    "Noto Sans SC",
    "Noto Serif",
    "Noto Serif SC",
    "Inter",
];
export function bindFontFamilyCombobox(input, onChange) {
    return bindCombobox(input, {
        options: [...FONT_FAMILIES],
        onChange,
        optionStyle: (item) => `font-family:${JSON.stringify(item.value)}`,
    });
}
