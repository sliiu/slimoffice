import type { Presentation, SlideMaster } from "@sliiu/present-core";
import type { MediaRegistrar } from "./media-table.js";
import { type PartMediaItem } from "./pptx-master-layout.js";
export interface NotesPlan {
    /** slideIdx(0-based) → notesSlide 部件编号（1-based）。 */
    notesIdxBySlide: Map<number, number>;
    /** 是否需要产出 notesSlide 部件。 */
    hasNotes: boolean;
    /** 是否需要 notesMaster 部件（有备注文本，或 IR 里有 notesMasters）。 */
    hasNotesMaster: boolean;
    /** 是否需要 handoutMaster 部件。 */
    hasHandoutMaster: boolean;
}
export declare function planNotes(pres: Presentation): NotesPlan;
/**
 * notesSlide 部件：最小合法结构 —— slide image 占位符 + notes body 占位符。
 * 备注文本按换行拆段。坐标基于 notesSz（纵向页：宽 = slide 高，高 = slide 宽）。
 */
export declare function renderNotesSlideXml(notes: string, slideSize: {
    width: number;
    height: number;
}): string;
export declare function renderNotesSlideRelsXml(slideIdx1Based: number): string;
/** notesMaster：有 IR 则写出形状/背景/页眉页脚；否则最小合法骨架。 */
export declare function renderNotesMasterXml(master?: SlideMaster, media?: MediaRegistrar, pageSize?: {
    width: number;
    height: number;
}): string;
export declare function renderNotesMasterRelsXml(themeIdx: number, mediaItems?: PartMediaItem[]): string;
