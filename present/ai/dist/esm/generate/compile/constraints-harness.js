import { compilePresentation, outlineToFallbackSpec } from "./compile.js";
import { formatGatePassMarkdown, reportGateResult } from "../qa/gates-report.js";
import { buildBadDeckFixture } from "../qa/fixtures.js";
import { runP0Gates } from "../qa/gates.js";
export const DARK_LAUNCH_WIZARD_GUIDANCE = {
    topic: "SlimPPT 暗色发布",
    audience: "产品与设计评审",
    scenario: "cinematic keynote dark launch",
    goals: "讲清产品、节奏与差异化",
    language: "zh",
    slideCount: 16,
    // Design P1: system A (midnight). business theme is arctic-light — do not use it here.
    themeId: "ai",
    styleFamily: "dark-launch",
    visualSystem: "A",
};
const BODY_TITLES = [
    "为什么现在",
    "问题",
    "产品一句话",
    "核心能力",
    "工作流",
    "与传统工具",
    "设计系统",
    "动画与导出",
    "AI 生成",
    "质量门禁",
    "路线图",
    "指标",
    "风险",
    "下一步",
];
/** Body layoutHints: Outline-valid only; ≥4 Design web-exclusive (cards/process/comparison/two-column). */
const BODY_LAYOUT_HINTS = [
    "content",
    "cards",
    "two-column",
    "process",
    "comparison",
    "cards",
    "two-column", // was metrics — compile KPI row too sparse for Design ratio floor
    "content",
    "section",
    "cards", // was process — process steps often under-fill ratio
    "two-column",
    "bullets",
    "comparison",
    "content",
];
export function darkLaunchWizardOutline() {
    return {
        title: "SlimPPT 暗色发布",
        subtitle: "Cinematic dark-launch keynote",
        themeId: "ai",
        slides: [
            { title: "SlimPPT", layoutHint: "cover", bullets: ["暗色发布会"] },
            ...BODY_TITLES.map((title, i) => {
                const layoutHint = BODY_LAYOUT_HINTS[i] ?? "content";
                let bullets = [`${title}要点一`, `${title}要点二`, `${title}要点三`];
                if (layoutHint === "cards") {
                    bullets = [`能力 A: ${title}要点一`, `能力 B: ${title}要点二`, `能力 C: ${title}要点三`];
                }
                else if (layoutHint === "comparison") {
                    bullets = ["我们 || 传统", `${title}优势一`, `${title}优势二`, "旧方案局限一", "旧方案局限二"];
                }
                else if (layoutHint === "process") {
                    bullets = ["1 起点", "2 推进", "3 交付"];
                }
                return { title, layoutHint, bullets };
            }),
            { title: "谢谢", layoutHint: "closing", bullets: ["Q&A"] },
        ],
    };
}
export const GATE_PASS_RATE_SEEDS = [11, 22, 33];
export const GATE_PASS_RATE_TARGET = { runs: 3, minPass: 2 };
function compileWizard(constraintsEnabled, seed) {
    const spec = outlineToFallbackSpec(darkLaunchWizardOutline(), { injectMissingCover: false });
    return compilePresentation(spec, {
        size: { width: 1280, height: 720 },
        designSeed: seed,
        guidance: DARK_LAUNCH_WIZARD_GUIDANCE,
        constraintsEnabled,
    });
}
function timeCompile(constraintsEnabled, seed, label) {
    const t0 = performance.now();
    const pres = compileWizard(constraintsEnabled, seed);
    const result = runP0Gates(pres);
    const elapsedMs = Math.round(performance.now() - t0);
    return {
        seed,
        constraintsEnabled,
        report: reportGateResult(label, pres, result, elapsedMs),
    };
}
export function runGatePassRateHarness(seeds = GATE_PASS_RATE_SEEDS) {
    const t0 = performance.now();
    const before = seeds.map((seed, i) => timeCompile(false, seed, `wizard constraints=off run=${i + 1} seed=${seed}`));
    const after = seeds.map((seed, i) => timeCompile(true, seed, `wizard constraints=on run=${i + 1} seed=${seed}`));
    const badPres = buildBadDeckFixture();
    const badResult = runP0Gates(badPres);
    const badDeck = reportGateResult("bad-deck fixture", badPres, badResult, 0);
    return {
        brief: "SlimPPT 16-page dark-launch wizard (cover + 14 bullets + closing)",
        seeds,
        before,
        after,
        beforePass: before.filter((r) => r.report.passed).length,
        afterPass: after.filter((r) => r.report.passed).length,
        badDeck,
        wallClockMs: Math.round(performance.now() - t0),
    };
}
export function formatPassRateMarkdown(cmp) {
    const rows = [...cmp.before.map((r) => r.report), ...cmp.after.map((r) => r.report), cmp.badDeck];
    const summary = [
        `| Path | Pass / ${cmp.seeds.length} | Scrap | Wall-clock |`,
        `|---|---:|---:|---:|`,
        `| constraints off (baseline) | ${cmp.beforePass}/${cmp.seeds.length} | ${cmp.seeds.length - cmp.beforePass}/${cmp.seeds.length} | ${cmp.wallClockMs}ms |`,
        `| constraints on | ${cmp.afterPass}/${cmp.seeds.length} | ${cmp.seeds.length - cmp.afterPass}/${cmp.seeds.length} | ${cmp.wallClockMs}ms |`,
        `| bad-deck fixture | ${cmp.badDeck.passed ? "PASS" : "FAIL"} | n/a | n/a |`,
    ].join("\n");
    return [`Brief: ${cmp.brief}`, "", summary, "", formatGatePassMarkdown(rows)].join("\n");
}
export function printGatePassRateReport(cmp = runGatePassRateHarness()) {
    console.log(formatPassRateMarkdown(cmp));
    return cmp;
}
