// 大纲上的出场顺序。动画按要点的书写顺序排，每个要点的接法听 pace。
// 漏写 pace 当作全部等点击。见 docs/decisions/2026-10-01-outline-reveal-order.md。

import type { RevealCue } from "../animations.js";
import type { OutlineItem } from "./schema.js";

const CHART_TYPES = new Set(["column", "line", "bar", "pie", "area", "doughnut"]);

function alignPace(
  pace: readonly ("click" | "chain")[] | undefined,
  bulletCount: number,
  pointCount: number,
  skipped: number,
): ("click" | "chain")[] {
  const raw = pace ?? [];
  const source =
    skipped > 0 && raw.length === bulletCount && raw.length !== pointCount ? raw.slice(skipped) : raw;
  return Array.from({ length: pointCount }, (_, i) => (source[i] === "chain" ? "chain" : "click"));
}

/** 把一页大纲收成动画能用的出场提示。编码行（图表类型、表头、对比栏名）不单独成拍。 */
export function speechPlanFromOutlineItem(item: OutlineItem): RevealCue {
  const hint = item.layoutHint ?? "";
  const bullets = (item.bullets ?? []).map((b) => b.trim()).filter(Boolean);
  const cue: RevealCue = { title: item.title.trim(), points: [] };

  if (hint === "stat") {
    if (bullets[0]) cue.withTitle = [bullets[0]];
    cue.pace = [];
    return cue;
  }

  if (hint === "chart" || (bullets[0] && CHART_TYPES.has(bullets[0].toLowerCase()))) {
    cue.chart = true;
    cue.pace = alignPace(item.pace, bullets.length, 1, 0);
    return cue;
  }

  if (hint === "comparison" || (bullets[0] && /\|\||\s+vs\.?\s+|\s+对\s+/i.test(bullets[0]))) {
    let rest = bullets;
    let skipped = 0;
    const parts = (bullets[0] ?? "").split(/\s*\|\|\s*|\s+vs\.?\s+|\s+对\s+/i);
    if (parts.length === 2 && parts[0]!.trim() && parts[1]!.trim()) {
      cue.leftLabel = parts[0]!.trim();
      cue.rightLabel = parts[1]!.trim();
      rest = bullets.slice(1);
      skipped = 1;
    }
    cue.points = rest;
    cue.rightFrom = Math.ceil(rest.length / 2);
    cue.pace = alignPace(item.pace, bullets.length, rest.length, skipped);
    return cue;
  }

  if (hint === "table" || (bullets[0]?.includes("|") && hint !== "metrics")) {
    const skipped = bullets[0]?.includes("|") ? 1 : 0;
    cue.points = skipped ? bullets.slice(1) : bullets;
    cue.pace = alignPace(item.pace, bullets.length, cue.points.length, skipped);
    return cue;
  }

  cue.points = bullets;
  cue.pace = alignPace(item.pace, bullets.length, bullets.length, 0);
  return cue;
}
