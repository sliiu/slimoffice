// DocumentPort：AI 改动 PPT 的唯一入口（统一 PPT 调用链）。
//
// v2 设计动机：
//   v1 的调用链是分裂的 —— 对话工具走宿主注入的 CommandStack（可撤销），
//   生成路径直接改内存 Presentation（不可撤销、绕过协作与缩略图刷新契约）。
//   DocumentPort 把"读文档 / 执行命令 / 逐轮事务 / 焦点选区 / 变更通知"收敛成
//   一个接口，工具层与生成后处理只面向它编程。
//
// 两个实现：
//   - createEditorPort  → 浏览器宿主，桥接编辑器的 live CommandStack。
//     注意：mountEditor 会在栈实例上包装 execute（保护检查 / 插件通知 / 协作
//     广播），port 必须调用包装后的方法，绝不能绕过。
//   - createHeadlessPort → Node / MCP server / 测试，内存 Presentation + 独立栈。
//
// 事务语义（transaction）：
//   一个 AI 轮次内执行的所有命令合并成一个 undo 原子（CommandStack.coalesceSince）。
//   每条命令仍逐条走 execute —— 宿主的包装逻辑对每条可见 —— 只在轮次结束后
//   折叠 undo 栈结构。事务不做原子回滚：轮次中途失败时已成功的改动保留
//   （对话场景中模型会在下一步自行修正，回滚反而丢工作）。
import { CommandStack } from "@sliiu/present-core";
/** 监听器集合 + transaction 的共享实现。 */
function makePortCore(getStack) {
    const listeners = new Set();
    return {
        get stack() {
            return getStack();
        },
        execute(cmd) {
            getStack().execute(cmd);
        },
        async transaction(label, fn) {
            const stack = getStack();
            const mark = stack.size();
            try {
                return await fn();
            }
            finally {
                getStack().coalesceSince(mark, label);
            }
        },
        notifyMutated() {
            for (const fn of listeners)
                fn();
        },
        onMutated(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
}
/** 浏览器宿主：桥接编辑器命令栈。 */
export function createEditorPort(opts) {
    const core = makePortCore(opts.getStack);
    return {
        ...core,
        getPres: opts.getPres,
        getFocusedSlideIndices: () => opts.getFocusedSlideIndices?.() ?? [],
        getSelectedShapeIds: () => opts.getSelectedShapeIds?.() ?? [],
    };
}
/** Node / MCP server / 测试：内存 Presentation + 独立栈，无焦点无选区。 */
export function createHeadlessPort(pres) {
    const stack = new CommandStack(pres);
    const core = makePortCore(() => stack);
    return {
        ...core,
        getPres: () => pres,
        getFocusedSlideIndices: () => [],
        getSelectedShapeIds: () => [],
    };
}
