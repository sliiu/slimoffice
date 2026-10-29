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

import { CommandStack, type EditCommand, type Presentation } from "@ppt/core";

export interface DocumentPort {
  /** 每次取最新引用 —— 应对 stack 替换 presentation 之后引用变化。 */
  getPres(): Presentation;
  /** 执行一条命令（走宿主可能包装过的 stack.execute）。 */
  execute(cmd: EditCommand): void;
  /**
   * 逐轮事务：fn 里 execute 的所有命令折叠为一个 undo 原子。
   * 支持嵌套（内层先折叠，外层再折叠成更大的原子）。
   */
  transaction<T>(label: string, fn: () => Promise<T> | T): Promise<T>;
  /**
   * 当前用户聚焦的 slide 索引列表（0-based）。单选 = 长度 1；缩略图多选 = 长度 N；
   * 空数组 = 无焦点。对话用它把"加一行字"默认作用到当前页。
   */
  getFocusedSlideIndices(): number[];
  /** 当前选中的 shape id 列表。 */
  getSelectedShapeIds(): string[];
  /** 通知宿主"文档变了"（工具执行后刷新缩略图 / inspector）。 */
  notifyMutated(): void;
  /** 订阅变更通知；返回取消函数。 */
  onMutated(listener: () => void): () => void;
  /**
   * 底层命令栈。宿主级功能（chat rewind 的 size/undoTo mark）用；
   * 工具实现一律走 execute / transaction，不要直接摸栈。
   */
  readonly stack: CommandStack;
}

/** 监听器集合 + transaction 的共享实现。 */
function makePortCore(getStack: () => CommandStack): Pick<
  DocumentPort,
  "execute" | "transaction" | "notifyMutated" | "onMutated"
> & { readonly stack: CommandStack } {
  const listeners = new Set<() => void>();
  return {
    get stack() {
      return getStack();
    },
    execute(cmd: EditCommand): void {
      getStack().execute(cmd);
    },
    async transaction<T>(label: string, fn: () => Promise<T> | T): Promise<T> {
      const stack = getStack();
      const mark = stack.size();
      try {
        return await fn();
      } finally {
        getStack().coalesceSince(mark, label);
      }
    },
    notifyMutated(): void {
      for (const fn of listeners) fn();
    },
    onMutated(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export interface EditorPortOptions {
  /** 最新 Presentation 引用（宿主的 state.pres）。 */
  getPres: () => Presentation;
  /**
   * 每次取编辑器 live CommandStack（mountEditor 包装过 execute 的那一个）。
   * 必须动态读取 —— openEditor 重挂载会新建栈，缓存旧引用会导致 AI 命令
   * 写入游离栈、画布不刷新。
   */
  getStack: () => CommandStack;
  getFocusedSlideIndices?: () => number[];
  getSelectedShapeIds?: () => string[];
}

/** 浏览器宿主：桥接编辑器命令栈。 */
export function createEditorPort(opts: EditorPortOptions): DocumentPort {
  const core = makePortCore(opts.getStack);
  return {
    ...core,
    getPres: opts.getPres,
    getFocusedSlideIndices: () => opts.getFocusedSlideIndices?.() ?? [],
    getSelectedShapeIds: () => opts.getSelectedShapeIds?.() ?? [],
  };
}

/** Node / MCP server / 测试：内存 Presentation + 独立栈，无焦点无选区。 */
export function createHeadlessPort(pres: Presentation): DocumentPort {
  const stack = new CommandStack(pres);
  const core = makePortCore(() => stack);
  return {
    ...core,
    getPres: () => pres,
    getFocusedSlideIndices: () => [],
    getSelectedShapeIds: () => [],
  };
}
