import type { TextRun } from "@sliiu/present-core";
import { type XmlNode } from "./xml.js";
export interface OmmlMarkup {
    latex: string;
    plain: string;
}
export interface MathTreeFlags {
    hasOmml: boolean;
    hasPlainText: boolean;
    hasPicture: boolean;
}
export declare function inspectMathMarkup(node: XmlNode | undefined): MathTreeFlags;
export declare function extractOmmlFrom(node: XmlNode | undefined): OmmlMarkup | null;
export declare function ommlToLatex(node: XmlNode): string;
export declare function ommlToPlain(node: XmlNode): string;
/** 把 OMML 容器（a14:m / oMathPara / oMath）变成一个 text run。 */
export declare function ommlToTextRun(node: XmlNode, runProps?: Partial<TextRun>): TextRun | null;
export declare function firstMathRunProps(node: XmlNode | undefined): XmlNode | undefined;
