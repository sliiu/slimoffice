import type { CommandStack, Presentation } from "@sliiu/present-core";
export interface AnimationPanelOpts {
    pres: Presentation;
    stack: CommandStack;
    currentSlide(): number;
    getSelection(): string | undefined;
    selectShape?: (id: string | undefined) => void;
    onSelectEffect?: (id: string | null) => void;
    /** 单击刷一次，双击锁定后可连续刷。不传则不显示按钮。 */
    toggleAnimationPainter?: (persistent: boolean) => void;
    animationPainterOn?: () => boolean;
}
export interface AnimationPanelHandle {
    el: HTMLElement;
    destroy(): void;
    refresh(): void;
    openAddPicker(): void;
    selectEffect(id: string | null): void;
    getSelectedId(): string | null;
}
export declare function mountAnimationPanel(parent: HTMLElement, opts: AnimationPanelOpts): AnimationPanelHandle;
