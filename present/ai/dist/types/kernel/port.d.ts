import { CommandStack, type EditCommand, type Presentation } from "@sliiu/present-core";
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
export declare function createEditorPort(opts: EditorPortOptions): DocumentPort;
/** Node / MCP server / 测试：内存 Presentation + 独立栈，无焦点无选区。 */
export declare function createHeadlessPort(pres: Presentation): DocumentPort;
