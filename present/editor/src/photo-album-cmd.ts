import type { EditCommand, PhotoAlbum, Presentation, Slide } from "@ppt/core";
import {
  remapCommentsAfterSlideDelete,
  remapCommentsAfterSlideInsert,
} from "./comment-slide-sync";
import { buildPhotoAlbumSlides, type PhotoAlbumImageInput } from "./photo-album-layout";
import { reindexPresentationSlides } from "./slide-commands";

/** Insert photo-album slides and set `pres.photoAlbum` metadata (undoable). */
export class ApplyPhotoAlbumCmd implements EditCommand {
  readonly label = "Create photo album";
  private prevAlbum?: PhotoAlbum;
  private insertedAt = 0;
  private insertedSlides: Slide[] = [];

  constructor(
    private at: number,
    private images: PhotoAlbumImageInput[],
    private album: PhotoAlbum,
  ) {}

  apply(pres: Presentation): void {
    this.prevAlbum = pres.photoAlbum ? { ...pres.photoAlbum } : undefined;
    this.insertedAt = Math.max(0, Math.min(this.at, pres.slides.length));
    this.insertedSlides = buildPhotoAlbumSlides(pres, this.images, this.album, this.insertedAt);
    if (!this.insertedSlides.length) return;

    for (let i = 0; i < this.insertedSlides.length; i++) {
      remapCommentsAfterSlideInsert(pres, this.insertedAt);
    }
    pres.slides.splice(this.insertedAt, 0, ...this.insertedSlides);
    reindexPresentationSlides(pres);
    pres.photoAlbum = { ...this.album };
  }

  revert(pres: Presentation): void {
    const count = this.insertedSlides.length;
    if (count > 0) {
      for (let i = count - 1; i >= 0; i--) {
        const idx = this.insertedAt + i;
        if (idx >= 0 && idx < pres.slides.length) {
          remapCommentsAfterSlideDelete(pres, idx);
          pres.slides.splice(idx, 1);
        }
      }
      reindexPresentationSlides(pres);
    }
    pres.photoAlbum = this.prevAlbum;
  }
}
