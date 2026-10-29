// ToolDef → Vercel AI SDK Tool 适配器（对话循环消费）。
//
// 职责：
//   1. 绑定 ToolRuntime（closure 注入）；
//   2. shapeScoped 工具自动套 [TURN SCOPE] 选区守卫；
//   3. mutate 工具执行成功后触发 port.notifyMutated()（宿主刷新缩略图）；
//   4. execute 抛错折成 { ok:false, error } —— 模型拿到诊断自行重试，
//      不让一次工具异常打断整个流。
import { tool } from "ai";
import { assertShapeInScope, extractShapeTarget } from "../guard.js";
export function toVercelTool(def, rt) {
    return tool({
        description: def.description,
        inputSchema: def.inputSchema,
        execute: async (input) => {
            if (def.shapeScoped) {
                const violation = assertShapeInScope(rt.port, extractShapeTarget(input));
                if (violation)
                    return violation;
            }
            try {
                const result = await def.execute(rt, input);
                if (def.tags.includes("mutate"))
                    rt.port.notifyMutated();
                return result;
            }
            catch (e) {
                return { ok: false, error: e.message ?? String(e) };
            }
        },
    });
}
export function toVercelTools(defs, rt) {
    const out = {};
    for (const def of defs)
        out[def.name] = toVercelTool(def, rt);
    return out;
}
