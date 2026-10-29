import type { Shape } from "@sliiu/present-core";
import { type Scene } from "./scene-node.js";
export interface SvgBackendOptions {
    shapeFilter?: (s: Shape) => boolean;
    transparent?: boolean;
    /**
     * Thumbnail / sorter / presenter preview. Video, audio, and web embeds
     * become static placeholders — no live `<iframe>` or media element.
     * Cross-origin iframes swallow pointer events (the parent never sees the
     * click) and would load YouTube/Vimeo in every visible thumbnail.
     */
    preview?: boolean;
    /**
     * 默认按幻灯片视口裁切。编辑器普通视图传 false，让伸出幻灯片的形状
     * 画到周围的灰色工作区。放映、缩略图、阅读视图保持裁切。
     */
    clipToSlide?: boolean;
}
export declare class SvgBackend {
    readonly root: SVGSVGElement;
    private defs;
    private bindings;
    private scene;
    private readonly uid;
    private rafId;
    private dispose;
    private shapeFilter;
    private preview;
    private measureCtx;
    private textFxSeq;
    private textInnerFilters;
    private getMeasureCtx;
    constructor(scene: Scene, container: HTMLElement, opts?: SvgBackendOptions);
    private scheduleRedraw;
    /**
     * 同步刷新当前 scene 到 DOM，并取消 pending rAF。
     * 主要用于编辑器中切换/重建 backend 时，确保新 backend 的视觉在旧 backend
     * 被销毁前已经写入 DOM，避免出现"先空一帧再绘制"的闪屏。
     */
    flush(): void;
    private mount;
    private createShapeEl;
    private redraw;
    private applyShapeEffects;
    private ensureEffectFilter;
    private applyReflection;
    /** 离屏 3D：用 baked PNG 替换矢量或文字。image 的未烘焙分支仍走 applyShapeAttrs。 */
    private paintBaked3D;
    private applyShapeAttrs;
    private renderMedia;
    private renderWebEmbed;
    private renderPreviewPoster;
    /** Static tile used when `preview` is on — no live iframe / video / audio. */
    private renderMediaPlaceholder;
    private renderText;
    /**
     * 艺术字：把已画出的墨迹外接矩形拉到形状框。
     */
    private applyWordArtFit;
    /** 字形墨迹，不含 em 方框上下的空档。getBBox 含整格，拉满后笔画仍缩在框里。 */
    private wordArtInkBox;
    private wordArtFallbackBox;
    private renderTextWarped;
    private renderTextHorizontal;
    private layoutParagraphHoriz;
    private distributeParagraphsAcrossColumns;
    private renderHorizontalParagraph;
    private renderTextStacked;
    private renderStackedColumn;
    /**
     * Run-level innerShdw / reflection. Outer shadow and glow stay on the CSS
     * filter from pickRunEffectsCssFilter. Inner shadow is an SVG filter; reflection
     * is a mirrored <use> under the paragraph.
     */
    private attachTextRunEffects;
    private ensureTextInnerFilter;
    private renderBullet;
    private applyRunStyle;
    private renderParaSegmented;
    private renderTextRunsWithOverrides;
    private applyImageClip;
    private removeImageClip;
    private applyImageStroke;
    private applyCharClip;
    private applyParaClip;
    private applyClip;
    destroy(): void;
}
