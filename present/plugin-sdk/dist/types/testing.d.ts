import type { PluginContext, ShapeInfo, SlideInfo } from "./types.js";
export interface MockPluginContextOptions {
    slideCount?: number;
    /** 自定义 slide info（slideCount 会以此长度为准）。 */
    slides?: SlideInfo[];
    /** Presentation 标题。 */
    title?: string;
    /** Slide 尺寸。 */
    size?: {
        width: number;
        height: number;
    };
    /** 提供一个真实的 document（jsdom 注入）。不传则使用最小 stub。 */
    document?: Document;
    /** 宿主 UI 语言（默认 "en"）。 */
    locale?: string;
    /** 当前 slide 的 shape 快照（供 ctx.scene 返回；测试单选题等逻辑用）。 */
    shapes?: ShapeInfo[];
}
interface MockResult extends PluginContext {
    /** 触发 slidechange 事件（测试用）。 */
    fireSlideChange(visibleIndex: number): void;
    /** 触发 stepchange 事件（测试用）。 */
    fireStepChange(currentStep: number, totalSteps: number): void;
    /** 直接读控制 API 调用历史。 */
    readonly calls: Readonly<MockCallLog>;
}
export interface MockCallLog {
    next: number;
    prev: number;
    goto: number[];
    gotoById: string[];
    nextStep: number;
    triggerShape: string[];
    freezeActive: number;
    setNavigationLocked: boolean[];
    setVisible: Array<{
        id: string;
        visible: boolean;
    }>;
    setOpacity: Array<{
        id: string;
        opacity: number;
    }>;
}
export declare function createMockPluginContext(opts?: MockPluginContextOptions): MockResult;
export {};
