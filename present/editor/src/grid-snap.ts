/** 视图条网格的间距，和 renderGrid 画出来的线是同一组。 */
export const VISUAL_GRID_STEP = 50;

/** 幻灯片上实际画出的最近一条网格线。max 不是步长整数时，不吸到幻灯片外。 */
export function closestGridLine(value: number, step: number, max: number): number {
  if (step <= 0) return 0;
  const last = Math.floor(max / step) * step;
  let n = Math.round(value / step) * step;
  if (n < 0) n = 0;
  if (n > last) n = last;
  return n;
}

/** 边或中心离网格线不超过 threshold 时，返回要补上的位移。 */
export function pickGridSnap(
  positions: number[],
  step: number,
  max: number,
  threshold: number,
): { delta: number; at: number } | null {
  let best = threshold + 1;
  let delta = 0;
  let at = 0;
  for (const value of positions) {
    const line = closestGridLine(value, step, max);
    const d = line - value;
    const ad = Math.abs(d);
    if (ad < best) {
      best = ad;
      delta = d;
      at = line;
    }
  }
  if (best > threshold) return null;
  return { delta, at };
}
