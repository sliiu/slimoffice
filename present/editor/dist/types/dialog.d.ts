import type { HyperlinkRef } from "@sliiu/present-core";
import { type BindModalDismissOptions, type ModalDismissHandle } from "@sliiu/present-ui";
export interface DialogOptions<T> {
    title: string;
    buildBody: (body: HTMLDivElement, ctx: DialogCtx<T>) => (() => T | null) | void;
    okLabel?: string;
    cancelLabel?: string;
    okEnabled?: boolean;
    /** 只留一个确认按钮。 */
    hideCancel?: boolean;
    width?: number;
}
export interface DialogCtx<T> {
    doc: Document;
    close: (value: T | null) => void;
    setOkEnabled: (enabled: boolean) => void;
    triggerSubmit: () => void;
}
/** Editor task dialog: backdrop, Esc, Enter, title close, and one task at a time. */
export declare function bindEditorModal(opts: Omit<BindModalDismissOptions, "layer" | "closeLabel"> & {
    closeLabel?: string;
}): ModalDismissHandle;
export declare function showDialog<T>(doc: Document, opts: DialogOptions<T>): Promise<T | null>;
import { WORDART_PRESETS, defaultWordArtState, type WordArtGradient, type WordArtPreset, type WordArtShadowKind, type WordArtState } from "./word-art-presets.js";
export { WORDART_PRESETS, defaultWordArtState, type WordArtGradient, type WordArtPreset, type WordArtShadowKind, type WordArtState, };
export declare function wordArtShadowCss(kind: WordArtShadowKind | null, color: string): string;
export declare function wordArtFillCss(state: Pick<WordArtState, "fillColor" | "fillGradient">): string;
export declare function openWordArtDialog(doc: Document, initial: WordArtState, editing?: boolean): Promise<WordArtState | null>;
export declare function openSymbolPicker(doc: Document): Promise<string | null>;
export interface HyperlinkDialogContext {
    totalSlides: number;
    currentSlideIdx: number;
    existing?: HyperlinkRef | null;
}
export declare function openHyperlinkDialog(doc: Document, context: HyperlinkDialogContext): Promise<HyperlinkRef | "remove" | null>;
export interface TextPromptDialogOptions {
    title: string;
    label?: string;
    placeholder?: string;
    initial?: string;
    /** 默认 true：多行 textarea；false 时用单行 input。 */
    multiline?: boolean;
}
export declare function openTextPromptDialog(doc: Document, opts: TextPromptDialogOptions): Promise<string | null>;
export interface HeaderFooterStyle {
    fontFamily?: string;
    fontSize?: number;
    color?: string;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    align?: "start" | "middle" | "end";
}
export interface HeaderFooterDialogResult {
    headerText: string;
    footerText: string;
    headerStyle: HeaderFooterStyle;
    footerStyle: HeaderFooterStyle;
    applyAll: boolean;
    remove?: boolean;
}
interface HeaderFooterDialogInitial {
    headerText?: string;
    footerText?: string;
    headerStyle?: HeaderFooterStyle;
    footerStyle?: HeaderFooterStyle;
    applyAll?: boolean;
}
export declare function openHeaderFooterDialog(doc: Document, initial?: HeaderFooterDialogInitial): Promise<HeaderFooterDialogResult | null>;
