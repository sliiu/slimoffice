import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { browserUiLocale, pickGuestLocale, resolveUiLocale } from "./ui-locale.js";

describe("browserUiLocale", () => {
  it("maps Chinese and English tags and treats anything else as English", () => {
    assert.equal(browserUiLocale(["zh-TW", "en"]), "zh-CN");
    assert.equal(browserUiLocale(["en-GB"]), "en");
    assert.equal(browserUiLocale(["ja", "zh-CN"]), "zh-CN");
    assert.equal(browserUiLocale(["ja"]), "en");
    assert.equal(browserUiLocale([]), null);
    assert.equal(browserUiLocale(null), null);
  });
});

describe("pickGuestLocale", () => {
  it("prefers the link, then an explicit save, then the browser, then the publisher", () => {
    assert.equal(
      pickGuestLocale({ url: "en", languages: ["zh-CN"], fallback: "zh-CN" }),
      "en",
    );
    assert.equal(
      pickGuestLocale({
        stored: "en",
        storedExplicit: true,
        languages: ["zh-CN"],
        fallback: "zh-CN",
      }),
      "en",
    );
    assert.equal(
      pickGuestLocale({
        stored: "en",
        storedExplicit: false,
        languages: ["zh-CN"],
        fallback: "en",
      }),
      "zh-CN",
    );
    assert.equal(
      pickGuestLocale({ languages: ["fr-FR"], fallback: "zh-CN" }),
      "en",
    );
    assert.equal(pickGuestLocale({ languages: [], fallback: "zh-CN" }), "zh-CN");
  });
});

describe("resolveUiLocale", () => {
  it("uses the browser only after url, account, and an explicit save", () => {
    assert.equal(
      resolveUiLocale({ browser: "zh-CN", envDefault: "en" }),
      "zh-CN",
    );
    assert.equal(
      resolveUiLocale({ account: "en", browser: "zh-CN", envDefault: "en" }),
      "en",
    );
    assert.equal(resolveUiLocale({ envDefault: "en" }), "en");
  });
});
