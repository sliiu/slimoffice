import type { PptxArchive } from "./zip.js";
import { type XmlNode } from "./xml.js";
export interface Relationship {
    id: string;
    type: string;
    target: string;
    targetMode?: string;
}
export interface RelMap {
    byId: Map<string, Relationship>;
    list: Relationship[];
    ownerPath: string;
    resolve(id: string): string | undefined;
}
export declare function loadRels(archive: PptxArchive, partPath: string): RelMap;
export interface ContentTypes {
    defaults: Map<string, string>;
    overrides: Map<string, string>;
    find(path: string): string | undefined;
}
export declare function loadContentTypes(archive: PptxArchive): ContentTypes;
export declare function findPresentationPath(archive: PptxArchive): string;
export declare function loadXmlPart(archive: PptxArchive, path: string): XmlNode | undefined;
