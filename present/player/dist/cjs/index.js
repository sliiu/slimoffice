"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_PLAYER_LOCALE = exports.resolvePlayerLocale = exports.createTranslator = exports.screenshotPlugin = exports.thumbnailBarPlugin = exports.notesPanelPlugin = exports.outlinePlugin = exports.laserPointerPlugin = exports.whiteboardPlugin = exports.pickBuiltinPlugins = exports.BUILTIN_PLUGINS = exports.withErrorBoundary = exports.composePlugins = exports.definePlugin = exports.buildOoxmlPlayback = exports.buildStoredZip = exports.dataUrlsToPdf = exports.slideSizeToPdfPoints = exports.SCREEN_DPI = exports.PDF_EXPORT_DPI_HIGH = exports.PDF_EXPORT_DPI = exports.snapshotPixelRatio = exports.exportPresentationPdf = exports.snapshotAllForPdf = exports.snapshotsToPdf = exports.snapshotsToZip = exports.snapshotAll = exports.snapshotSlide = exports.loadEmbeddedFonts = exports.registerEmbeddedFonts = exports.bundleToZip = exports.buildHtmlBundle = exports.buildHtml = exports.runStageTransition = exports.createBake3DRuntime = exports.mount = void 0;
var player_1 = require("./player");
Object.defineProperty(exports, "mount", { enumerable: true, get: function () { return player_1.mount; } });
// 3D bake runtime：editor 也复用它把 sp3d/scene3d 烘成 PNG（避免在 player 内被
// 重复实现 + 编辑视图丢 3D）。底层 walkShapes / dedupe 在 @sliiu/present-three-bake/runtime，
// 这里只做"绑 Scene + 触发 setProperty 让 backend redraw"的薄包装。
var bake_3d_1 = require("./bake-3d");
Object.defineProperty(exports, "createBake3DRuntime", { enumerable: true, get: function () { return bake_3d_1.createBake3DRuntime; } });
// 编辑器「预览切换」与放映共用同一套舞台裁切 + ghost 回收，避免两边效果不一致。
var transition_1 = require("./transition");
Object.defineProperty(exports, "runStageTransition", { enumerable: true, get: function () { return transition_1.runTransition; } });
var export_1 = require("./export");
Object.defineProperty(exports, "buildHtml", { enumerable: true, get: function () { return export_1.buildHtml; } });
Object.defineProperty(exports, "buildHtmlBundle", { enumerable: true, get: function () { return export_1.buildHtmlBundle; } });
Object.defineProperty(exports, "bundleToZip", { enumerable: true, get: function () { return export_1.bundleToZip; } });
var fonts_1 = require("./fonts");
Object.defineProperty(exports, "registerEmbeddedFonts", { enumerable: true, get: function () { return fonts_1.registerEmbeddedFonts; } });
Object.defineProperty(exports, "loadEmbeddedFonts", { enumerable: true, get: function () { return fonts_1.loadEmbeddedFonts; } });
var snapshot_1 = require("./snapshot");
Object.defineProperty(exports, "snapshotSlide", { enumerable: true, get: function () { return snapshot_1.snapshotSlide; } });
Object.defineProperty(exports, "snapshotAll", { enumerable: true, get: function () { return snapshot_1.snapshotAll; } });
Object.defineProperty(exports, "snapshotsToZip", { enumerable: true, get: function () { return snapshot_1.snapshotsToZip; } });
Object.defineProperty(exports, "snapshotsToPdf", { enumerable: true, get: function () { return snapshot_1.snapshotsToPdf; } });
Object.defineProperty(exports, "snapshotAllForPdf", { enumerable: true, get: function () { return snapshot_1.snapshotAllForPdf; } });
Object.defineProperty(exports, "exportPresentationPdf", { enumerable: true, get: function () { return snapshot_1.exportPresentationPdf; } });
Object.defineProperty(exports, "snapshotPixelRatio", { enumerable: true, get: function () { return snapshot_1.snapshotPixelRatio; } });
Object.defineProperty(exports, "PDF_EXPORT_DPI", { enumerable: true, get: function () { return snapshot_1.PDF_EXPORT_DPI; } });
Object.defineProperty(exports, "PDF_EXPORT_DPI_HIGH", { enumerable: true, get: function () { return snapshot_1.PDF_EXPORT_DPI_HIGH; } });
Object.defineProperty(exports, "SCREEN_DPI", { enumerable: true, get: function () { return snapshot_1.SCREEN_DPI; } });
var pdf_1 = require("./pdf");
Object.defineProperty(exports, "slideSizeToPdfPoints", { enumerable: true, get: function () { return pdf_1.slideSizeToPdfPoints; } });
Object.defineProperty(exports, "dataUrlsToPdf", { enumerable: true, get: function () { return pdf_1.dataUrlsToPdf; } });
var zip_store_1 = require("./zip-store");
Object.defineProperty(exports, "buildStoredZip", { enumerable: true, get: function () { return zip_store_1.buildStoredZip; } });
var ooxml_runtime_1 = require("./ooxml-runtime");
Object.defineProperty(exports, "buildOoxmlPlayback", { enumerable: true, get: function () { return ooxml_runtime_1.buildOoxmlPlayback; } });
// ---- Plugin API ----
// 推荐插件作者用 `@sliiu/present-plugin-sdk`；这里 re-export 主要是让 @sliiu/present-player 单包用户
// 也能直接拿到全部类型和 definePlugin。
var define_plugin_1 = require("./define-plugin");
Object.defineProperty(exports, "definePlugin", { enumerable: true, get: function () { return define_plugin_1.definePlugin; } });
Object.defineProperty(exports, "composePlugins", { enumerable: true, get: function () { return define_plugin_1.composePlugins; } });
Object.defineProperty(exports, "withErrorBoundary", { enumerable: true, get: function () { return define_plugin_1.withErrorBoundary; } });
// ---- Builtin plugins ----
// 内置插件（白板、激光笔等）。宿主可以从 BUILTIN_PLUGINS 拿到完整可选清单
// 渲染选择 UI，或通过 pickBuiltinPlugins([...ids]) 按 id 取出。
var builtin_1 = require("./builtin");
Object.defineProperty(exports, "BUILTIN_PLUGINS", { enumerable: true, get: function () { return builtin_1.BUILTIN_PLUGINS; } });
Object.defineProperty(exports, "pickBuiltinPlugins", { enumerable: true, get: function () { return builtin_1.pickBuiltinPlugins; } });
Object.defineProperty(exports, "whiteboardPlugin", { enumerable: true, get: function () { return builtin_1.whiteboardPlugin; } });
Object.defineProperty(exports, "laserPointerPlugin", { enumerable: true, get: function () { return builtin_1.laserPointerPlugin; } });
Object.defineProperty(exports, "outlinePlugin", { enumerable: true, get: function () { return builtin_1.outlinePlugin; } });
Object.defineProperty(exports, "notesPanelPlugin", { enumerable: true, get: function () { return builtin_1.notesPanelPlugin; } });
Object.defineProperty(exports, "thumbnailBarPlugin", { enumerable: true, get: function () { return builtin_1.thumbnailBarPlugin; } });
Object.defineProperty(exports, "screenshotPlugin", { enumerable: true, get: function () { return builtin_1.screenshotPlugin; } });
// ---- i18n ----
// player 运行时文案（右键菜单 / 内置插件）。宿主可用 resolvePlayerLocale 归一 locale，
// 或用 createTranslator 复用同一套文案表。
var i18n_1 = require("./i18n");
Object.defineProperty(exports, "createTranslator", { enumerable: true, get: function () { return i18n_1.createTranslator; } });
Object.defineProperty(exports, "resolvePlayerLocale", { enumerable: true, get: function () { return i18n_1.resolvePlayerLocale; } });
Object.defineProperty(exports, "DEFAULT_PLAYER_LOCALE", { enumerable: true, get: function () { return i18n_1.DEFAULT_PLAYER_LOCALE; } });
