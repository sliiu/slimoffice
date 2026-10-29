import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import type { Presentation } from "@ppt/core";
import { resolveReviewLanguage } from "./art-director";

function presWithText(text: string): Presentation {
  return {
    size: { width: 1280, height: 720 },
    slides: [
      {
        id: "s0",
        layers: [
          {
            id: "l0",
            shapes: [
              {
                id: "t0",
                kind: "text",
                name: "title",
                bbox: { x: 0, y: 0, w: 400, h: 60 },
                paragraphs: [{ runs: [{ text }] }],
              },
            ],
          },
        ],
      },
    ],
  } as Presentation;
}

describe("resolveReviewLanguage", () => {
  it("prefers explicit language", () => {
    assert.equal(resolveReviewLanguage({ language: "fr", uiLocale: "zh-CN" }), "fr");
  });

  it("falls back to ui locale", () => {
    assert.equal(resolveReviewLanguage({ uiLocale: "zh-CN" }), "zh");
    assert.equal(resolveReviewLanguage({ uiLocale: "en" }), "en");
  });

  it("infers from deck text when locale is absent", () => {
    assert.equal(resolveReviewLanguage({ pres: presWithText("季度业务回顾") }), "zh");
    assert.equal(resolveReviewLanguage({ pres: presWithText("Quarterly business review") }), "en");
  });
});
