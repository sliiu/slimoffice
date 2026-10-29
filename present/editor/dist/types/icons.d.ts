/** 未指定或无法解析时的默认 Lucide 图标 id（kebab-case）。 */
export declare const DEFAULT_LUCIDE_ICON = "puzzle";
/** Ribbon / Inspector 对齐与变换按钮的图标名（保持既有 API）。 */
export type IconName = "alignParaLeft" | "alignParaCenter" | "alignParaRight" | "alignParaJustify" | "alignLeft" | "alignCenterH" | "alignRight" | "alignTop" | "alignCenterV" | "alignBottom" | "distributeH" | "distributeV" | "flipH" | "flipV" | "rotatePlus90" | "rotateMinus90";
/** 将用户 / 历史配置规范为 Lucide kebab-case id。 */
export declare function normalizeLucideIconName(raw?: string | null): string;
/**
 * 创建 Lucide SVG 节点（currentColor 跟随父级 color）。
 * 使用传入的 `doc` 创建元素，以便在 iframe / shadow DOM 中正确挂载。
 */
export declare function lucideSvg(doc: Document, name: string, size?: number): SVGElement;
/** 将容器内容替换为单个 Lucide 图标。 */
export declare function fillLucideIcon(doc: Document, el: HTMLElement, iconName: string, size?: number): void;
/** Ribbon / Inspector 专用：按既有 IconName 创建 SVG。 */
export declare function svgIcon(doc: Document, name: IconName, size?: number): SVGElement;
/** 向容器追加 Lucide 图标，返回 SVG。 */
export declare function appendLucideIcon(doc: Document, parent: HTMLElement, iconName: string, size?: number, className?: string): SVGElement;
/** 图标 + 文案（inline-flex），用于 Tab / 标题等。 */
export declare function appendLabelWithIcon(doc: Document, parent: HTMLElement, iconName: string, text: string, iconSize?: number): void;
/** 仅图标的按钮。 */
export declare function mkLucideIconButton(doc: Document, iconName: string, className: string, title?: string, size?: number): HTMLButtonElement;
/** 将按钮内容替换为单个 Lucide 图标（用于 play/pause 切换等）。 */
export declare function setButtonLucideIcon(doc: Document, btn: HTMLButtonElement, iconName: string, size?: number): void;
/** 图标 + 可选文案的按钮。 */
export declare function mkLucideButton(doc: Document, iconName: string, label: string, className: string, title?: string, iconSize?: number): HTMLButtonElement;
