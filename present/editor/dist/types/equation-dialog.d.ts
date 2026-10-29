import "katex/dist/katex.min.css";
import { type Presentation } from "@sliiu/present-core";
export interface EquationDialogResult {
    latex: string;
    displayMode: boolean;
    color: string;
}
export declare function encodeEquationDescr(latex: string, displayMode: boolean): string;
export declare function decodeEquationDescr(descr: string | undefined): {
    latex: string;
    displayMode: boolean;
} | null;
/** 将 LaTeX 渲染为 PNG data URL（插入 image shape）。Office 不渲染 foreignObject SVG。 */
export declare function renderEquationToDataUrl(doc: Document, latex: string, opts?: {
    displayMode?: boolean;
    color?: string;
    fontSize?: number;
}): Promise<{
    src: string;
    natural: {
        w: number;
        h: number;
    };
}>;
/**
 * 打开 / 保存时按 LaTeX 重渲公式图，并去掉旧插入路径多出来的 padding 拉伸。
 */
export declare function rasterizeEquationShapesInPlace(pres: Presentation, doc: Document): Promise<void>;
/** Insert → Equation：KaTeX 公式编辑器。 */
export declare function openEquationDialog(doc: Document, initial?: {
    latex?: string;
    displayMode?: boolean;
}): Promise<EquationDialogResult | null>;
