import { type PhotoAlbum, type Presentation, type Slide } from "@sliiu/present-core";
export type PhotoAlbumLayoutId = "fitToSlide" | "2pic" | "4pic";
export interface PhotoAlbumImageInput {
    src: string;
    natural?: {
        w: number;
        h: number;
    };
    caption?: string;
}
export declare function imagesPerSlide(layout: string | undefined): number;
export declare function gridForLayout(layout: string | undefined): {
    cols: number;
    rows: number;
};
/** Build one slide per batch of images according to `album.layout`. */
export declare function buildPhotoAlbumSlides(pres: Presentation, images: PhotoAlbumImageInput[], album: PhotoAlbum, startIndex: number): Slide[];
