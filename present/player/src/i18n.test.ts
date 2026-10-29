import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTranslator, DEFAULT_PLAYER_LOCALE, resolvePlayerLocale } from "./i18n.js";

describe("player locale", () => {
  it("normalizes zh variants and falls back to English", () => {
    assert.equal(resolvePlayerLocale(undefined), DEFAULT_PLAYER_LOCALE);
    assert.equal(resolvePlayerLocale("zh"), "zh-CN");
    assert.equal(resolvePlayerLocale("zh_TW"), "zh-CN");
    assert.equal(resolvePlayerLocale("fr"), "en");
    const zh = createTranslator("zh-CN");
    const en = createTranslator("en");
    assert.notEqual(zh("notes.panel.title"), en("notes.panel.title"));
  });
});
