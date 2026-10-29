import type { Shape, TextRun, TextShape } from "@sliiu/present-core";
import type { TextCharRange } from "./text-char-style.js";
export interface TextOverlayBox {
    /** 相对 stage 左上角的 px（已乘 stageScale）。 */
    left: number;
    top: number;
    width: number;
    height: number;
    /** §21.1.2.1.1 lIns/tIns/rIns/bIns 换算后的 padding（px）。 */
    pad: {
        l: number;
        t: number;
        r: number;
        b: number;
    };
    /** 绕 box 中心的总旋转角（deg）。 */
    rotation: number;
}
/**
 * 计算 overlay 的几何：与 renderer 的 inner box 完全对齐。
 *
 * vert/vert270 时 renderer 把排版放在"旋转前坐标系"里做，宽高互换且 inner box
 * 绕 bbox 中心居中；这里用"box 宽高互换 + 对称 padding"复现同一个 inner box：
 * padLeft = padRight = (tIns + bIns) / 2 恰好等于 renderer 的 (w − innerW) / 2。
 */
export declare function textOverlayBox(s: TextShape, scale: number): TextOverlayBox;
/** 把 overlay 的位置 / 尺寸 / 旋转写到 style 上；缩放变化时可重复调用。 */
export declare function applyTextOverlayBox(el: HTMLElement, s: TextShape, scale: number, origin: {
    x: number;
    y: number;
}, ancestors?: readonly Shape[]): TextOverlayBox;
/**
 * 构造 overlay 元素并按 shape 的容器级样式（背景 / 描边 / 阴影 / vAlign / 换行 /
 * 溢出 / 竖排）铺好，再把 paragraphs 渲染进去。
 *
 * 不设 outline/border 之外的任何"编辑态装饰"：焦点环用 outline 画在 border box
 * 外侧，不占布局、不挤压文字，因此不会改变文字位置。
 */
export declare function buildTextEditOverlay(opts: {
    doc: Document;
    shape: TextShape;
    scale: number;
    origin: {
        x: number;
        y: number;
    };
    spellcheck: boolean;
    lang: string;
    /** 从外到内的祖先 group；旋转/翻转挂在这些节点上时必须传入，否则 overlay 对不齐。 */
    ancestors?: readonly Shape[];
}): HTMLDivElement;
/**
 * 把 paragraphs 渲染成"每段一个 div，每 run 一个 span"。
 * `fontScale` 供 normAutofit 的运行时缩放二次调用（见 fitOverlayAutofit）。
 */
export declare function renderParagraphsInto(editor: HTMLElement, s: TextShape, scale: number, doc: Document, fontScale?: number): void;
export declare function applyRunStyle(span: HTMLSpanElement, run: TextRun, fontPxScale: number, geomScale: number, fallbackFs: number): void;
/**
 * §21.1.2.1.1 normAutofit 的运行时缩放：文字排不下时 renderer 会迭代缩小字号
 * （下限 25%，溢出 5% 以内视为测量误差不动）。overlay 直接用浏览器布局测高，
 * 按同样的规则重排，避免"渲染时是缩小后的字号、双击后弹回原始大字号"。
 *
 * 必须在 overlay 已插入文档（有布局）之后调用。返回最终采用的 fontScale。
 */
export declare function fitOverlayAutofit(editor: HTMLElement, s: TextShape, scale: number, doc: Document): number;
/**
 * 让 overlay 每段的**首行基线**落到 renderer 算出的同一位置。
 *
 *   renderer：baseline = 段顶 + (行高 − 0.25 × fs)   （text-layout.ts 的 ascent 近似）
 *   CSS：     baseline = 段顶 + half-leading + 字体 ascent（取决于字体真实 metrics）
 *
 * 两者相差 1~2px —— 双击进入编辑时文字会"跳一下"。这里用零尺寸 inline-block 探针
 * 量出 CSS 的实际基线，再用 `position:relative; top` 做**纯视觉**补偿：不改变布局盒
 * 尺寸，所以 vAlign top/middle/bottom 与后续段落的堆叠位置都不受影响。
 *
 * 必须在 overlay 已插入文档、且 fitOverlayAutofit 重排完之后调用。
 */
export declare function alignOverlayBaselines(editor: HTMLElement, s: TextShape, scale: number, doc: Document, fontScale?: number): void;
/**
 * 把光标放进 overlay：优先落在鼠标双击的那个字符位置（原生文本框的手感），
 * 拿不到命中点时折叠到文末。
 *
 * 不做全选：全选会给整段文字盖一层选区高亮（视觉上"文字变了"），而且用户接着
 * 敲第一个字就会把整段内容替换掉。
 */
export declare function placeCaretIn(editor: HTMLElement, doc: Document, at?: {
    clientX: number;
    clientY: number;
}): void;
/** 把编辑框里的非折叠选区换成段落内的字符区间。竖排堆叠不拆。 */
export declare function textCharRangesFromSelection(editor: HTMLElement, sel: Selection): TextCharRange[] | null;
/** 拖动取色时只给选区里的字上色，不改模型。 */
export declare function paintEditorRangeColor(editor: HTMLElement, ranges: readonly TextCharRange[], color: string): void;
export declare function selectTextCharRanges(editor: HTMLElement, ranges: readonly TextCharRange[]): void;
/**
 * 字符选区的底色。编辑框没有焦点时系统选中色不画，字号和字体框却必须留着焦点，
 * 所以这里另画一层，不跟着焦点走。编辑框自己有焦点时不要调用，避免和系统选中色叠两层。
 */
export declare function paintPinnedCharSelection(editor: HTMLElement, ranges: readonly TextCharRange[]): void;
export declare function clearPinnedCharSelection(doc: Document): void;
export declare function readEditorParagraphs(editor: HTMLElement): string[];
