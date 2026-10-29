import { z } from "zod";
import type { Slide, SlideTransition } from "@sliiu/present-core";
export type MainstreamEffect = "appear" | "fade" | "fade-up" | "fade-down" | "float-up" | "zoom" | "zoom-soft" | "wipe" | "glide";
export declare const MAINSTREAM_EFFECT_LIST: MainstreamEffect[];
interface PresetSpec {
    presetClass: "entr" | "exit" | "emph" | "path";
    presetId: number;
    /** 默认时长 ms。挑选为 ui-ux-pro-max 推荐的 250..500ms 区间内典型值。 */
    defaultDurationMs: number;
}
export declare function resolveEffectPreset(name: MainstreamEffect): PresetSpec;
export type EffectTrigger = "onClick" | "withPrevious" | "afterPrevious";
export interface AnimationEffectSpec {
    shapeId: string;
    effect: MainstreamEffect;
    /**
     * 触发方式。链路里第一拍 `onClick`、后续 `afterPrevious`；
     * 扩散序列的每一项各自 `onClick`；单元内其余形状 `withPrevious`。
     */
    trigger?: EffectTrigger;
    /** 自定义时长，覆盖 effect 默认值。 */
    durationMs?: number;
    /** 延迟（相对 trigger 起点）。 */
    delayMs?: number;
    /** 段落范围（用于文本逐段入场）；缺省整 shape 一起入场。 */
    paraRange?: {
        st: number;
        end: number;
    };
}
export declare function applyAnimationsToSlide(slide: Slide, effects: AnimationEffectSpec[]): void;
export declare function clearSlideAnimations(slide: Slide): void;
export type AnimRole = "background" | "accent" | "eyebrow" | "stat-value" | "stat-label" | "step-marker" | "cover-title" | "cover-subtitle" | "cover-footer" | "section-number" | "section-title" | "section-caption" | "closing-title" | "closing-message" | "closing-contact" | "page-title" | "bullets" | "column-title" | "column-body" | "side-text" | "body" | "quote-mark" | "quote-text" | "quote-attribution" | "image" | "chart" | "table-header" | "table-header-cell" | "row-stripe" | "cell" | "unknown-text" | "unknown-image" | "unknown-group";
export type MotionBundleId = "minimal" | "cinematic" | "editorial" | "playful";
export declare const MOTION_BUNDLE_IDS: MotionBundleId[];
interface RoleHint {
    effect: MainstreamEffect;
    /** 与上一条 effect 的间隔（ms）。默认 80。 */
    gapMs?: number;
    /** 覆盖 effect 的默认 duration。 */
    durationMs?: number;
}
/**
 * MotionBundle.id —— 内置 bundle 用 MotionBundleId 之一；AI 合成 bundle 用
 * `ai_motion_<stamp>` 形式的字符串。`isBuiltInMotionBundleId` 用于区分。
 */
export interface MotionBundle {
    id: string;
    name: string;
    description: string;
    /**
     * 角色 → 动画的覆盖映射。**只填想偏离 BASELINE 的角色**，其它角色走 BASELINE。
     * 这让 bundle 定义简短，只写"差异化"部分，未来加角色也无需逐个补齐。
     */
    rolesOverride: Partial<Record<AnimRole, RoleHint>>;
    /**
     * 整体节奏倍率（应用到 gapMs / durationMs）。1.0 默认；>1 更慢更舒缓，<1 更紧凑。
     * 在 BASELINE 与 override 都生效之后再乘一次。
     */
    paceMultiplier: number;
    /**
     * 页间过渡（slide.transition）。kind 必须是 transition-fx registry 里的合法名字
     * （cut / fade / push / cover / wipe / morph / cube / fall / ...）。undefined =
     * 直接 cut（最素净）。
     */
    slideTransition?: SlideTransition;
}
export declare const MOTION_BUNDLES: Record<MotionBundleId, MotionBundle>;
export declare function getMotionBundle(id: MotionBundleId | undefined): MotionBundle;
export declare function isBuiltInMotionBundleId(id: string): id is MotionBundleId;
/**
 * 根据 presentation 当前主题挑一个 motion bundle。
 *
 * 规则：
 *   1. 内置 5 套主题：business/minimal → minimal；academic → editorial；
 *      creative → playful；dark → cinematic。
 *   2. AI 生成主题（id 以 "ai_" 开头）：根据背景色亮度推断 light/dark；dark 走
 *      cinematic，light 默认走 minimal。
 *   3. 兜底 minimal。
 *
 * 这层是"友好默认"，调用方仍可显式传 bundleId 覆盖。
 */
export declare function resolveBundleForPresentation(pres: {
    theme?: {
        id?: string;
        colors?: Record<string, string>;
    };
}): MotionBundleId;
/**
 * 一页大纲交给入场排序的提示。没有这份提示时，排序仍按角色和版面位置。
 * `points` 已去掉编码行。图表整张算一个要点，接法用 `pace[0]`。
 */
export interface RevealCue {
    title: string;
    points: string[];
    /**
     * 与 `points` 对齐。`chain` 接上一条自动播放，缺省或 `click` 等一次点击。
     * 标题是第一拍，不在这列里。
     */
    pace?: ("click" | "chain")[];
    /** 这一页的图是一个要点，不在 `points` 文本里。接法用 `pace[0]`。 */
    chart?: boolean;
    /** 跟标题同一拍的文字（单数字的值）。 */
    withTitle?: string[];
    leftLabel?: string;
    rightLabel?: string;
    /** `points` 里右栏第一条的下标。 */
    rightFrom?: number;
}
export interface AutoAnimateOptions {
    /** 整页是否启用动画；为 false 时返回空数组。 */
    enabled?: boolean;
    /**
     * 每页点击步数上限。不传则不限制（硬顶仍是 {@link MAX_EFFECTS_PER_SLIDE} 条 effect）。
     * 超出上限的单元整组并进最后一次点击（`withPrevious`、延迟 0），不会把一块东西拆开。
     */
    maxEffects?: number;
    /** 起始延迟。 */
    initialDelayMs?: number;
    /**
     * slide 像素尺寸，用于判定"某个填充形状是单元底板，还是页面级底纹"。
     * 缺省按 1280×720 估算；两个调用方（生成 pipeline / ApplyAutoAnimationsCmd）
     * 都会传真实的 pres.size。
     */
    slideSize?: {
        width: number;
        height: number;
    };
    /**
     * 指定 motion bundle。两种传法（按优先级）：
     *   - `bundle`：完整 MotionBundle（用于 AI 合成的自定义 bundle）；
     *   - `bundleId`：内置 bundle 名（minimal/cinematic/editorial/playful）。
     * 都不传时由 `resolveBundleForPresentation(pres)` 推断。
     */
    bundle?: MotionBundle;
    bundleId?: MotionBundleId;
    /**
     * 是否同时写入页间 slide.transition（bundle.slideTransition）。默认 true。
     * 设为 false 表示"只配 entrance，不动 transition"，适合 chat tool 里"用户只想
     * 改入场动画"的场景。
     */
    applySlideTransition?: boolean;
    /**
     * 大纲出场提示。有它时按要点顺序排，并听 page / series。
     * 没有时保持角色权重 + 从上到下、从左到右。
     */
    reveal?: RevealCue;
    /** 整篇生成时按页取大纲。对话里的一键配动画不传。 */
    revealForSlide?: (slideIndex: number) => RevealCue | undefined;
}
/**
 * 基于动画单元 + bundle 为一页计算 effect 列表。
 *
 * 单元内部：全部形状共用 lead 的效果，`withPrevious`、延迟 0，同一次入场。
 * 链路：页内第一拍 `onClick`，其余非并列项 `afterPrevious`（上一拍结束后间隔 gap）。
 * 扩散序列：连续的同一族 / 同一角色单元，以及不在底板里的多段列表，每一项 `onClick`。
 * 排序：叙事层级，同级再按从上到下、从左到右。group 只给组本身一条效果。
 */
export declare function autoAnimateSlide(slide: Slide, opts?: AutoAnimateOptions): AnimationEffectSpec[];
/**
 * 把 bundle 的 slide-to-slide 过渡（如果有）写入 slide.transition。
 * 没有 transition 的 bundle 会显式清掉旧 transition（保证多次切 bundle 时不残留）。
 */
export declare function applyBundleTransitionToSlide(slide: Slide, bundle: MotionBundle): void;
export interface AutoAnimatePresentationResult {
    total: number;
    perSlide: number[];
    /** 最终生效的 bundle id（内置 4 个之一 或 ai_motion_xxx）。 */
    bundleId: string;
    bundleName: string;
}
/**
 * 整篇 Presentation 应用 auto-animate（in-place 修改）。
 *
 * 调用方：generate.ts 在 compile 后调用。也可作为 EditCommand 的实现细节。
 */
export declare function autoAnimatePresentation(pres: {
    slides: Slide[];
    size?: {
        width: number;
        height: number;
    };
    theme?: {
        id?: string;
        colors?: Record<string, string>;
    };
}, opts?: AutoAnimateOptions): AutoAnimatePresentationResult;
/** AI 可配置的角色子集 —— 只挑视觉影响最大的，覆盖大多数主流 deck。 */
export declare const MOTION_SCHEME_CONFIGURABLE_ROLES: readonly ["cover-title", "cover-subtitle", "section-title", "page-title", "bullets", "body", "quote-text", "image", "chart", "stat-value", "closing-title"];
export type MotionSchemeRole = (typeof MOTION_SCHEME_CONFIGURABLE_ROLES)[number];
export declare const MotionSchemeSpecSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodString;
    basedOn: z.ZodEnum<{
        cinematic: "cinematic";
        editorial: "editorial";
        minimal: "minimal";
        playful: "playful";
    }>;
    paceMultiplier: z.ZodNumber;
    rolesOverride: z.ZodObject<{
        "cover-title": z.ZodOptional<z.ZodObject<{
            effect: z.ZodEnum<{
                appear: "appear";
                fade: "fade";
                "fade-down": "fade-down";
                "fade-up": "fade-up";
                "float-up": "float-up";
                glide: "glide";
                wipe: "wipe";
                zoom: "zoom";
                "zoom-soft": "zoom-soft";
            }>;
            durationMs: z.ZodOptional<z.ZodNumber>;
            gapMs: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
        "cover-subtitle": z.ZodOptional<z.ZodObject<{
            effect: z.ZodEnum<{
                appear: "appear";
                fade: "fade";
                "fade-down": "fade-down";
                "fade-up": "fade-up";
                "float-up": "float-up";
                glide: "glide";
                wipe: "wipe";
                zoom: "zoom";
                "zoom-soft": "zoom-soft";
            }>;
            durationMs: z.ZodOptional<z.ZodNumber>;
            gapMs: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
        "section-title": z.ZodOptional<z.ZodObject<{
            effect: z.ZodEnum<{
                appear: "appear";
                fade: "fade";
                "fade-down": "fade-down";
                "fade-up": "fade-up";
                "float-up": "float-up";
                glide: "glide";
                wipe: "wipe";
                zoom: "zoom";
                "zoom-soft": "zoom-soft";
            }>;
            durationMs: z.ZodOptional<z.ZodNumber>;
            gapMs: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
        "page-title": z.ZodOptional<z.ZodObject<{
            effect: z.ZodEnum<{
                appear: "appear";
                fade: "fade";
                "fade-down": "fade-down";
                "fade-up": "fade-up";
                "float-up": "float-up";
                glide: "glide";
                wipe: "wipe";
                zoom: "zoom";
                "zoom-soft": "zoom-soft";
            }>;
            durationMs: z.ZodOptional<z.ZodNumber>;
            gapMs: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
        bullets: z.ZodOptional<z.ZodObject<{
            effect: z.ZodEnum<{
                appear: "appear";
                fade: "fade";
                "fade-down": "fade-down";
                "fade-up": "fade-up";
                "float-up": "float-up";
                glide: "glide";
                wipe: "wipe";
                zoom: "zoom";
                "zoom-soft": "zoom-soft";
            }>;
            durationMs: z.ZodOptional<z.ZodNumber>;
            gapMs: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
        body: z.ZodOptional<z.ZodObject<{
            effect: z.ZodEnum<{
                appear: "appear";
                fade: "fade";
                "fade-down": "fade-down";
                "fade-up": "fade-up";
                "float-up": "float-up";
                glide: "glide";
                wipe: "wipe";
                zoom: "zoom";
                "zoom-soft": "zoom-soft";
            }>;
            durationMs: z.ZodOptional<z.ZodNumber>;
            gapMs: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
        "quote-text": z.ZodOptional<z.ZodObject<{
            effect: z.ZodEnum<{
                appear: "appear";
                fade: "fade";
                "fade-down": "fade-down";
                "fade-up": "fade-up";
                "float-up": "float-up";
                glide: "glide";
                wipe: "wipe";
                zoom: "zoom";
                "zoom-soft": "zoom-soft";
            }>;
            durationMs: z.ZodOptional<z.ZodNumber>;
            gapMs: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
        image: z.ZodOptional<z.ZodObject<{
            effect: z.ZodEnum<{
                appear: "appear";
                fade: "fade";
                "fade-down": "fade-down";
                "fade-up": "fade-up";
                "float-up": "float-up";
                glide: "glide";
                wipe: "wipe";
                zoom: "zoom";
                "zoom-soft": "zoom-soft";
            }>;
            durationMs: z.ZodOptional<z.ZodNumber>;
            gapMs: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
        chart: z.ZodOptional<z.ZodObject<{
            effect: z.ZodEnum<{
                appear: "appear";
                fade: "fade";
                "fade-down": "fade-down";
                "fade-up": "fade-up";
                "float-up": "float-up";
                glide: "glide";
                wipe: "wipe";
                zoom: "zoom";
                "zoom-soft": "zoom-soft";
            }>;
            durationMs: z.ZodOptional<z.ZodNumber>;
            gapMs: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
        "stat-value": z.ZodOptional<z.ZodObject<{
            effect: z.ZodEnum<{
                appear: "appear";
                fade: "fade";
                "fade-down": "fade-down";
                "fade-up": "fade-up";
                "float-up": "float-up";
                glide: "glide";
                wipe: "wipe";
                zoom: "zoom";
                "zoom-soft": "zoom-soft";
            }>;
            durationMs: z.ZodOptional<z.ZodNumber>;
            gapMs: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
        "closing-title": z.ZodOptional<z.ZodObject<{
            effect: z.ZodEnum<{
                appear: "appear";
                fade: "fade";
                "fade-down": "fade-down";
                "fade-up": "fade-up";
                "float-up": "float-up";
                glide: "glide";
                wipe: "wipe";
                zoom: "zoom";
                "zoom-soft": "zoom-soft";
            }>;
            durationMs: z.ZodOptional<z.ZodNumber>;
            gapMs: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    slideTransition: z.ZodObject<{
        kind: z.ZodEnum<{
            [x: string]: string;
        }>;
        durationSec: z.ZodNumber;
    }, z.core.$strip>;
}, z.core.$strip>;
export type MotionSchemeSpec = z.infer<typeof MotionSchemeSpecSchema>;
/**
 * 把 AI 输出的 MotionSchemeSpec 合成一个 MotionBundle：
 *   - basedOn 提供角色基线；rolesOverride 在其上 patch；
 *   - paceMultiplier 替换 basedOn 的 paceMultiplier；
 *   - slideTransition.kind === "cut" 等价于"无过渡"（写 undefined，让 player 走 cut）。
 *
 * 合成 bundle 的 id 形如 `ai_motion_<stamp>`，与内置 id 不冲突；`isBuiltInMotionBundleId`
 * 可用于区分。
 */
export declare function synthesizeBundleFromMotionScheme(spec: MotionSchemeSpec): MotionBundle;
/**
 * 给"主流审美"配套的简短指南。注入到 AI prompt 中，让 LLM 在调用 addAnimation
 * tool 时遵循这些原则。
 *
 * 摘自 .shared/ui-ux-pro-max/data/ux-guidelines.csv "Animation" + "Accessibility"
 * 章节，已浓缩为可读 prompt。
 */
export declare const MAINSTREAM_ANIMATION_GUIDELINES: string;
export {};
