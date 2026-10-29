import type { Shape, SlideLayout, SlideMaster } from "@sliiu/present-core";
import type { MediaRegistrar } from "./media-table.js";
/** master/layout media 项（来自 MediaTable.list() / SlideMediaTable.list()）。 */
export interface PartMediaItem {
    name: string;
    relId: string;
    relType?: string;
    src?: string;
    external?: boolean;
}
export declare function renderShapesXml(shapes: Shape[], media: MediaRegistrar): string;
/** ECMA-376 §19.3.1.27 notesMaster：cSld + clrMap + notesStyle。 */
export declare function renderNotesMasterFromIr(master: SlideMaster, media: MediaRegistrar, pageSize?: {
    width: number;
    height: number;
}): string;
/** ECMA-376 §19.3.1.20 handoutMaster：cSld + clrMap + hf。 */
export declare function renderHandoutMasterFromIr(master: SlideMaster, media: MediaRegistrar, pageSize?: {
    width: number;
    height: number;
}): string;
/** notesMaster / handoutMaster rels：theme + 部件内图片。 */
export declare function renderAuxMasterRelsXml(themeIdx: number, mediaItems?: PartMediaItem[]): string;
export declare function renderSlideMasterXml(master: SlideMaster, layoutRefs: Array<{
    relId: string;
    layoutIdx: number;
}>, media: MediaRegistrar, slideSize?: {
    width: number;
    height: number;
}): string;
export declare function renderMasterRelsXml(layoutRefs: Array<{
    relId: string;
    layoutIdx: number;
}>, themeIdx: number, mediaItems?: PartMediaItem[]): string;
/**
 * 把任意 layout type 收敛到 ST_SlideLayoutType 封闭枚举：已知别名映射，其他未知值写 cust，
 * 缺省 blank。round-trip 与 from-scratch 共用，否则 PowerPoint 按 schema 拒收整个 layout part。
 */
export declare function ooxmlSlideLayoutType(type: string | undefined): string;
export declare function renderSlideLayoutXml(layout: SlideLayout, media: MediaRegistrar, slideSize?: {
    width: number;
    height: number;
}): string;
export declare function renderLayoutRelsXml(masterIdx: number, mediaItems?: PartMediaItem[]): string;
