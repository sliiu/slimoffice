"use strict";
// 用户 skill 携带的自定义 deckgen VisualSystem —— 把 ```visual-system JSON 块变成运行时注册表条目。
//
// 与 style-families.ts 同心智，但作用面不同：styleFamily 只影响 outline / design-spec 的提示词枚举；
// visual system 决定 canvas 作者路径的排版比例 / 网格 / 圆角阴影策略 / 字体 / 种子色，
// 是 deckgen 编译器真正消费的对象（resolveVisualSystem）。
//
// 合并规则：
//   - 只从 **enabled** 且 stage=generate|both 的 skill 收集；
//   - 同 id 多 skill 声明时后者覆盖（按 listSkills 顺序，user 在 builtin 之后 → user 赢）；
//   - 不得覆盖内置 CANVAS_SYSTEM_IDS（parse 阶段已拒绝）；
//   - `listSkills(host)` 每次被调用都会重新同步注册表 —— 关掉 / 删除 skill 即撤销其系统。
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveCustomVisualSystems = resolveCustomVisualSystems;
exports.syncCustomVisualSystems = syncCustomVisualSystems;
exports.stripVisualSystemBlocks = stripVisualSystemBlocks;
const custom_system_1 = require("../deckgen/custom-system");
const visual_system_1 = require("../deckgen/visual-system");
/** Build registry entries from the enabled, generate-affecting skills. */
function resolveCustomVisualSystems(skills) {
    const byId = new Map();
    for (const s of skills) {
        if (!s.enabled)
            continue;
        if (s.stage !== "generate" && s.stage !== "both")
            continue;
        for (const def of s.visualSystems ?? []) {
            try {
                byId.set(def.id, (0, custom_system_1.buildCustomVisualSystem)(def, s.id));
            }
            catch (e) {
                console.warn(`[skills] visual system "${def.id}" from "${s.id}" could not be built`, e);
            }
        }
    }
    return [...byId.values()];
}
/** Replace the session registry with what the given skill views declare. */
function syncCustomVisualSystems(skills) {
    const entries = resolveCustomVisualSystems(skills);
    (0, visual_system_1.registerCustomVisualSystems)(entries);
    return entries;
}
/** The JSON blocks must not reach the prompt; the prose around them does. */
function stripVisualSystemBlocks(body) {
    return body
        .replace(/```([^\n]*)\n[\s\S]*?```/g, (whole, info) => (/\bvisual[-_ ]?system\b/i.test(info) ? "" : whole))
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}
