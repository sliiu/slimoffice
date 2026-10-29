import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { identityTransform, type Presentation } from "@ppt/core";
import { accessibilityIssueDetail, auditPresentationAccessibility } from "./accessibility-audit.js";
import { getLocale, setLocale } from "./i18n/index.js";
import { formatAccessibilityIssueLine } from "./review-export.js";

function untitledSlide(): Presentation {
  return {
    id: "p",
    size: { width: 1280, height: 720 },
    slides: [
      {
        id: "s0",
        name: "A",
        index: 0,
        background: { kind: "solid", color: "#ffffff" },
        layers: [
          {
            id: "main",
            name: "main",
            visible: true,
            locked: false,
            shapes: [
              {
                id: "body",
                kind: "text",
                name: "Body",
                zIndex: 0,
                visible: true,
                locked: false,
                opacity: 1,
                bbox: { x: 80, y: 200, w: 400, h: 40 },
                transform: identityTransform(),
                paragraphs: [{ runs: [{ text: "Notes only", color: "#0f172a", fontSize: 14 }] }],
              },
            ],
          },
        ],
      },
    ],
  };
}

describe("accessibility issue details", () => {
  const prev = getLocale();
  afterEach(() => setLocale(prev));

  it("translates a missing-title explanation with the current locale", () => {
    setLocale("zh");
    const issue = auditPresentationAccessibility(untitledSlide()).issues.find((i) => i.kind === "missing-title");
    assert.ok(issue);
    assert.equal(
      accessibilityIssueDetail(issue),
      "未检测到幻灯片标题 — 请添加大标题或标题占位符，方便屏幕阅读器",
    );
    assert.match(formatAccessibilityIssueLine(issue), /未检测到幻灯片标题/);
    setLocale("en");
    assert.equal(
      accessibilityIssueDetail(issue),
      "No slide title detected — add a large title or title placeholder for screen readers",
    );
  });

  it("fills contrast numbers into the localized sentence", () => {
    const issue = {
      slideIndex: 0,
      kind: "contrast" as const,
      detail: "stale",
      detailKey: "accessibility.detail.contrast" as const,
      detailParams: { ratio: "2.10", threshold: 4.5 },
    };
    setLocale("zh");
    assert.equal(accessibilityIssueDetail(issue), "与有效背景的对比度为 2.10:1（需要 ≥4.5）");
    setLocale("en");
    assert.equal(
      accessibilityIssueDetail(issue),
      "Contrast 2.10:1 vs effective background (need ≥4.5)",
    );
  });
});
