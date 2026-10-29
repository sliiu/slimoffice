"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApplyPhotoAlbumCmd = void 0;
const comment_slide_sync_1 = require("./comment-slide-sync");
const photo_album_layout_1 = require("./photo-album-layout");
const slide_commands_1 = require("./slide-commands");
/** Insert photo-album slides and set `pres.photoAlbum` metadata (undoable). */
class ApplyPhotoAlbumCmd {
    at;
    images;
    album;
    label = "Create photo album";
    prevAlbum;
    insertedAt = 0;
    insertedSlides = [];
    constructor(at, images, album) {
        this.at = at;
        this.images = images;
        this.album = album;
    }
    apply(pres) {
        this.prevAlbum = pres.photoAlbum ? { ...pres.photoAlbum } : undefined;
        this.insertedAt = Math.max(0, Math.min(this.at, pres.slides.length));
        this.insertedSlides = (0, photo_album_layout_1.buildPhotoAlbumSlides)(pres, this.images, this.album, this.insertedAt);
        if (!this.insertedSlides.length)
            return;
        for (let i = 0; i < this.insertedSlides.length; i++) {
            (0, comment_slide_sync_1.remapCommentsAfterSlideInsert)(pres, this.insertedAt);
        }
        pres.slides.splice(this.insertedAt, 0, ...this.insertedSlides);
        (0, slide_commands_1.reindexPresentationSlides)(pres);
        pres.photoAlbum = { ...this.album };
    }
    revert(pres) {
        const count = this.insertedSlides.length;
        if (count > 0) {
            for (let i = count - 1; i >= 0; i--) {
                const idx = this.insertedAt + i;
                if (idx >= 0 && idx < pres.slides.length) {
                    (0, comment_slide_sync_1.remapCommentsAfterSlideDelete)(pres, idx);
                    pres.slides.splice(idx, 1);
                }
            }
            (0, slide_commands_1.reindexPresentationSlides)(pres);
        }
        pres.photoAlbum = this.prevAlbum;
    }
}
exports.ApplyPhotoAlbumCmd = ApplyPhotoAlbumCmd;
