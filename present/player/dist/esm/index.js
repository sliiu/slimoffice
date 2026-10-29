export { mount } from "./player.js";
// 3D bake runtime：editor 也复用它把 sp3d/scene3d 烘成 PNG（避免在 player 内被
// 重复实现 + 编辑视图丢 3D）。底层 walkShapes / dedupe 在 @sliiu/present-three-bake/runtime，
// 这里只做"绑 Scene + 触发 setProperty 让 backend redraw"的薄包装。
export { createBake3DRuntime } from "./bake-3d.js";
// 编辑器「预览切换」与放映共用同一套舞台裁切 + ghost 回收，避免两边效果不一致。
export { runTransition as runStageTransition } from "./transition.js";
export { buildHtml, buildHtmlBundle, bundleToZip } from "./export.js";
export { registerEmbeddedFonts, loadEmbeddedFonts } from "./fonts.js";
export { snapshotSlide, snapshotAll, snapshotsToZip, snapshotsToPdf, snapshotAllForPdf, exportPresentationPdf, snapshotPixelRatio, PDF_EXPORT_DPI, PDF_EXPORT_DPI_HIGH, SCREEN_DPI, } from "./snapshot.js";
export { slideSizeToPdfPoints, dataUrlsToPdf } from "./pdf.js";
export { buildStoredZip } from "./zip-store.js";
export { buildOoxmlPlayback } from "./ooxml-runtime.js";
// ---- Plugin API ----
// 推荐插件作者用 `@sliiu/present-plugin-sdk`；这里 re-export 主要是让 @sliiu/present-player 单包用户
// 也能直接拿到全部类型和 definePlugin。
export { definePlugin, composePlugins, withErrorBoundary } from "./define-plugin.js";
// ---- Builtin plugins ----
// 内置插件（白板、激光笔等）。宿主可以从 BUILTIN_PLUGINS 拿到完整可选清单
// 渲染选择 UI，或通过 pickBuiltinPlugins([...ids]) 按 id 取出。
export { BUILTIN_PLUGINS, pickBuiltinPlugins, whiteboardPlugin, laserPointerPlugin, outlinePlugin, notesPanelPlugin, thumbnailBarPlugin, screenshotPlugin, } from "./builtin/index.js";
// ---- i18n ----
// player 运行时文案（右键菜单 / 内置插件）。宿主可用 resolvePlayerLocale 归一 locale，
// 或用 createTranslator 复用同一套文案表。
export { createTranslator, resolvePlayerLocale, DEFAULT_PLAYER_LOCALE } from "./i18n.js";
