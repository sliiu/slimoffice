"use strict";
// 阶段 A2 数据：从 samples/*.pptx 提取的真实 OOXML preset 子树。
// 来源：scripts/extract-preset-templates.mjs；每个 (presetClass, presetID, subtype) 取首次出现。
//
// 字段：{ entr|exit|emph|path: { "<id>[.<subtype>]": TimeNode } }
// 所有 spid 已被替换为占位符 "$tgt"；展开时由 expandPresetTemplate 替换为真实 spid。
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXTRACTED_PRESETS = void 0;
const extracted_json_1 = __importDefault(require("./extracted.json"));
exports.EXTRACTED_PRESETS = extracted_json_1.default;
