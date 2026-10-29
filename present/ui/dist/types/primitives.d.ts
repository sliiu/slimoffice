import { type ModalLayer } from "./modal-session.js";
export type ButtonVariant = "default" | "secondary" | "outline" | "ghost" | "destructive" | "brand";
export type ButtonSize = "default" | "sm" | "lg" | "icon";
export interface MkButtonOptions {
    variant?: ButtonVariant;
    size?: ButtonSize;
    title?: string;
    type?: "button" | "submit" | "reset";
    disabled?: boolean;
    onClick?: (ev: MouseEvent) => void;
    /** Document to create in (iframe / shadow DOM safe). Defaults to global document. */
    doc?: Document;
}
export declare function mkButton(label: string, opts?: MkButtonOptions): HTMLButtonElement;
export interface MkFieldOptions {
    label?: string;
    hint?: string;
    type?: string;
    value?: string;
    placeholder?: string;
    multiline?: boolean;
    /** When set, renders a `<select>` instead of an input. */
    options?: Array<{
        value: string;
        label?: string;
    }>;
    doc?: Document;
}
export interface MkFieldResult {
    field: HTMLDivElement;
    input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
}
export declare function mkField(opts?: MkFieldOptions): MkFieldResult;
export declare function mkPanel(opts?: {
    doc?: Document;
    card?: boolean;
}): HTMLDivElement;
export interface MkModalOptions {
    title?: string;
    doc?: Document;
    /** 点击遮罩 / Esc 是否关闭，默认 true。 */
    dismissable?: boolean;
    onClose?: () => void;
    /** Enter 激活。返回 false 时把 Enter 留给当前输入框。 */
    onSubmit?: () => boolean | void;
    /** task 会关掉已打开的任务对话框；confirm 叠在上面。默认 task。 */
    layer?: ModalLayer;
    closeLabel?: string;
}
export interface MkModalResult {
    overlay: HTMLDivElement;
    modal: HTMLDivElement;
    body: HTMLDivElement;
    foot: HTMLDivElement;
    /** 挂到 host（默认 document.body）并返回 close()。 */
    open: (host?: HTMLElement) => () => void;
    close: () => void;
}
export declare function mkModal(opts?: MkModalOptions): MkModalResult;
export type ToastKind = "ok" | "err" | "info";
export interface ShowToastAction {
    label: string;
    onClick: () => void;
}
export interface ShowToastOptions {
    kind?: ToastKind;
    /** 0 keeps the toast until `dismissToast` or a later `showToast`. */
    durationMs?: number;
    doc?: Document;
    action?: ShowToastAction;
    /** Lets `dismissToast` ignore a toast that has already been replaced. */
    token?: string;
}
/** Hide the current toast. With a token, a replacement toast is left alone. */
export declare function dismissToast(token?: string, doc?: Document): void;
/** Lightweight status toast above modal overlays. Replaces the previous toast if still visible. */
export declare function showToast(message: string, opts?: ShowToastOptions): void;
