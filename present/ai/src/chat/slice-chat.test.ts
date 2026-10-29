import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sliceChatThroughTurn, type ChatLogEntry } from "./engine.js";

function msg(role: string, text: string): { role: string; text: string } {
  return { role, text };
}

describe("sliceChatThroughTurn", () => {
  const messages = [
    msg("user", "总结"),
    msg("assistant", "第一段"),
    msg("tool", "list"),
    msg("user", "再短一点"),
    msg("assistant", "第二段"),
  ];
  const log: ChatLogEntry[] = [
    { role: "user", text: "总结" },
    { role: "assistant", text: "" },
    { role: "tool", text: "list", toolName: "listShapesOnSlide" },
    { role: "assistant", text: "第一段", finishedAt: 1_700_000_000_000 },
    { role: "user", text: "再短一点" },
    { role: "assistant", text: "第二段", finishedAt: 1_700_000_100_000 },
  ];

  it("keeps the first turn, including tool rows, and drops the later user", () => {
    const sliced = sliceChatThroughTurn(messages, log, 3);
    assert.ok(sliced);
    assert.deepEqual(
      sliced.log.map((e) => e.role),
      ["user", "assistant", "tool", "assistant"],
    );
    assert.equal(sliced.log[3]?.finishedAt, 1_700_000_000_000);
    assert.deepEqual(
      sliced.messages.map((m) => m.text),
      ["总结", "第一段", "list"],
    );
    assert.equal(log.length, 6);
    assert.equal(messages.length, 5);
  });

  it("rejects an index outside the log", () => {
    assert.equal(sliceChatThroughTurn(messages, log, -1), null);
    assert.equal(sliceChatThroughTurn(messages, log, log.length), null);
  });
});
