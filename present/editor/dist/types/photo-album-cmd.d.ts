import type { EditCommand, PhotoAlbum, Presentation } from "@sliiu/present-core";
import { type PhotoAlbumImageInput } from "./photo-album-layout.js";
/** Insert photo-album slides and set `pres.photoAlbum` metadata (undoable). */
export declare class ApplyPhotoAlbumCmd implements EditCommand {
    private at;
    private images;
    private album;
    readonly label = "Create photo album";
    private prevAlbum?;
    private insertedAt;
    private insertedSlides;
    constructor(at: number, images: PhotoAlbumImageInput[], album: PhotoAlbum);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
