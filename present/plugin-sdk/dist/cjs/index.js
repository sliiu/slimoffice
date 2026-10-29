"use strict";
// @sliiu/present-plugin-sdk —— PPT 播放器插件 SDK
//
// 零运行时依赖，可在浏览器（ESM/IIFE）和 Node（ESM/CJS）使用。
//
// 提供：
//   - 完整的 Plugin / PluginContext 类型
//   - definePlugin / composePlugins / withErrorBoundary 辅助
//   - createMockPluginContext —— Node 中单元测试插件用的桩
//
// 不提供：
//   - 任何 PPT 渲染、动画运行时（那是 @sliiu/present-player 的事）
//   - 任何对 OOXML 内部结构的直接访问（保证 ABI 稳定）
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
exports.SDK_VERSION = exports.createMockPluginContext = exports.withErrorBoundary = exports.composePlugins = exports.definePlugin = void 0;
__exportStar(require("./types"), exports);
var define_1 = require("./define");
Object.defineProperty(exports, "definePlugin", { enumerable: true, get: function () { return define_1.definePlugin; } });
Object.defineProperty(exports, "composePlugins", { enumerable: true, get: function () { return define_1.composePlugins; } });
Object.defineProperty(exports, "withErrorBoundary", { enumerable: true, get: function () { return define_1.withErrorBoundary; } });
var testing_1 = require("./testing");
Object.defineProperty(exports, "createMockPluginContext", { enumerable: true, get: function () { return testing_1.createMockPluginContext; } });
// SDK 版本号，方便检测使用了哪个版本。
// 0.2.0：新增 `ctx.scene`（shape 模型查询/命中测试/显隐/触发动画）与
//        `ctx.player.setNavigationLocked()`（交互期间锁定内置翻页/触发）。
exports.SDK_VERSION = "0.3.0";
