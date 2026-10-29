"use strict";
// @sliiu/present-editor/commands —— DOM-free 命令层入口。
//
// 供 @sliiu/present-ai（浏览器对话 + Node MCP server）使用：只暴露 EditCommand 类、
// shape 工厂与动画 timing 纯函数，不拉编辑器 UI（dialog / toolbar / i18n /
// CSS 导入）。主入口 "@sliiu/present-editor" 在 Node 下无法加载（equation-dialog 等
// 会 import CSS），任何需要在 Node 运行的消费方都必须走本入口。
//
// ⚠️ 往这里加 re-export 前确认目标模块 DOM-free（不 import CSS / document /
// window / i18n），否则 MCP server 会在启动时崩溃。
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PRESET_FONT_DEFAULT = exports.defaultWordArtState = exports.WORDART_PRESETS = exports.setCropEdge = exports.readCrop = exports.imageFrame = exports.cropHost = exports.ZERO_CROP = exports.lucideIconToPngDataUrl = exports.lucideIconSvgDataUrl = exports.decodeIconDescr = exports.encodeIconDescr = exports.setGoogleFontProxyBase = exports.fetchPresetFontDataUrl = exports.fetchGoogleFontBytes = exports.SHAPE_LIBRARY = exports.insertEffect = exports.ensureTiming = exports.buildEffectList = void 0;
__exportStar(require("./commands"), exports);
__exportStar(require("./slide-commands"), exports);
__exportStar(require("./master-commands"), exports);
__exportStar(require("./animation/commands"), exports);
var store_1 = require("./animation/store");
Object.defineProperty(exports, "buildEffectList", { enumerable: true, get: function () { return store_1.buildEffectList; } });
Object.defineProperty(exports, "ensureTiming", { enumerable: true, get: function () { return store_1.ensureTiming; } });
Object.defineProperty(exports, "insertEffect", { enumerable: true, get: function () { return store_1.insertEffect; } });
__exportStar(require("./shape-factory"), exports);
var shape_library_1 = require("./shape-library");
Object.defineProperty(exports, "SHAPE_LIBRARY", { enumerable: true, get: function () { return shape_library_1.SHAPE_LIBRARY; } });
__exportStar(require("./ole-cmd"), exports);
__exportStar(require("./model3d-cmd"), exports);
__exportStar(require("./web-embed-cmd"), exports);
__exportStar(require("./comment-commands"), exports);
__exportStar(require("./smartart-commands"), exports);
__exportStar(require("./ink-commands"), exports);
__exportStar(require("./section-commands"), exports);
__exportStar(require("./view-show-commands"), exports);
__exportStar(require("./slide-layout-commands"), exports);
__exportStar(require("./theme-variant-cmd"), exports);
__exportStar(require("./proofing-language-cmd"), exports);
__exportStar(require("./photo-album-cmd"), exports);
__exportStar(require("./embed-fonts-cmd"), exports);
__exportStar(require("./protection-cmd"), exports);
var font_embed_fetch_1 = require("./font-embed-fetch");
Object.defineProperty(exports, "fetchGoogleFontBytes", { enumerable: true, get: function () { return font_embed_fetch_1.fetchGoogleFontBytes; } });
Object.defineProperty(exports, "fetchPresetFontDataUrl", { enumerable: true, get: function () { return font_embed_fetch_1.fetchPresetFontDataUrl; } });
Object.defineProperty(exports, "setGoogleFontProxyBase", { enumerable: true, get: function () { return font_embed_fetch_1.setGoogleFontProxyBase; } });
var icon_descr_1 = require("./icon-descr");
Object.defineProperty(exports, "encodeIconDescr", { enumerable: true, get: function () { return icon_descr_1.encodeIconDescr; } });
Object.defineProperty(exports, "decodeIconDescr", { enumerable: true, get: function () { return icon_descr_1.decodeIconDescr; } });
var lucide_export_1 = require("./lucide-export");
Object.defineProperty(exports, "lucideIconSvgDataUrl", { enumerable: true, get: function () { return lucide_export_1.lucideIconSvgDataUrl; } });
Object.defineProperty(exports, "lucideIconToPngDataUrl", { enumerable: true, get: function () { return lucide_export_1.lucideIconToPngDataUrl; } });
var crop_frame_1 = require("./crop-frame");
Object.defineProperty(exports, "ZERO_CROP", { enumerable: true, get: function () { return crop_frame_1.ZERO_CROP; } });
Object.defineProperty(exports, "cropHost", { enumerable: true, get: function () { return crop_frame_1.cropHost; } });
Object.defineProperty(exports, "imageFrame", { enumerable: true, get: function () { return crop_frame_1.imageFrame; } });
Object.defineProperty(exports, "readCrop", { enumerable: true, get: function () { return crop_frame_1.readCrop; } });
Object.defineProperty(exports, "setCropEdge", { enumerable: true, get: function () { return crop_frame_1.setCropEdge; } });
var word_art_presets_1 = require("./word-art-presets");
Object.defineProperty(exports, "WORDART_PRESETS", { enumerable: true, get: function () { return word_art_presets_1.WORDART_PRESETS; } });
Object.defineProperty(exports, "defaultWordArtState", { enumerable: true, get: function () { return word_art_presets_1.defaultWordArtState; } });
Object.defineProperty(exports, "PRESET_FONT_DEFAULT", { enumerable: true, get: function () { return word_art_presets_1.PRESET_FONT_DEFAULT; } });
