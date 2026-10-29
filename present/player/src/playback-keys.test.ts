import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyDigitJumpKey, isTypingTarget, shortcutMatches } from "./playback-keys.js";

const key = (k: string, extra: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean; code: string }> = {}) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...extra,
});

describe("playback-keys", () => {
  it("matches shortcuts, buffers digits, and detects typing targets", () => {
    assert.equal(shortcutMatches("←", key("ArrowLeft")), true);
    assert.equal(shortcutMatches("Esc", key("Escape")), true);
    assert.equal(shortcutMatches("f", key("F")), true);
    assert.equal(shortcutMatches("←", key("ArrowLeft", { ctrlKey: true })), false);
    assert.deepEqual(applyDigitJumpKey("", "3", 10), { kind: "buffer", buffer: "3" });
    assert.deepEqual(applyDigitJumpKey("12", "Enter", 10), { kind: "jump", index0: 9 });
    assert.deepEqual(applyDigitJumpKey("1", "Escape", 10), { kind: "clear" });
    assert.equal(isTypingTarget({ tagName: "INPUT" }), true);
    assert.equal(isTypingTarget({ tagName: "DIV" }), false);
  });
});
