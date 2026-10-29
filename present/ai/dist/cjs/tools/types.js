"use strict";
// 工具层类型：中立 ToolDef + ToolRuntime。
//
// v2 核心设计 —— 每个工具只定义一次，两个消费方：
//   - 对话循环：adapters/vercel.ts 把 ToolDef 包成 Vercel AI SDK `Tool`
//   - MCP server：mcp/server 把 ToolDef 注册成 MCP tool（对外暴露 PPT 编辑能力）
//
// ToolDef 与任何 LLM SDK 解耦：inputSchema 是 zod、execute 是普通函数，
// 可直接单测。所有对文档的改动通过 rt.apply(cmd)（内部走 DocumentPort），
// 保证 undo / 协作 / 缩略图刷新契约在两个消费方下一致。
//
// 约定（继承 v1，.cursor/rules/ppt-design-rules.mdc 依赖）：
//   1. mutation 工具的 description 必须提示联动后果（如换背景后查文字对比度）；
//   2. 返回值统一 { ok: true, ... } / { ok: false, error }，失败时给模型明确诊断；
//   3. 定位既有 shape 的工具设 shapeScoped: true —— 适配器自动套 [TURN SCOPE]
//      守卫（见 guard.ts），新工具在定义处声明，不再维护中心名单。
Object.defineProperty(exports, "__esModule", { value: true });
exports.ok = ok;
exports.err = err;
exports.createToolRuntime = createToolRuntime;
exports.defineTool = defineTool;
const core_1 = require("@sliiu/present-core");
function ok(extra = {}) {
    return { ok: true, ...extra };
}
function err(msg) {
    return { ok: false, error: msg };
}
function createToolRuntime(opts) {
    return {
        port: opts.port,
        getConfig: opts.getConfig,
        getPres: () => opts.port.getPres(),
        apply: (cmd) => {
            try {
                if (!(0, core_1.canApplyEditCommand)(opts.port.getPres(), cmd)) {
                    return err("Presentation is protected (editing blocked). Call unprotectPresentation first (password required if listProtectionStatus.passwordRequired is true).");
                }
                opts.port.execute(cmd);
                return ok();
            }
            catch (e) {
                return err(e.message);
            }
        },
        presentationId: opts.presentationId,
        hostChatStore: opts.hostChatStore,
        hostSkillStore: opts.hostSkillStore,
        onCapabilityChanged: opts.onCapabilityChanged,
        setMcpSessionOverride: opts.setMcpSessionOverride,
        getMcpSessionOverride: opts.getMcpSessionOverride,
        onOpenSettings: opts.onOpenSettings,
    };
}
/** 定义工具的工厂 —— 只为类型推断（In 从 schema 推出），无运行时逻辑。 */
function defineTool(def) {
    return def;
}
