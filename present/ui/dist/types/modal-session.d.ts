export type ModalLayer = "task" | "confirm";
export interface ModalDismissHandle {
    release: () => void;
}
export interface BindModalDismissOptions {
    doc?: Document;
    overlay: HTMLElement;
    /** Receives the corner close button. */
    panel?: HTMLElement | null;
    onCancel: () => void;
    /**
     * Enter activates this when focus is not in a textarea, button, or editor.
     * Return false to let the event reach the focused control (search boxes).
     */
    onSubmit?: () => boolean | void;
    /** Default true. Return false to ignore this backdrop press. */
    backdropDismiss?: () => boolean;
    /** Default true. Return false to ignore Escape. */
    escapeDismiss?: () => boolean;
    layer?: ModalLayer;
    closeButton?: boolean;
    closeLabel?: string;
}
export declare function bindModalDismiss(opts: BindModalDismissOptions): ModalDismissHandle;
/** Cancel every open session, top first. Used when leaving the editor for playback. */
export declare function dismissAllModals(doc: Document): void;
