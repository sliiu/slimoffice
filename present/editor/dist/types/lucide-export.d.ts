/** 全部 Lucide 图标 id（kebab-case，按字母序）。 */
export declare function listLucideIconIds(): string[];
export declare const POPULAR_LUCIDE_ICONS: readonly ["home", "user", "users", "heart", "star", "mail", "phone", "calendar", "clock", "map-pin", "search", "settings", "bell", "camera", "image", "video", "music", "file-text", "folder", "download", "upload", "share-2", "link", "check", "x", "plus", "minus", "arrow-right", "chevron-right", "circle-check", "circle-alert", "lightbulb", "zap", "globe", "lock", "unlock", "eye", "eye-off", "trash-2", "pencil", "chart-column", "table", "layout-grid", "message-circle", "smartphone", "laptop", "wifi", "cloud", "sun", "moon"];
/** Lucide 图标的 SVG data URL。未知 id 返回 null，不换成别的图标。不需要 DOM。 */
export declare function lucideIconSvgDataUrl(iconName: string, opts?: {
    size?: number;
    color?: string;
    strokeWidth?: number;
}): string | null;
/** 将 Lucide 图标渲染为可插入幻灯片的 SVG data URL。 */
export declare function lucideIconToDataUrl(doc: Document, iconName: string, opts?: {
    size?: number;
    color?: string;
    strokeWidth?: number;
}): string;
/** 将 Lucide 图标栅格成 PNG data URL，给 OOXML `a:blip` 回退用。失败时退回 SVG。 */
export declare function lucideIconToPngDataUrl(doc: Document, iconName: string, opts?: {
    size?: number;
    color?: string;
    strokeWidth?: number;
}): Promise<string>;
/** 预览用小图标（复用 lucideSvg）。 */
export { lucideSvg } from "./icons.js";
