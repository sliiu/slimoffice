import type { Shape, SmartArtItem, SmartArtLayoutKind } from "@sliiu/present-core";
export declare const DGM_GRAPHIC_URI = "http://schemas.openxmlformats.org/drawingml/2006/diagram";
export declare const REL_DIAGRAM_DATA = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramData";
export declare const REL_DIAGRAM_LAYOUT = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramLayout";
export declare const REL_DIAGRAM_STYLE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramQuickStyle";
export declare const REL_DIAGRAM_COLORS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramColors";
export declare const REL_DIAGRAM_DRAWING = "http://schemas.microsoft.com/office/2007/relationships/diagramDrawing";
export declare const CT_DIAGRAM_DATA = "application/vnd.openxmlformats-officedocument.drawingml.diagramData+xml";
export declare const CT_DIAGRAM_LAYOUT = "application/vnd.openxmlformats-officedocument.drawingml.diagramLayout+xml";
export declare const CT_DIAGRAM_COLORS = "application/vnd.openxmlformats-officedocument.drawingml.diagramColors+xml";
export declare const CT_DIAGRAM_STYLE = "application/vnd.openxmlformats-officedocument.drawingml.diagramStyle+xml";
export declare const CT_DIAGRAM_DRAWING = "application/vnd.ms-office.drawingml.diagramDrawing+xml";
export declare const SLIMPPT_LAYOUT_URN = "urn:slimppt:smartart/";
/** 把 slide 绝对坐标折成 graphicFrame / drawing 局部坐标。 */
export declare function offsetShapeTree(s: Shape, dx: number, dy: number): Shape;
export interface DiagramRelIds {
    dm: string;
    lo: string;
    qs: string;
    cs: string;
}
export declare function layoutUniqueId(layout: SmartArtLayoutKind): string;
export declare function catForSmartArtLayout(layout: SmartArtLayoutKind): string;
export declare function renderSmartArtDrawingXml(bbox: {
    w: number;
    h: number;
}, childrenPmlXml: string): string;
export declare function renderSmartArtDataXml(items: SmartArtItem[]): string;
export declare function renderSmartArtLayoutXml(layout: SmartArtLayoutKind): string;
export declare function renderSmartArtColorsXml(): string;
export declare function renderSmartArtQuickStyleXml(): string;
export declare function renderDiagramDataRelsXml(drawingFile: string): string;
export declare function renderDiagramDrawingRelsXml(mediaItems: Array<{
    name: string;
    relId: string;
}>): string;
export declare function buildSmartArtPartFiles(opts: {
    idx: number;
    layout: SmartArtLayoutKind;
    items: SmartArtItem[];
    bbox: {
        w: number;
        h: number;
    };
    childrenXml: string;
    drawingMedia: Array<{
        name: string;
        relId: string;
    }>;
}): Record<string, string>;
export declare function diagramContentTypeRows(idx: number): Array<{
    part: string;
    ct: string;
}>;
export declare function diagramSlideRelsXml(items: Array<{
    idx: number;
} & DiagramRelIds>): string;
