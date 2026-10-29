// @ppt/editor/commands —— DOM-free 命令层入口。
//
// 供 @ppt/ai（浏览器对话 + Node MCP server）使用：只暴露 EditCommand 类、
// shape 工厂与动画 timing 纯函数，不拉编辑器 UI（dialog / toolbar / i18n /
// CSS 导入）。主入口 "@ppt/editor" 在 Node 下无法加载（equation-dialog 等
// 会 import CSS），任何需要在 Node 运行的消费方都必须走本入口。
//
// ⚠️ 往这里加 re-export 前确认目标模块 DOM-free（不 import CSS / document /
// window / i18n），否则 MCP server 会在启动时崩溃。

export * from "./commands";
export * from "./slide-commands";
export * from "./master-commands";
export * from "./animation/commands";
export { buildEffectList, ensureTiming, insertEffect } from "./animation/store";
export type { Effect, EffectClass, EffectPath, InsertEffectArgs } from "./animation/store";
export * from "./shape-factory";
export { SHAPE_LIBRARY } from "./shape-library";
export * from "./ole-cmd";
export * from "./model3d-cmd";
export * from "./web-embed-cmd";
export * from "./comment-commands";
export * from "./smartart-commands";
export * from "./ink-commands";
export * from "./section-commands";
export * from "./view-show-commands";
export * from "./slide-layout-commands";
export * from "./theme-variant-cmd";
export * from "./proofing-language-cmd";
export * from "./photo-album-cmd";
export * from "./embed-fonts-cmd";
export * from "./protection-cmd";
export { fetchGoogleFontBytes, fetchPresetFontDataUrl, setGoogleFontProxyBase } from "./font-embed-fetch";
export { encodeIconDescr, decodeIconDescr } from "./icon-descr";
export { lucideIconSvgDataUrl, lucideIconToPngDataUrl } from "./lucide-export";
export {
  ZERO_CROP,
  cropHost,
  imageFrame,
  readCrop,
  setCropEdge,
  type CropInsets,
} from "./crop-frame";
export {
  WORDART_PRESETS,
  defaultWordArtState,
  PRESET_FONT_DEFAULT,
  type WordArtGradient,
  type WordArtPreset,
  type WordArtShadowKind,
  type WordArtState,
} from "./word-art-presets";
