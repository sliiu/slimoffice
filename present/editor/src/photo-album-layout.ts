import { createSlideFromMaster, type PhotoAlbum, type Presentation, type Rect, type Shape, type Slide } from "@ppt/core";
import { genShapeId } from "./shape-factory";

export type PhotoAlbumLayoutId = "fitToSlide" | "2pic" | "4pic";

export interface PhotoAlbumImageInput {
  src: string;
  natural?: { w: number; h: number };
  caption?: string;
}

const MARGIN = 0.05;
const CELL_PAD = 8;
const CAPTION_H = 28;

export function imagesPerSlide(layout: string | undefined): number {
  if (!layout) return 1;
  if (layout === "4pic" || layout.startsWith("4pic")) return 4;
  if (layout === "2pic" || layout.startsWith("2pic")) return 2;
  return 1;
}

export function gridForLayout(layout: string | undefined): { cols: number; rows: number } {
  if (layout === "4pic" || layout?.startsWith("4pic")) return { cols: 2, rows: 2 };
  if (layout === "2picVert" || layout === "2picSub") return { cols: 1, rows: 2 };
  if (layout === "2pic" || layout?.startsWith("2pic")) return { cols: 2, rows: 1 };
  return { cols: 1, rows: 1 };
}

function fitImageInCell(
  natural: { w: number; h: number } | undefined,
  cell: Rect,
  captionReserve: number,
): Rect {
  const imgAreaW = Math.max(1, cell.w - CELL_PAD * 2);
  const imgAreaH = Math.max(1, cell.h - CELL_PAD * 2 - captionReserve);
  const aspect = natural && natural.w > 0 && natural.h > 0 ? natural.w / natural.h : 4 / 3;
  let w = imgAreaW;
  let h = w / aspect;
  if (h > imgAreaH) {
    h = imgAreaH;
    w = h * aspect;
  }
  return {
    x: cell.x + (cell.w - w) / 2,
    y: cell.y + CELL_PAD + (imgAreaH - h) / 2,
    w,
    h,
  };
}

function makeImageShape(
  src: string,
  natural: { w: number; h: number } | undefined,
  bbox: Rect,
  bw: boolean | undefined,
): Shape {
  const shape: Shape = {
    id: genShapeId("img"),
    name: "Picture",
    zIndex: 0,
    visible: true,
    locked: false,
    opacity: 1,
    bbox: { ...bbox },
    transform: { tx: 0, ty: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0 },
    kind: "image",
    src,
    natural,
  };
  if (bw) shape.bwMode = "gray";
  return shape;
}

function makeCaptionShape(text: string, bbox: Rect): Shape {
  return {
    id: genShapeId("cap"),
    name: "Caption",
    zIndex: 0,
    visible: true,
    locked: false,
    opacity: 1,
    bbox: { ...bbox },
    transform: { tx: 0, ty: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0 },
    kind: "text",
    paragraphs: [
      {
        runs: [{ text, fontSize: 12, color: "#334155" }],
        align: "middle",
      },
    ],
    vAlign: "top",
  };
}

/** Build one slide per batch of images according to `album.layout`. */
export function buildPhotoAlbumSlides(
  pres: Presentation,
  images: PhotoAlbumImageInput[],
  album: PhotoAlbum,
  startIndex: number,
): Slide[] {
  if (!images.length) return [];
  const perSlide = imagesPerSlide(album.layout);
  const { cols, rows } = gridForLayout(album.layout);
  const slideW = pres.size.width;
  const slideH = pres.size.height;
  const contentX = slideW * MARGIN;
  const contentY = slideH * MARGIN;
  const contentW = slideW * (1 - MARGIN * 2);
  const contentH = slideH * (1 - MARGIN * 2);
  const cellW = contentW / cols;
  const rowBlockH = contentH / rows;
  const captionReserve = album.showCaptions ? CAPTION_H : 0;
  const slides: Slide[] = [];

  for (let i = 0; i < images.length; i += perSlide) {
    const batch = images.slice(i, i + perSlide);
    const slideIdx = startIndex + slides.length;
    const slide = createSlideFromMaster(pres.masters, {
      index: slideIdx,
      layoutType: "blank",
      preferredTypes: ["blank", "obj", "titleOnly"],
      name: `Photo Album ${slides.length + 1}`,
    });
    const layer = slide.layers[0]!;
    layer.shapes = [];

    batch.forEach((img, j) => {
      const col = j % cols;
      const row = Math.floor(j / cols);
      const cell: Rect = {
        x: contentX + col * cellW,
        y: contentY + row * rowBlockH,
        w: cellW,
        h: rowBlockH,
      };
      const imgBbox = fitImageInCell(img.natural, cell, captionReserve);
      layer.shapes.push(makeImageShape(img.src, img.natural, imgBbox, album.bw));

      if (album.showCaptions && img.caption) {
        const capBbox: Rect = {
          x: cell.x + CELL_PAD,
          y: cell.y + cell.h - CAPTION_H,
          w: cell.w - CELL_PAD * 2,
          h: CAPTION_H - 4,
        };
        layer.shapes.push(makeCaptionShape(img.caption, capBbox));
      }
    });

    slides.push(slide);
  }

  return slides;
}
