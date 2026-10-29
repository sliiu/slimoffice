import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OutlineItemSchema } from "./schema.js";
import { speechPlanFromOutlineItem } from "./reveal-order.js";

describe("speechPlanFromOutlineItem", () => {
  it("omits pace as all clicks and keeps bullet order", () => {
    const plan = speechPlanFromOutlineItem({ title: "Plan", bullets: ["Beta", "Alpha"] });
    assert.deepEqual(plan.points, ["Beta", "Alpha"]);
    assert.deepEqual(plan.pace, ["click", "click"]);
  });

  it("keeps a mixed pace on spoken points", () => {
    const plan = speechPlanFromOutlineItem({
      title: "Plan",
      bullets: ["Alpha", "Beta", "Gamma"],
      pace: ["click", "chain", "chain"],
    });
    assert.deepEqual(plan.pace, ["click", "chain", "chain"]);
  });

  it("collapses a chart, a stat, a table, and a comparison", () => {
    const chart = speechPlanFromOutlineItem({
      title: "Q",
      layoutHint: "chart",
      bullets: ["column", "Q1 | Q2", "A | 1 | 2"],
      pace: ["chain"],
    });
    assert.equal(chart.chart, true);
    assert.deepEqual(chart.points, []);
    assert.deepEqual(chart.pace, ["chain"]);
    const stat = speechPlanFromOutlineItem({ title: "NPS", layoutHint: "stat", bullets: ["72%"] });
    assert.deepEqual(stat.points, []);
    assert.deepEqual(stat.withTitle, ["72%"]);
    assert.deepEqual(stat.pace, []);
    const table = speechPlanFromOutlineItem({
      title: "Grid",
      layoutHint: "table",
      bullets: ["A | B", "1 | 2", "3 | 4"],
      pace: ["chain", "click", "chain"],
    });
    assert.deepEqual(table.points, ["1 | 2", "3 | 4"]);
    assert.deepEqual(table.pace, ["click", "chain"]);
    const cmp = speechPlanFromOutlineItem({
      title: "Choice",
      layoutHint: "comparison",
      bullets: ["Build || Buy", "fast", "owned", "cheap", "rented"],
      pace: ["chain", "click", "click", "chain", "click"],
    });
    assert.equal(cmp.leftLabel, "Build");
    assert.equal(cmp.rightLabel, "Buy");
    assert.equal(cmp.rightFrom, 2);
    assert.deepEqual(cmp.points, ["fast", "owned", "cheap", "rented"]);
    assert.deepEqual(cmp.pace, ["click", "click", "chain", "click"]);
  });

  it("drops pace tokens that are not click or chain", () => {
    const kept = OutlineItemSchema.parse({ title: "T", pace: ["CLICK", "chain", "nope"] });
    assert.deepEqual(kept.pace, ["click", "chain"]);
    const dropped = OutlineItemSchema.parse({ title: "T", pace: ["nope"] });
    assert.equal(dropped.pace, undefined);
    const plan = speechPlanFromOutlineItem({ title: "T", bullets: ["A", "B"], pace: kept.pace });
    assert.deepEqual(plan.pace, ["click", "chain"]);
  });
});
