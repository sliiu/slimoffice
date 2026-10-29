import type { Presentation } from "@ppt/core";
import { GATE_KINDS, runP0Gates, tallyGateFindings, type GateFinding, type GateKind, type GateResult } from "./gates";

export interface GatePassReport {
  label: string;
  slideCount: number;
  passed: boolean;
  findingCount: number;
  byKind: Record<GateKind, number>;
  findings: GateFinding[];
  elapsedMs: number;
}

export function reportGateResult(
  label: string,
  pres: Presentation,
  result: GateResult = runP0Gates(pres),
  elapsedMs = 0,
): GatePassReport {
  return {
    label,
    slideCount: pres.slides.length,
    passed: result.passed,
    findingCount: result.findings.length,
    byKind: tallyGateFindings(result.findings),
    findings: result.findings,
    elapsedMs,
  };
}

export function formatGatePassLine(r: GatePassReport): string {
  const kinds = GATE_KINDS.map((k) => `${k}=${r.byKind[k]}`).join(" ");
  const verdict = r.passed ? "PASS" : "FAIL";
  return `${r.label}\tslides=${r.slideCount}\t${verdict}\tfindings=${r.findingCount}\t${kinds}\t${r.elapsedMs}ms`;
}

export function formatGatePassMarkdown(rows: GatePassReport[]): string {
  const head =
    "| Label | Slides | Pass | Findings | cover-visual | no-bullets | text-overlap | web-exclusive | speaker-notes | banned-imagery | ms |";
  const sep = "|---|---:|:---:|---:|---:|---:|---:|---:|---:|---:|---:|";
  const body = rows.map((r) => {
    const cells = GATE_KINDS.map((k) => String(r.byKind[k])).join(" | ");
    return `| ${r.label} | ${r.slideCount} | ${r.passed ? "PASS" : "FAIL"} | ${r.findingCount} | ${cells} | ${r.elapsedMs} |`;
  });
  return [head, sep, ...body].join("\n");
}
