import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CoalescedCommand, CommandStack, type CommandHistoryEvent, type EditCommand } from "./command";
import type { Presentation } from "./slide";

function pres(): Presentation & { n: number } {
  return { n: 0 } as unknown as Presentation & { n: number };
}

function add(k: number): EditCommand {
  return {
    label: `add ${k}`,
    apply: (p) => {
      (p as unknown as { n: number }).n += k;
    },
    revert: (p) => {
      (p as unknown as { n: number }).n -= k;
    },
  };
}

describe("CommandStack history events", () => {
  it("reports execute / undo / redo with the command instance", () => {
    const p = pres();
    const stack = new CommandStack(p);
    const seen: string[] = [];
    stack.subscribeHistory((ev) => seen.push(`${ev.kind}:${ev.cmd.label}`));
    const a = add(1);
    stack.execute(a);
    stack.undo();
    stack.redo();
    assert.deepEqual(seen, ["execute:add 1", "undo:add 1", "redo:add 1"]);
    assert.equal(p.n, 1);
  });

  it("emits one undo / redo event per step for undoTo / redoTo / jumpTo", () => {
    const p = pres();
    const stack = new CommandStack(p);
    const seen: CommandHistoryEvent[] = [];
    stack.subscribeHistory((ev) => seen.push(ev));
    stack.execute(add(1));
    stack.execute(add(2));
    stack.execute(add(4));
    seen.length = 0;
    assert.equal(stack.undoTo(1), 2);
    assert.deepEqual(seen.map((e) => `${e.kind}:${e.cmd.label}`), ["undo:add 4", "undo:add 2"]);
    seen.length = 0;
    assert.equal(stack.jumpTo(3), 2);
    assert.deepEqual(seen.map((e) => `${e.kind}:${e.cmd.label}`), ["redo:add 2", "redo:add 4"]);
    assert.equal(p.n, 7);
  });

  it("applyExternal changes the document without touching undo / redo", () => {
    const p = pres();
    const stack = new CommandStack(p);
    const seen: CommandHistoryEvent[] = [];
    stack.subscribeHistory((ev) => seen.push(ev));
    stack.execute(add(1));
    const remote = add(10);
    stack.applyExternal(remote);
    assert.equal(p.n, 11);
    assert.equal(stack.size(), 1);
    assert.equal(stack.info().canRedo, false);
    // 本地撤销只撤自己的命令；对方的编辑保留。
    assert.equal(stack.undo(), true);
    assert.equal(p.n, 10);
    stack.applyExternal(remote, "revert");
    assert.equal(p.n, 0);
    const ext = seen.filter((e) => e.kind === "external");
    assert.equal(ext.length, 2);
    assert.deepEqual(ext.map((e) => (e.kind === "external" ? e.direction : "")), ["apply", "revert"]);
  });

  it("exposes coalesced children so collaboration can address each broadcast command", () => {
    const p = pres();
    const stack = new CommandStack(p);
    const mark = stack.size();
    const a = add(1);
    const b = add(2);
    stack.execute(a);
    stack.execute(b);
    stack.coalesceSince(mark, "AI turn");
    const seen: EditCommand[] = [];
    stack.subscribeHistory((ev) => seen.push(ev.cmd));
    stack.undo();
    assert.equal(seen.length, 1);
    const top = seen[0]!;
    assert.ok(top instanceof CoalescedCommand);
    assert.deepEqual(top.cmds, [a, b]);
    assert.equal(p.n, 0);
  });
});
