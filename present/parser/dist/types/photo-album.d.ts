import type { PhotoAlbum } from "@sliiu/present-core";
import { type XmlNode } from "./xml.js";
/** ECMA-376 §19.2.1.27 photoAlbum — 相册元数据（presentation.xml 子元素）。 */
export declare function parsePhotoAlbum(presEl: XmlNode | undefined): PhotoAlbum | undefined;
export declare function photoAlbumSnapshot(album: PhotoAlbum | undefined): string;
