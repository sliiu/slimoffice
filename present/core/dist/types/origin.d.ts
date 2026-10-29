import type { Paint, Stroke } from "./paint.js";
import type { ChartDef } from "./shape.js";
export interface ExplicitRPrSnapshot {
    /**
     * 解析期 run 上的超链接（raw rPr 里确有 `<a:hlinkClick>` / `<a:hlinkHover>` 时才有）。
     * serializer 用它区分「原本就带链接、没被编辑」与「用户新加 / 改了链接」：
     * 前者必须保留原始 `r:id` 字节，否则每次保存都会重登记一条关系、并把作者显式
     * 的 `<a:srgbClr>` 覆写成主题 hlink 色。
     */
    hyperlink?: {
        kind: string;
        target?: string;
        sound?: boolean;
        highlightClick?: boolean;
        endSnd?: boolean;
    };
    hoverLink?: {
        kind: string;
        target?: string;
        sound?: boolean;
        highlightClick?: boolean;
        endSnd?: boolean;
    };
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: number;
    italic?: boolean;
    underline?: string | boolean;
    color?: string;
    /** raw rPr 上显式 `<a:ln>` 的指纹；缺省表示原 XML 没有文字描边。 */
    textOutline?: {
        width: number;
        color?: string;
    };
    /** raw rPr 上显式 `<a:effectLst>` 的指纹。 */
    effects?: Array<{
        kind: string;
        color?: string;
    }>;
    strikethrough?: "single" | "double";
    letterSpacing?: number;
    highlight?: string;
    caps?: "none" | "small" | "all";
}
export interface GroupFrameOrigin {
    offX: number;
    offY: number;
    scaleX: number;
    scaleY: number;
}
export interface ShapeOrigin {
    fill?: Paint;
    stroke?: Stroke;
    src?: string;
    opacity?: number;
    bbox?: {
        x: number;
        y: number;
        w: number;
        h: number;
    };
    chart?: ChartDef;
    meta3D?: import("./three-d.js").Sp3DInfo;
    /**
     * 解析期 effectLst 深拷贝 —— SetShapeEffectsCmd 后用于判断 `<a:effectLst>` 是否需重写。
     *
     * 必需，因为 `shape.effects` 里混着两种来源：raw `<a:spPr>/<a:effectLst>` 里显式写的，
     * 和从 `<p:style>/<a:effectRef>` 解析出来的**主题继承**效果。没有基线就无法区分，
     * 会把继承来的阴影烘焙进 spPr（切主题时不再跟随），或反过来把显式阴影整段删掉。
     */
    effects?: import("./shape.js").ShapeEffect[];
}
export interface RunOrigin {
    explicitRPr?: ExplicitRPrSnapshot;
}
export type OriginRecord = ShapeOrigin & RunOrigin;
export type DirtyField = "bbox" | "transform" | "opacity" | "visible" | "fill" | "stroke" | "text" | "textStyle" | "paragraph" | "background" | "src" | "name" | "chart" | "meta3D" | "effects";
export declare function getOrigin<T extends OriginRecord = OriginRecord>(obj: unknown): T | undefined;
export declare function setOrigin(obj: object, patch: Partial<OriginRecord>): void;
export declare function preserveOrigin<T extends object>(target: T, source: unknown): T;
export declare function markDirty(obj: object, field: DirtyField): void;
export declare function getDirty(obj: unknown): Set<DirtyField> | undefined;
export declare function isDirty(obj: unknown, field: DirtyField): boolean;
export declare function clearDirty(obj: object, field?: DirtyField): void;
