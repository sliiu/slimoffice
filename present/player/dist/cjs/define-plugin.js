"use strict";
// 历史 re-export。`definePlugin` 实际定义在 @sliiu/present-plugin-sdk；这里只是为了让
// `import { definePlugin } from "@sliiu/present-player"` 仍然有效（向后兼容）。
//
// 推荐新代码改从 @sliiu/present-plugin-sdk 直接 import —— SDK 无运行时依赖、bundle 更小、
// 可在 Node 中使用。
Object.defineProperty(exports, "__esModule", { value: true });
exports.withErrorBoundary = exports.composePlugins = exports.definePlugin = void 0;
var plugin_sdk_1 = require("@sliiu/present-plugin-sdk");
Object.defineProperty(exports, "definePlugin", { enumerable: true, get: function () { return plugin_sdk_1.definePlugin; } });
Object.defineProperty(exports, "composePlugins", { enumerable: true, get: function () { return plugin_sdk_1.composePlugins; } });
Object.defineProperty(exports, "withErrorBoundary", { enumerable: true, get: function () { return plugin_sdk_1.withErrorBoundary; } });
