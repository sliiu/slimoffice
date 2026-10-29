import type { Presentation, Template } from "@sliiu/present-core";
export declare class SampleDeckError extends Error {
    readonly code: "empty" | "unreadable";
    constructor(code: "empty" | "unreadable");
}
export declare function compositionDigest(pres: Presentation): string;
export declare function sampleOutlineRule(digest: string): string;
/** 版式上已有文字占位符时，页上那一层只约束大纲疏密，不改占位符，不搬装饰。 */
export declare function sampleDensityRule(digest: string): string;
export declare function sampleCanvasRule(): string;
/** 有幻灯片就把构图说明挂上模板；没有幻灯片则原样返回，不当作失败。 */
export declare function withPageComposition(template: Template, pres: Presentation): Template;
