import type { Presentation, ViewGuides } from "@sliiu/present-core";
export declare const REL_TYPE_VIEW_PROPS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/viewProps";
export declare const CT_VIEW_PROPS = "application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml";
type MutableArchive = {
    files: Map<string, Uint8Array>;
};
export declare function renderViewPropsXml(g: ViewGuides): string;
/** from-scratch：把 `pres.viewGuides` 写成 `ppt/viewProps.xml`。 */
export declare function injectScratchViewProps(pres: Presentation, files: Record<string, string>): void;
/** round-trip：仅当参考线 / 网格开关相对解析快照有改动时 patch viewProps。 */
export declare function patchViewProps(pres: Presentation, archive: MutableArchive, opts?: {
    debug?: boolean;
}): void;
export {};
