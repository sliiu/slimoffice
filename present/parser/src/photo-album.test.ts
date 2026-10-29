import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parsePhotoAlbum, photoAlbumSnapshot } from "./photo-album.js";
import { parseXml } from "./xml.js";

describe("photoAlbum", () => {
  it("reads attributes and snapshots for round-trip", () => {
    const root = parseXml(
      `<p:presentation><p:photoAlbum bw="1" showCaptions="0" layout="fitToSlide" frame="rect"/></p:presentation>`,
    );
    const album = parsePhotoAlbum(root["p:presentation"]);
    assert.deepEqual(album, { bw: true, showCaptions: false, layout: "fitToSlide", frame: "rect" });
    assert.equal(photoAlbumSnapshot(album), JSON.stringify(album));
    assert.equal(photoAlbumSnapshot(undefined), "");
    assert.equal(parsePhotoAlbum(undefined), undefined);
  });
});
