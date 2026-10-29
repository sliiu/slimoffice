import { GATE_KINDS, runP0Gates, tallyGateFindings } from "./gates.js";
export function reportGateResult(label, pres, result = runP0Gates(pres), elapsedMs = 0) {
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
export function formatGatePassLine(r) {
    const kinds = GATE_KINDS.map((k) => `${k}=${r.byKind[k]}`).join(" ");
    const verdict = r.passed ? "PASS" : "FAIL";
    return `${r.label}\tslides=${r.slideCount}\t${verdict}\tfindings=${r.findingCount}\t${kinds}\t${r.elapsedMs}ms`;
}
export function formatGatePassMarkdown(rows) {
    const head = "| Label | Slides | Pass | Findings | cover-visual | no-bullets | text-overlap | web-exclusive | speaker-notes | banned-imagery | ms |";
    const sep = "|---|---:|:---:|---:|---:|---:|---:|---:|---:|---:|---:|";
    const body = rows.map((r) => {
        const cells = GATE_KINDS.map((k) => String(r.byKind[k])).join(" | ");
        return `| ${r.label} | ${r.slideCount} | ${r.passed ? "PASS" : "FAIL"} | ${r.findingCount} | ${cells} | ${r.elapsedMs} |`;
    });
    return [head, sep, ...body].join("\n");
}
