// @sliiu/present-editor/commands —— DOM-free 命令层入口。
//
// 供 @sliiu/present-ai（浏览器对话 + Node MCP server）使用：只暴露 EditCommand 类、
// shape 工厂与动画 timing 纯函数，不拉编辑器 UI（dialog / toolbar / i18n /
// CSS 导入）。主入口 "@sliiu/present-editor" 在 Node 下无法加载（equation-dialog 等
// 会 import CSS），任何需要在 Node 运行的消费方都必须走本入口。
//
// ⚠️ 往这里加 re-export 前确认目标模块 DOM-free（不 import CSS / document /
// window / i18n），否则 MCP server 会在启动时崩溃。
export * from "./commands.js";
export * from "./slide-commands.js";
export * from "./master-commands.js";
export * from "./animation/commands.js";
export { buildEffectList, ensureTiming, insertEffect } from "./animation/store.js";
export * from "./shape-factory.js";
export { SHAPE_LIBRARY } from "./shape-library.js";
export * from "./ole-cmd.js";
export * from "./model3d-cmd.js";
export * from "./web-embed-cmd.js";
export * from "./comment-commands.js";
export * from "./smartart-commands.js";
export * from "./ink-commands.js";
export * from "./section-commands.js";
export * from "./view-show-commands.js";
export * from "./slide-layout-commands.js";
export * from "./theme-variant-cmd.js";
export * from "./proofing-language-cmd.js";
export * from "./photo-album-cmd.js";
export * from "./embed-fonts-cmd.js";
export * from "./protection-cmd.js";
export { fetchGoogleFontBytes, fetchPresetFontDataUrl, setGoogleFontProxyBase } from "./font-embed-fetch.js";
export { encodeIconDescr, decodeIconDescr } from "./icon-descr.js";
export { lucideIconSvgDataUrl, lucideIconToPngDataUrl } from "./lucide-export.js";
export { ZERO_CROP, cropHost, imageFrame, readCrop, setCropEdge, } from "./crop-frame.js";
export { WORDART_PRESETS, defaultWordArtState, PRESET_FONT_DEFAULT, } from "./word-art-presets.js";
