import type { PhotoAlbum } from "@sliiu/present-core";
import type { PhotoAlbumImageInput } from "./photo-album-layout.js";
export interface PhotoAlbumDialogResult {
    images: PhotoAlbumImageInput[];
    album: PhotoAlbum;
}
export declare function openPhotoAlbumDialog(doc: Document, onApply: (result: PhotoAlbumDialogResult) => void): void;
