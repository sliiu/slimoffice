import type { Paint } from "@sliiu/present-core";
export interface FormatBackgroundDialogOptions {
    getPaint: () => Paint | undefined;
    apply: (next: Paint | undefined) => void;
    /** 幻灯片背景默认图 alpha */
    newImageAlpha?: number;
}
/** Design → Format Background：与 inspector 背景区相同的 paint 编辑器，以对话框呈现。 */
export declare function openFormatBackgroundDialog(doc: Document, opts: FormatBackgroundDialogOptions): void;
