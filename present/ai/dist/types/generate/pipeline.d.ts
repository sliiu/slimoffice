import type { Presentation } from "@sliiu/present-core";
import { type GuidanceInput, type Outline } from "./schema.js";
import type { GenerateOptions } from "./types.js";
export { generateOutline } from "./stages/outline.js";
export { generateTheme, generateMotionScheme, generateThemeWithMotion, generateLayoutStyle, themeContextFromSpec, } from "./stages/theme.js";
export { ensureConfig, type GenerateOptions, type GenerateResume, type PipelineEvent, type PipelineEventDetailKey, type UsageMetrics } from "./types.js";
export { runP0Gates, type GateResult, type GateFinding, type GateKind } from "./qa/gates.js";
export { runDesignGates, DESIGN_LAYOUT_CATALOG, DESIGN_GATE_KINDS, type DesignGateResult, type DesignGateFinding, type DesignGateKind, } from "./qa/design-gates.js";
export { VISUAL_SYSTEM_IDS, VISUAL_SYSTEMS, resolveVisualSystem, type VisualSystemId, } from "./visual-system.js";
export { abortError, bindGenerateWallClock, classifyGenerateEndError, GENERATE_PAUSE_KIND, GENERATE_TIMEOUT_KIND, GENERATE_WALL_MS, generatePauseError, generateTimeoutError, isAbortError, isGeneratePauseError, isGenerateTimeoutError, shouldCommitGeneratedDeck, startGenerateWallClock, throwIfAborted, withGenerateWallClock, type GenerateEndKind, type GenerateWallClockOptions, } from "./abort.js";
export { formatGenerateProgress, formatUsageAmounts, hasRealGenerateUsage } from "./format-progress.js";
export { UsageCounter, extractLlmUsage, type LlmUsage } from "./usage-counter.js";
/** 从已知 outline（用户可能编辑过）继续生成完整 Presentation。 */
export declare function generateFromOutline(outlineInput: Outline, guidance: GuidanceInput, opts?: GenerateOptions): Promise<Presentation>;
/** 一键生成（deckgen 四层管线 + polish）。大纲 LLM 由向导单独调用 `generateOutline`。 */
export declare function generatePresentation(guidance: GuidanceInput, opts?: GenerateOptions): Promise<Presentation>;
