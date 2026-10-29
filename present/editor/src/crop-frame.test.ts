import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Presentation, Shape } from "@ppt/core";
import { identityTransform } from "@ppt/core";
import { SetCropFrameCmd } from "./commands.js";
import {
  ZERO_CROP,
  cropFromFrames,
  cropHost,
  fitPictureToSlide,
  fittedCropWindow,
  imageFrame,
  readCrop,
  resizeCropWindow,
  scalePictureFromCorner,
  sameCrop,
  setCropEdge,
} from "./crop-frame.js";

function closeRect(
  actual: { x: number; y: number; w: number; h: number },
  expected: { x: number; y: number; w: number; h: number },
): void {
  assert.ok(Math.abs(actual.x - expected.x) < 1e-6, `x ${actual.x} != ${expected.x}`);
  assert.ok(Math.abs(actual.y - expected.y) < 1e-6, `y ${actual.y} != ${expected.y}`);
  assert.ok(Math.abs(actual.w - expected.w) < 1e-6, `w ${actual.w} != ${expected.w}`);
  assert.ok(Math.abs(actual.h - expected.h) < 1e-6, `h ${actual.h} != ${expected.h}`);
}

describe("crop window", () => {
  it("keeps the picture rectangle fixed when the window edge moves", () => {
    const window = { x: 10, y: 20, w: 200, h: 100 };
    const image = imageFrame(window, ZERO_CROP);
    const next = resizeCropWindow(window, "e", -50, 0);
    const crop = cropFromFrames(image, next);
    closeRect(imageFrame(next, crop), image);
    assert.ok(Math.abs(crop.r - 0.25) < 1e-6);
    assert.equal(next.w, 150);
  });

  it("pans the picture without changing its size or the window", () => {
    const window = { x: 0, y: 0, w: 150, h: 100 };
    const image = { x: 0, y: 0, w: 200, h: 100 };
    const crop = cropFromFrames(image, window);
    const moved = { ...image, x: image.x - 20 };
    const panned = cropFromFrames(moved, window);
    closeRect(imageFrame(window, panned), moved);
    assert.ok(Math.abs(1 - panned.l - panned.r - (1 - crop.l - crop.r)) < 1e-6);
  });

  it("moves only the window when a slider edge changes", () => {
    const window = { x: 0, y: 0, w: 200, h: 80 };
    const before = imageFrame(window, ZERO_CROP);
    const next = setCropEdge(window, ZERO_CROP, "l", 0.25);
    closeRect(imageFrame(next.window, next.crop), before);
    assert.ok(Math.abs(next.window.x - 50) < 1e-6);
    assert.ok(Math.abs(next.window.w - 150) < 1e-6);
    assert.ok(sameCrop(next.crop, { l: 0.25, t: 0, r: 0, b: 0 }));
  });

  it("scales the picture from the opposite corner without moving that corner", () => {
    const image = { x: 10, y: 20, w: 200, h: 100 };
    const next = scalePictureFromCorner(image, "se", 200, 100);
    closeRect(next, { x: 10, y: 20, w: 400, h: 200 });
    assert.ok(Math.abs(next.w / image.w - next.h / image.h) < 1e-6);
  });

  it("moves the window and leaves the picture where it was", () => {
    const image = { x: 0, y: 0, w: 200, h: 100 };
    const window = { x: 20, y: 10, w: 100, h: 50 };
    const moved = { ...window, x: window.x + 15, y: window.y + 5 };
    closeRect(imageFrame(moved, cropFromFrames(image, moved)), image);
  });

  it("shrinks an oversized picture into the slide and keeps the crop", () => {
    const crop = { l: 0.1, t: 0.2, r: 0.3, b: 0 };
    const image = { x: 0, y: 0, w: 2000, h: 1000 };
    const fitted = fitPictureToSlide(image, 1280, 720);
    assert.ok(fitted);
    assert.ok(fitted.w <= 1280 * 0.9 + 1e-6);
    assert.ok(fitted.h <= 720 * 0.9 + 1e-6);
    assert.ok(fitted.x >= 1280 * 0.05 - 1e-6);
    assert.ok(fitted.y >= 720 * 0.05 - 1e-6);
    const shape = {
      id: "i",
      name: "Picture",
      zIndex: 0,
      visible: true,
      locked: false,
      opacity: 1,
      transform: identityTransform(),
      bbox: {
        x: image.x + crop.l * image.w,
        y: image.y + crop.t * image.h,
        w: image.w * (1 - crop.l - crop.r),
        h: image.h * (1 - crop.t - crop.b),
      },
      kind: "image",
      src: "a",
      cropRect: crop,
    } as Shape;
    const next = fittedCropWindow(shape, 1280, 720);
    assert.ok(next);
    const nextImage = imageFrame(next, crop);
    assert.ok(Math.abs(nextImage.w / image.w - nextImage.h / image.h) < 1e-6);
    assert.ok(sameCrop(cropFromFrames(nextImage, next), crop));
  });

  it("leaves a picture that already fits on the slide", () => {
    const image = { x: -40, y: 10, w: 400, h: 300 };
    assert.equal(fitPictureToSlide(image, 1280, 720), null);
  });

  it("offers crop on pictures, video, and stretched picture fills", () => {
    const base = { name: "s", zIndex: 0, visible: true, locked: false, opacity: 1, transform: identityTransform(), bbox: { x: 0, y: 0, w: 10, h: 10 } };
    assert.equal(cropHost({ ...base, id: "i", kind: "image", src: "a" } as Shape), "frame");
    assert.equal(cropHost({ ...base, id: "v", kind: "video", src: "a" } as Shape), "frame");
    assert.equal(cropHost({ ...base, id: "a", kind: "audio", src: "a" } as Shape), null);
    assert.equal(
      cropHost({
        ...base,
        id: "r",
        kind: "rect",
        fill: { kind: "image", src: "a", fit: "fill" },
      } as Shape),
      "fill",
    );
    assert.equal(
      cropHost({
        ...base,
        id: "t",
        kind: "rect",
        fill: { kind: "image", src: "a", fit: "tile" },
      } as Shape),
      null,
    );
    assert.equal(cropHost({ ...base, id: "i2", kind: "image", src: "a", locked: true } as Shape), null);
  });
});

describe("SetCropFrameCmd", () => {
  it("writes the window and the source crop, then restores both", () => {
    const image: Shape = {
      id: "pic",
      name: "pic",
      zIndex: 0,
      visible: true,
      locked: false,
      opacity: 1,
      kind: "image",
      src: "data:,x",
      bbox: { x: 0, y: 0, w: 200, h: 100 },
      transform: identityTransform(),
    };
    const pres = {
      size: { width: 400, height: 300 },
      slides: [{ id: "s", layers: [{ id: "content", name: "Content", visible: true, locked: false, shapes: [image] }] }],
    } as unknown as Presentation;
    const cmd = new SetCropFrameCmd(0, "pic", { x: 0, y: 0, w: 150, h: 100 }, { l: 0, t: 0, r: 0.25, b: 0 });
    cmd.apply(pres);
    const shaped = pres.slides[0]!.layers[0]!.shapes[0]!;
    assert.equal(shaped.bbox.w, 150);
    assert.deepEqual(readCrop(shaped), { l: 0, t: 0, r: 0.25, b: 0 });
    cmd.revert(pres);
    assert.equal(shaped.bbox.w, 200);
    assert.equal(shaped.kind === "image" ? shaped.cropRect : "nope", undefined);
  });

  it("stores a picture-fill crop on the fill and stretches it", () => {
    const rect: Shape = {
      id: "box",
      name: "box",
      zIndex: 0,
      visible: true,
      locked: false,
      opacity: 1,
      kind: "rect",
      bbox: { x: 0, y: 0, w: 100, h: 80 },
      transform: identityTransform(),
      fill: { kind: "image", src: "data:,x", fit: "cover" },
    };
    const pres = {
      size: { width: 400, height: 300 },
      slides: [{ id: "s", layers: [{ id: "content", name: "Content", visible: true, locked: false, shapes: [rect] }] }],
    } as unknown as Presentation;
    const cmd = new SetCropFrameCmd(0, "box", { x: 10, y: 0, w: 80, h: 80 }, { l: 0.1, t: 0, r: 0, b: 0 });
    cmd.apply(pres);
    const shaped = pres.slides[0]!.layers[0]!.shapes[0]!;
    assert.equal(shaped.fill?.kind, "image");
    if (shaped.fill?.kind === "image") {
      assert.equal(shaped.fill.fit, "fill");
      assert.deepEqual(shaped.fill.srcRect, { l: 0.1, t: 0, r: 0, b: 0 });
    }
    cmd.revert(pres);
    assert.equal(shaped.bbox.x, 0);
    if (shaped.fill?.kind === "image") {
      assert.equal(shaped.fill.fit, "cover");
      assert.equal(shaped.fill.srcRect, undefined);
    }
  });
});
