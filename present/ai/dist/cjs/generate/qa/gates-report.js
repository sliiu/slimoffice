"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reportGateResult = reportGateResult;
exports.formatGatePassLine = formatGatePassLine;
exports.formatGatePassMarkdown = formatGatePassMarkdown;
const gates_1 = require("./gates");
function reportGateResult(label, pres, result = (0, gates_1.runP0Gates)(pres), elapsedMs = 0) {
    return {
        label,
        slideCount: pres.slides.length,
        passed: result.passed,
        findingCount: result.findings.length,
        byKind: (0, gates_1.tallyGateFindings)(result.findings),
        findings: result.findings,
        elapsedMs,
    };
}
function formatGatePassLine(r) {
    const kinds = gates_1.GATE_KINDS.map((k) => `${k}=${r.byKind[k]}`).join(" ");
    const verdict = r.passed ? "PASS" : "FAIL";
    return `${r.label}\tslides=${r.slideCount}\t${verdict}\tfindings=${r.findingCount}\t${kinds}\t${r.elapsedMs}ms`;
}
function formatGatePassMarkdown(rows) {
    const head = "| Label | Slides | Pass | Findings | cover-visual | no-bullets | text-overlap | web-exclusive | speaker-notes | banned-imagery | ms |";
    const sep = "|---|---:|:---:|---:|---:|---:|---:|---:|---:|---:|---:|";
    const body = rows.map((r) => {
        const cells = gates_1.GATE_KINDS.map((k) => String(r.byKind[k])).join(" | ");
        return `| ${r.label} | ${r.slideCount} | ${r.passed ? "PASS" : "FAIL"} | ${r.findingCount} | ${cells} | ${r.elapsedMs} |`;
    });
    return [head, sep, ...body].join("\n");
}
