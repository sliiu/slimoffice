import type { Presentation, Template } from "@sliiu/present-core";
import type { AiConfig } from "../config/types.js";
import type { HostSkillStore } from "../skills/types.js";
import type { ThemeDef } from "../themes.js";
import type { MotionBundle, MotionBundleId } from "../animations.js";
import type { Outline } from "./schema.js";
import type { DesignSpec } from "./design-spec.js";
import type { ThemeGuidance } from "./prompts.js";
import type { ImageEnrichmentPriority } from "./enrich/fetch-enrichment-image.js";
import type { LayoutStyleSpec } from "./layout-style.js";
import type { ReviewResult } from "./qa/art-director.js";
import type { LlmUsage } from "../llm/usage.js";
import type { ModelFilePart } from "../source-files/complete.js";
import type { GenerateWallClockOptions } from "./abort.js";
import type { PipelineP2Stage } from "./qa/pipeline-p2-policy.js";
/** 生成过程中累计的资源消耗统计。 */
export interface UsageMetrics {
    /** 模型调用次数（LLM 请求数，不含缓存命中）。 */
    modelCalls: number;
    /** 输入 token 总数（包含 cache-read）。 */
    inputTokens: number;
    /** 输出 token 总数。 */
    outputTokens: number;
    /** cache-read token 数（Anthropic prompt caching）。 */
    cacheReadTokens: number;
    /** cache-creation token 数（首次写缓存）。 */
    cacheCreationTokens: number;
    /** 墙钟耗时（毫秒）。 */
    wallTimeMs: number;
    /** 预估成本（人民币元）；未配置价格时为 0。 */
    estimatedCostCNY: number;
}
/**
 * Checkpoint for continuing generate after pause / timeout / failure.
 * `stage` is the first P2 step that still needs to run.
 */
export interface GenerateResume {
    stage: PipelineP2Stage;
    /** Organized outline after plan. */
    outline?: Outline;
    /** Compiled deck after layout (canvas author / fill). */
    presentation?: Presentation;
}
/** i18n：`ai.status.progress.<key>`，参数见 detailParams。 */
export type PipelineEventDetailKey = "designSpec.drafting" | "designSpec.ready" | "outline.drafting" | "outline.ready" | "research.drafting" | "research.ready" | "theme.designing" | "theme.ready" | "motion.designing" | "motion.ready" | "slide.progress" | "compile.composing" | "compile.image" | "enrich.skip" | "enrich.rateLimited" | "qa.checking" | "artDirector.reviewing" | "animate.applying" | "animate.ready" | "animate.skipped" | "animate.failed";
/** 统一的流水线进度事件（生成向导 / 状态条消费）。 */
export interface PipelineEvent {
    stage: "outline" | "slide" | "compile" | "done";
    /** 0..1 */
    progress: number;
    detailKey?: PipelineEventDetailKey;
    detailParams?: Record<string, string | number>;
    /** 当前累计资源消耗（仅在 done 时保证完整，中间是近似值）。 */
    usage?: UsageMetrics;
}
export interface GenerateOptions {
    /** AI 配置；缺省时用 defaultConfig()（通常不可用 → ensureConfig 抛错提示去配置）。 */
    config?: AiConfig;
    onProgress?: (p: PipelineEvent) => void;
    /** Provider usage from each LLM call; generate pipeline feeds UsageCounter from this. */
    onLlmUsage?: (usage: LlmUsage) => void;
    /** 第一阶段产出后立即回调；返回值如果是 Outline 就替换为用户编辑后的版本。 */
    onOutline?: (outline: Outline) => Promise<Outline | void> | Outline | void;
    signal?: AbortSignal;
    /**
     * Resume a paused / timed-out / failed run. Stages strictly before `stage`
     * are skipped; this stage and everything after are re-run.
     */
    resume?: GenerateResume;
    /**
     * Hard wall-clock for one generate run (default 12 minutes).
     * `false` skips the timer (inner calls after the outer run already armed it).
     */
    wallClock?: false | GenerateWallClockOptions;
    /** 调试日志输出。 */
    debug?: boolean;
    /** 生成完后是否自动套用主流审美动画（默认 true）。 */
    enableAnimations?: boolean;
    /**
     * 传给 auto-animate 的点击步数上限。不传则扩散序列的每一项各自一次点击。
     */
    maxEffectsPerSlide?: number;
    /**
     * 显式指定 motion bundle（minimal / cinematic / editorial / playful）。
     * 不传时由 animations.resolveBundleForPresentation 根据 pres.theme 自动推断。
     */
    motionBundleId?: MotionBundleId;
    /**
     * AI 生成的自定义主题。优先级最高：传入时所有 slide 都用它编译，忽略 outline.themeId。
     */
    themeOverride?: ThemeDef;
    /**
     * 配套的 AI 生成 motion bundle（一般由 generateThemeWithMotion 一起产出）。
     * 传入时优先于 motionBundleId / 推断。
     */
    motionBundle?: MotionBundle;
    /**
     * 如果为 true（且未提供 themeOverride），一键流程会在生成 outline 的同时并行调
     * generateTheme。触发条件：guidance.themeId === "ai" 时由 UI 端设置 true。
     */
    autoGenerateTheme?: ThemeGuidance | true;
    /**
     * 图像增强：把 LLM 在 slide spec 里写的 bgImageQuery / heroImageQuery 翻译为
     * 实际图片（dataURL）。默认开启（无图源时自动 noop）。
     */
    enableImageEnrichment?: boolean;
    /** 图库 vs AI 生图尝试顺序；仅双源均配置时生效，默认 ai-first。 */
    imageEnrichmentPriority?: ImageEnrichmentPriority;
    /** 用户自定义 Skill 存储；与对话 tab 同源。不传时仅注入 enabled 的 builtin skills。 */
    hostSkillStore?: HostSkillStore;
    /**
     * 构图种子：驱动 layouts v2 的构图变体。缺省每次 build 随机（重新生成 →
     * 可见的构图变化）；显式传入可复现同一构图（调试 / 回放）。
     */
    designSeed?: number;
    /**
     * P2 test/dev inject: fail at plan|layout|write stage boundary (no success deck).
     * Production callers omit this.
     */
    pipelineP2Inject?: import("./qa/pipeline-p2-policy.js").PipelineP2Inject;
    /**
     * AI 设计的布局风格（generateLayoutStyle / generateThemeWithMotion 产出）。
     * 传入时构图按 spec 执行；缺省回退种子变体。
     */
    layoutStyle?: LayoutStyleSpec;
    /**
     * 版式模板。有文字占位符时成稿只填占位符，页上构图（template.composition）只约束大纲疏密。
     * 没有文字占位符、但模板带构图说明时，不填占位符，整页按那份构图走自由画布。
     */
    layoutTemplate?: Template;
    /** 没有版式模板时的整页构图说明。没有原文。模板自己的 composition 优先。 */
    sampleComposition?: string;
    /** 已经决定好投递方式的源文件字节。抽过文字的不放这里，文字在 guidance.sourceMaterial。 */
    sourceFiles?: ModelFilePart[];
    /** 生成后确定性质检 + 自动修复 pass（对比度 / 图层遮挡 / 出血）。默认开启。 */
    enableQaRepair?: boolean;
    /** 生成后"艺术总监"二次评审 pass。默认开启；显式 false 省一次 LLM 调用。 */
    enableArtDirector?: boolean;
    /** 艺术总监发现版式问题时对高严重度页换 layout 单页重生成（最多 3 页）。默认跟随 enableArtDirector。 */
    enableArtDirectorRetry?: boolean;
    /** 艺术总监评审报告回调。UI 可展示"AI 设计建议"。 */
    onArtDirectorReport?: (report: ReviewResult) => void;
    /**
     * 设计规格预决策 pass：正式生成前先跑一次轻量 LLM 产出冻结的 DesignSpec，
     * 作为"设计简报"注入下游 slide prompt + 驱动 styleFamily。默认关闭；失败非阻断。
     */
    enableDesignSpec?: boolean;
    /** 设计规格回调（首次计算 DesignSpec 时触发）。 */
    onDesignSpec?: (spec: DesignSpec) => void;
    /**
     * 冻结的 DesignSpec：由 outline 阶段决策、经"设计规格卡"确认后前递。
     * 传入时 generateFromOutline 跳过内部 pass，直接消费。
     */
    designSpec?: DesignSpec;
    /**
     * 是否让 DesignSpec 的 themeId 也覆盖主题。默认 false（只驱动 styleFamily）。
     * 仅当用户未显式选主题、且 spec 选的是内置主题（非 "ai"）时才生效。
     */
    applyDesignSpecTheme?: boolean;
    /**
     * 参考演示文稿（PPTAgent edit-based 路径）：逐页诱导槽位 → 映射大纲 → LLM 填文字，
     * 保留参考页的几何 / 装饰 / 图片。传入时 art-director 的「换 layout 重试」自动关闭。
     */
    referencePresentation?: Presentation;
    /** 填槽时相对参考原文的长度系数，默认 1.25。 */
    referenceLengthFactor?: number;
    captureReviewShots?: (pres: Presentation) => Promise<Array<{
        slideIdx: number;
        dataUrl: string;
    }>> | Array<{
        slideIdx: number;
        dataUrl: string;
    }>;
    /**
     * 生成过程中的中间 Presentation（骨架编译后、每页绘制后、配图后）。
     * 宿主可立刻 sync 到舞台，不必等整份 deck 完成。
     */
    onPresentationDraft?: (pres: Presentation, meta?: {
        slideIdx?: number;
    }) => void;
    /**
     * Debug tap for the canvas author: the model's raw JSON (before normalize / zod) on each pass.
     * Smoke scripts dump it to disk to see what the model actually wrote vs. what snap dropped.
     */
    onCanvasAuthored?: (raw: unknown, pass: "author" | "repair") => void;
    /** Debug tap: the outline after organize (key points + Design Brief) — exactly what the canvas author was given. */
    onOutlineOrganized?: (outline: Outline) => void;
    /** Hard cap on text-model calls for this generate (16-page class budget is 8). */
    maxModelCalls?: number;
    /**
     * Compile-path A/B only（非用户开关）。false 时跳过 applyCompileConstraints。
     * 默认 true；live gate harness 显式传 on。
     */
    constraintsEnabled?: boolean;
    /**
     * Ignored. Product generate is always deckgen + polish.
     * Kept so older call sites compiling against this field still typecheck.
     */
    useDeckgen?: boolean;
}
/** 校验配置可用性；不可用时抛出面向用户的提示。 */
export declare function ensureConfig(config?: AiConfig): AiConfig;
