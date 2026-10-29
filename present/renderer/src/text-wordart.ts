// fromWordArt：老艺术字把字号当排版起点，画面上的字形要铺满形状框。
// WPS / PowerPoint 对 `bodyPr@fromWordArt="1"` 做非均匀拉伸：墨迹外接矩形贴到
// xfrm 的外框。`sz` 仍是文件里的字号，渲染时不改模型，导出仍写原值。
//
// textPlain / textNoShape 没有这个标志时仍按普通文本排，不在这里拉伸。

export interface WordArtBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WordArtFit {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
}

const MIN_INK = 0.5;
const MAX_SCALE = 8;

/**
 * 把已排好的墨迹框映射到形状框。
 * 变换顺序是先缩放再平移：`x' = x * sx + tx`。
 * 近乎 1:1 或比例离谱时返回 null，调用方保持原排版。
 */
export function wordArtFitTransform(ink: WordArtBox, box: WordArtBox): WordArtFit | null {
  if (!(ink.w > MIN_INK && ink.h > MIN_INK && box.w > MIN_INK && box.h > MIN_INK)) return null;
  const sx = box.w / ink.w;
  const sy = box.h / ink.h;
  if (!Number.isFinite(sx) || !Number.isFinite(sy)) return null;
  if (sx > MAX_SCALE || sy > MAX_SCALE || sx < 1 / MAX_SCALE || sy < 1 / MAX_SCALE) return null;
  if (Math.abs(sx - 1) < 0.02 && Math.abs(sy - 1) < 0.02) return null;
  return {
    sx,
    sy,
    tx: box.x - ink.x * sx,
    ty: box.y - ink.y * sy,
  };
}
