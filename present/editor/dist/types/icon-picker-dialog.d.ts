import { encodeIconDescr, decodeIconDescr } from "./icon-descr.js";
export { encodeIconDescr, decodeIconDescr };
export interface IconPickerResult {
    iconId: string;
    color: string;
}
/** Insert → Icons：从 Lucide 库挑选矢量图标。更换已有图标时带上当前颜色和标题。 */
export declare function openIconPickerDialog(doc: Document, opts?: {
    color?: string;
    title?: string;
}): Promise<IconPickerResult | null>;
