"use strict";
// 生成流水线的公共类型：PipelineEvent 进度事件 + GenerateOptions + UsageMetrics。
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureConfig = ensureConfig;
const types_1 = require("../config/types");
const presets_1 = require("../config/presets");
/** 校验配置可用性；不可用时抛出面向用户的提示。 */
function ensureConfig(config) {
    const c = config ?? (0, types_1.defaultConfig)();
    if (!(0, presets_1.isConfigUsable)(c)) {
        throw new Error("AI is not configured. Open AI panel → Settings and fill in API key (and base URL if using custom provider).");
    }
    return c;
}
