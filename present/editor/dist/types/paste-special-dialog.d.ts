export type PasteSpecialMode = "default" | "inPlace" | "plain";
/** 选择性粘贴：与 ribbon 分栏菜单同一套 `ppt-ribbon-menu` 浮层。 */
export declare function openPasteSpecialDialog(doc: Document, onPick: (mode: PasteSpecialMode) => void, anchor?: HTMLElement): void;
