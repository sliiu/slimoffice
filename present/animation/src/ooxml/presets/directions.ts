// ECMA-376 §19.5.18 cTn.presetSubtype direction vectors.
// PowerPoint encodes directions as bit flags: 1 = top, 2 = right, 4 = bottom, 8 = left;
// corners are sums (3 = top-right, 6 = bottom-right, 12 = bottom-left, 9 = top-left), and
// axis presets (Blinds / Checkerboard / Random Bars) use 5 = top+bottom (vertical),
// 10 = left+right (horizontal). Verified against PowerPoint's own subtrees in
// presets-template/data/extracted.json (Fly In 4 starts at 1+#ppt_h/2, 8 at 0-#ppt_w/2).
// Each entry is the side the shape comes from, plus the name token that preset templates
// expand from "$dirName" / "$axis".

export const DIRECTION_VECTORS: Record<number, { dx: number; dy: number; name: string }> = {
  1: { dx: 0, dy: -1, name: "top" },
  2: { dx: 1, dy: 0, name: "right" },
  4: { dx: 0, dy: 1, name: "bottom" },
  8: { dx: -1, dy: 0, name: "left" },
  3: { dx: 1, dy: -1, name: "topRight" },
  6: { dx: 1, dy: 1, name: "bottomRight" },
  12: { dx: -1, dy: 1, name: "bottomLeft" },
  9: { dx: -1, dy: -1, name: "topLeft" },
  5: { dx: 0, dy: 1, name: "vertical" },
  10: { dx: 1, dy: 0, name: "horizontal" },
};

export const DEFAULT_DIRECTION = { dx: 0, dy: 1, name: "bottom" };
