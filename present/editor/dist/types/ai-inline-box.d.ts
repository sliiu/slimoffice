import type { MessageKey } from "./i18n.js";
import { type ScreenRect } from "./selection-format-bar.js";
export interface AiInlineUi {
    /** 处理中，停止时调用 stop。 */
    running(stop: () => void): void;
    /** 助手正忙，这条没有发送。 */
    busy(): void;
    failed(message: string): void;
    /** 改完了。reply 是模型最后一段回复，可为空。 */
    done(reply: string): void;
    /** 已停下。 */
    clear(): void;
}
export interface AiInlineBoxView {
    visible: boolean;
    /** 选区变了就换一个 key，上一轮的提示随之收起。 */
    targetKey: string;
    anchor: ScreenRect | null;
    view: ScreenRect | null;
    viewport: {
        w: number;
        h: number;
    };
    /** 格式条所在位置，框不压在它上面。 */
    avoid: ScreenRect | null;
}
export interface AiInlineBoxActions {
    label: (key: MessageKey) => string;
    submit: (text: string, ui: AiInlineUi) => void;
    /** 本轮结束（改完、失败、停下或正忙）。 */
    settled: () => void;
    exit: () => void;
}
export interface AiInlineBox {
    el: HTMLElement;
    sync: (view: AiInlineBoxView) => void;
    focus: () => void;
    destroy: () => void;
}
export declare function mountAiInlineBox(doc: Document, actions: AiInlineBoxActions): AiInlineBox;
