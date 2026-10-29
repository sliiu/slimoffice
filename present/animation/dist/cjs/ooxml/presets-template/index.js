"use strict";
// 阶段 A：preset OOXML 子树模板表 + 展开器。
// 公开 API 给 compile 路径接入，逐步替换 presets/ 下的近似 keyframe 实现。
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerPresetTemplate = exports.listPresetTemplates = exports.hasPresetTemplate = exports.findPresetTemplate = exports.subtypeKind = exports.deriveSubtypeVariant = exports.derivableSubtypes = exports.presetTemplateSubtypes = exports.presetTemplateSubtypeKind = exports.expandPresetTemplate = void 0;
var expand_1 = require("./expand");
Object.defineProperty(exports, "expandPresetTemplate", { enumerable: true, get: function () { return expand_1.expandPresetTemplate; } });
Object.defineProperty(exports, "presetTemplateSubtypeKind", { enumerable: true, get: function () { return expand_1.presetTemplateSubtypeKind; } });
Object.defineProperty(exports, "presetTemplateSubtypes", { enumerable: true, get: function () { return expand_1.presetTemplateSubtypes; } });
var derive_1 = require("./derive");
Object.defineProperty(exports, "derivableSubtypes", { enumerable: true, get: function () { return derive_1.derivableSubtypes; } });
Object.defineProperty(exports, "deriveSubtypeVariant", { enumerable: true, get: function () { return derive_1.deriveSubtypeVariant; } });
Object.defineProperty(exports, "subtypeKind", { enumerable: true, get: function () { return derive_1.subtypeKind; } });
var registry_1 = require("./registry");
Object.defineProperty(exports, "findPresetTemplate", { enumerable: true, get: function () { return registry_1.findPresetTemplate; } });
Object.defineProperty(exports, "hasPresetTemplate", { enumerable: true, get: function () { return registry_1.hasPresetTemplate; } });
Object.defineProperty(exports, "listPresetTemplates", { enumerable: true, get: function () { return registry_1.listPresetTemplates; } });
Object.defineProperty(exports, "registerPresetTemplate", { enumerable: true, get: function () { return registry_1.registerPresetTemplate; } });
