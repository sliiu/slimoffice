import type { PipelineEvent, UsageMetrics } from "./types";

export type ProgressTranslate = (key: string, params?: Record<string, string | number>) => string;

export function hasRealGenerateUsage(usage?: UsageMetrics | null): boolean {
  if (!usage) return false;
  const tokens =
    usage.inputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheCreationTokens;
  return tokens > 0;
}

export function formatYuan(n: number): string | null {
  if (!(n > 0) || !Number.isFinite(n)) return null;
  if (n >= 0.01) {
    const s = n.toFixed(2);
    return s === "0.00" ? null : s;
  }
  const s = n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  if (!s || s === "0") return null;
  return s;
}

export function formatUsageAmounts(usage: UsageMetrics): { tokens: string; y: string } | null {
  if (!hasRealGenerateUsage(usage)) return null;
  const raw = usage.inputTokens + usage.outputTokens;
  const tokens = raw >= 1000 ? `${(raw / 1000).toFixed(1)}k` : String(Math.round(raw));
  if (tokens === "0") return null;
  const y = formatYuan(usage.estimatedCostCNY);
  if (!y) return null;
  return { tokens, y };
}

export function formatGenerateProgress(p: PipelineEvent, t: ProgressTranslate): string {
  if (p.detailKey === "slide.progress" && p.detailParams?.total) {
    const pageProgress = t("ai.generate.progress.title", {
      current: p.detailParams.current ?? 0,
      total: p.detailParams.total,
    });
    const amounts = p.usage ? formatUsageAmounts(p.usage) : null;
    if (amounts) {
      return `${pageProgress} · ${t("ai.generate.progress.usage", { tokens: amounts.tokens, y: amounts.y })}`;
    }
    return `${pageProgress} · ${t("ai.generate.progress.usageMeasuring")}`;
  }
  if (p.detailKey === "slide.progress" && p.detailParams?.title) {
    return t("ai.status.progress.slide.progressWithTitle", p.detailParams);
  }
  if (p.detailKey) {
    return t(`ai.status.progress.${p.detailKey}`, p.detailParams);
  }
  const pct = Math.round(p.progress * 100);
  switch (p.stage) {
    case "outline":
      return t("ai.status.progress.stage.outline", { pct });
    case "slide":
      return t("ai.status.progress.stage.slide", { pct });
    case "compile":
      return t("ai.status.progress.stage.compile", { pct });
    case "done":
      return t("ai.status.progress.stage.done");
    default:
      return t("ai.status.progress.stage.generic", { pct });
  }
}
