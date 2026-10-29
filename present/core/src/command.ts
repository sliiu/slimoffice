import type { Presentation } from "./slide";

export interface EditCommand {
  readonly label: string;
  apply(pres: Presentation): void;
  revert(pres: Presentation): void;
}

export type CommandListener = (info: CommandStackInfo) => void;

/**
 * 栈上发生的一次历史动作。`execute/undo/redo` 是本地用户的动作（`undo/redo` 也覆盖
 * undoTo / redoTo / jumpTo 的每一步）；`external` 是协作方命令的 apply / revert，不进
 * 本地 undo 栈。协作层靠它把撤销 / 重做同步给其他人，且不会把远端命令再广播回去。
 */
export type CommandHistoryEvent =
  | { kind: "execute" | "undo" | "redo"; cmd: EditCommand }
  | { kind: "external"; cmd: EditCommand; direction: "apply" | "revert" };

export type CommandHistoryListener = (ev: CommandHistoryEvent) => void;

/** 多条命令折叠成的 undo 原子（见 CommandStack.coalesceSince）。 */
export class CoalescedCommand implements EditCommand {
  constructor(
    readonly label: string,
    readonly cmds: readonly EditCommand[],
  ) {}
  apply(pres: Presentation): void {
    for (const c of this.cmds) c.apply(pres);
  }
  revert(pres: Presentation): void {
    for (let i = this.cmds.length - 1; i >= 0; i--) this.cmds[i]!.revert(pres);
  }
}

export interface CommandStackInfo {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel?: string;
  redoLabel?: string;
}

/** 时间线上的一个节点：`mark` 是跳转后的 undo 栈深度（0 = 全部撤回）。 */
export interface CommandHistoryEntry {
  mark: number;
  label: string;
  current: boolean;
  /** 该节点及之前的命令当前已应用到文档。 */
  applied: boolean;
}

export class CommandStack {
  private undoStack: EditCommand[] = [];
  private redoStack: EditCommand[] = [];
  private listeners = new Set<CommandListener>();
  private historyListeners = new Set<CommandHistoryListener>();

  constructor(private pres: Presentation) {}

  execute(cmd: EditCommand): void {
    cmd.apply(this.pres);
    this.undoStack.push(cmd);
    this.redoStack = [];
    this.emitHistory({ kind: "execute", cmd });
    this.emit();
  }

  undo(): boolean {
    const cmd = this.undoStack.pop();
    if (!cmd) return false;
    cmd.revert(this.pres);
    this.redoStack.push(cmd);
    this.emitHistory({ kind: "undo", cmd });
    this.emit();
    return true;
  }

  redo(): boolean {
    const cmd = this.redoStack.pop();
    if (!cmd) return false;
    cmd.apply(this.pres);
    this.undoStack.push(cmd);
    this.emitHistory({ kind: "redo", cmd });
    this.emit();
    return true;
  }

  /**
   * 协作方的命令：直接作用到文档，不进本地 undo / redo 栈——撤销只撤自己的编辑，
   * 与 Google Slides / PowerPoint 联机协作一致。`direction: "revert"` 对应对方撤销。
   */
  applyExternal(cmd: EditCommand, direction: "apply" | "revert" = "apply"): void {
    if (direction === "apply") cmd.apply(this.pres);
    else cmd.revert(this.pres);
    this.emitHistory({ kind: "external", cmd, direction });
    this.emit();
  }

  /**
   * 当前 undo 栈深度。配合 {@link undoTo} 做"回到某个时刻"的轻量 mark：
   *   const mark = stack.size();
   *   // ... 一些 execute / undo / redo ...
   *   stack.undoTo(mark); // 撤回到 mark 时刻
   *
   * 注意：mark 是"undoStack 长度"，并非时间戳。如果在 mark 之后用户做了
   * undo 再 redo，undoStack 长度仍能复原；但如果中间穿插了新 execute，
   * 任何 redoStack 内容都会被清空（execute 的语义），mark 只能撤到"那时
   * 已经 commit 到 undoStack 上的位置"。调用方应理解这是"撤回近期变更"
   * 而非"回到精确历史快照"。
   */
  size(): number {
    return this.undoStack.length;
  }

  /**
   * 连续 undo 直到 undoStack.length === mark。
   * 返回实际撤回的次数（用于上层 UI 显示"撤回了 N 步"等）。
   * 如果 mark 已经 >= 当前 size，不做任何事。
   */
  undoTo(mark: number): number {
    let n = 0;
    while (this.undoStack.length > mark) {
      const cmd = this.undoStack.pop();
      if (!cmd) break;
      cmd.revert(this.pres);
      this.redoStack.push(cmd);
      this.emitHistory({ kind: "undo", cmd });
      n++;
    }
    if (n > 0) this.emit();
    return n;
  }

  /**
   * 连续 redo 直到 undoStack.length === mark。
   * mark 超出「undo + redo」总长时停在 redo 耗尽处。
   */
  redoTo(mark: number): number {
    let n = 0;
    while (this.undoStack.length < mark) {
      const cmd = this.redoStack.pop();
      if (!cmd) break;
      cmd.apply(this.pres);
      this.undoStack.push(cmd);
      this.emitHistory({ kind: "redo", cmd });
      n++;
    }
    if (n > 0) this.emit();
    return n;
  }

  /** 跳到指定历史节点：mark < size 则 undo，mark > size 则 redo。 */
  jumpTo(mark: number): number {
    const target = Math.max(0, mark);
    const size = this.undoStack.length;
    if (target < size) return this.undoTo(target);
    if (target > size) return this.redoTo(target);
    return 0;
  }

  /**
   * 完整时间线：初始状态 + 已应用命令 + 可重做命令。
   * `current` 落在 undo 栈顶（或 mark 0）。
   */
  history(originLabel = "Original"): CommandHistoryEntry[] {
    const size = this.undoStack.length;
    const out: CommandHistoryEntry[] = [
      { mark: 0, label: originLabel, current: size === 0, applied: true },
    ];
    for (let i = 0; i < this.undoStack.length; i++) {
      const mark = i + 1;
      out.push({
        mark,
        label: this.undoStack[i]!.label,
        current: mark === size,
        applied: true,
      });
    }
    for (let i = this.redoStack.length - 1; i >= 0; i--) {
      out.push({
        mark: size + (this.redoStack.length - i),
        label: this.redoStack[i]!.label,
        current: false,
        applied: false,
      });
    }
    return out;
  }

  /**
   * 把 mark（见 {@link size}）之后已入栈的命令合并成一个 undo 原子。
   *
   * 供"一个 AI 轮次 = 一条 undo 记录"的事务语义使用：调用方先记 mark，
   * 让每条命令正常走（可能被宿主包装过的）execute —— 保护检查 / 协作广播 /
   * 订阅者都能看到每一条 —— 轮次结束后再把它们折叠成一个原子。
   *
   * 命令都已 apply 过，合并只动 undoStack 结构，不触碰文档内容。
   * mark 越界或区间内 ≤1 条命令时不做任何事。返回被合并的命令数。
   */
  coalesceSince(mark: number, label: string): number {
    if (mark < 0 || mark >= this.undoStack.length) return 0;
    const count = this.undoStack.length - mark;
    if (count <= 1) return count;
    const cmds = this.undoStack.splice(mark, count);
    this.undoStack.push(new CoalescedCommand(label, cmds));
    this.emit();
    return count;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.emit();
  }

  /** 协作 / 外部同步：替换演示文稿引用并清空 undo 栈。 */
  replacePresentation(pres: Presentation): void {
    this.pres = pres;
    this.clear();
  }

  info(): CommandStackInfo {
    return {
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      undoLabel: this.undoStack.at(-1)?.label,
      redoLabel: this.redoStack.at(-1)?.label,
    };
  }

  subscribe(fn: CommandListener): () => void {
    this.listeners.add(fn);
    fn(this.info());
    return () => this.listeners.delete(fn);
  }

  /** 订阅逐条历史动作（execute / undo / redo / external）。 */
  subscribeHistory(fn: CommandHistoryListener): () => void {
    this.historyListeners.add(fn);
    return () => this.historyListeners.delete(fn);
  }

  private emitHistory(ev: CommandHistoryEvent): void {
    for (const fn of this.historyListeners) fn(ev);
  }

  private emit(): void {
    const info = this.info();
    for (const fn of this.listeners) fn(info);
  }
}
