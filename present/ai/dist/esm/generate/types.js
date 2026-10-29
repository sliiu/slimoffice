// 生成流水线的公共类型：PipelineEvent 进度事件 + GenerateOptions + UsageMetrics。
import { defaultConfig } from "../config/types.js";
import { isConfigUsable } from "../config/presets.js";
/** 校验配置可用性；不可用时抛出面向用户的提示。 */
export function ensureConfig(config) {
    const c = config ?? defaultConfig();
    if (!isConfigUsable(c)) {
        throw new Error("AI is not configured. Open AI panel → Settings and fill in API key (and base URL if using custom provider).");
    }
    return c;
}
