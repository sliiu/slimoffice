import type { GuidanceInput, Outline } from "../schema.js";
import { type GatePassReport } from "../qa/gates-report.js";
export declare const DARK_LAUNCH_WIZARD_GUIDANCE: GuidanceInput;
export declare function darkLaunchWizardOutline(): Outline;
export declare const GATE_PASS_RATE_SEEDS: readonly [11, 22, 33];
export declare const GATE_PASS_RATE_TARGET: {
    readonly runs: 3;
    readonly minPass: 2;
};
export interface GatePassRateRun {
    seed: number;
    constraintsEnabled: boolean;
    report: GatePassReport;
}
export interface GatePassRateComparison {
    brief: string;
    seeds: readonly number[];
    before: GatePassRateRun[];
    after: GatePassRateRun[];
    beforePass: number;
    afterPass: number;
    badDeck: GatePassReport;
    wallClockMs: number;
}
export declare function runGatePassRateHarness(seeds?: readonly number[]): GatePassRateComparison;
export declare function formatPassRateMarkdown(cmp: GatePassRateComparison): string;
export declare function printGatePassRateReport(cmp?: GatePassRateComparison): GatePassRateComparison;
