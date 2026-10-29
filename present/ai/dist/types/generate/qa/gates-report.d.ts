import type { Presentation } from "@sliiu/present-core";
import { type GateFinding, type GateKind, type GateResult } from "./gates.js";
export interface GatePassReport {
    label: string;
    slideCount: number;
    passed: boolean;
    findingCount: number;
    byKind: Record<GateKind, number>;
    findings: GateFinding[];
    elapsedMs: number;
}
export declare function reportGateResult(label: string, pres: Presentation, result?: GateResult, elapsedMs?: number): GatePassReport;
export declare function formatGatePassLine(r: GatePassReport): string;
export declare function formatGatePassMarkdown(rows: GatePassReport[]): string;
