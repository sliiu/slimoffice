/** ECMA-376 §19.2.2.11 `p:guide` — `pos` 用旧 PPT 母版单位：每英寸 576。 */
export const GUIDE_UNITS_PER_INCH = 576;
const EMU_PER_INCH = 914400;
const EMU_PER_PX = 9525;

export type GuideOrient = "vert" | "horz";

/** `ppt/viewProps.xml` 里一条绘图参考线，`pos` 为 slide 像素。 */
export interface DrawingGuide {
  orient: GuideOrient;
  pos: number;
}

/**
 * ECMA-376 §19.2.2 `viewPr`：幻灯片视图参考线 + 网格吸附。
 * 放在 Presentation 上（可 JSON 克隆），缓存恢复丢掉 `__source` 后仍能 from-scratch 写回。
 */
export interface ViewGuides {
  slide: DrawingGuide[];
  notes?: DrawingGuide[];
  showGuides?: boolean;
  snapToGrid?: boolean;
  snapToObjects?: boolean;
  gridSpacing?: { x: number; y: number };
}

export function guidePosToPx(pos: number): number {
  return (pos * EMU_PER_INCH) / GUIDE_UNITS_PER_INCH / EMU_PER_PX;
}

export function pxToGuidePos(px: number): number {
  return Math.round((px * EMU_PER_PX * GUIDE_UNITS_PER_INCH) / EMU_PER_INCH);
}

function sortedGuides(guides: DrawingGuide[] | undefined): DrawingGuide[] {
  return [...(guides ?? [])]
    .map((g) => ({ orient: g.orient, pos: g.pos }))
    .sort((a, b) => a.orient.localeCompare(b.orient) || a.pos - b.pos);
}

export function viewGuidesSnapshot(g: ViewGuides | undefined): string {
  if (!g) return "";
  return JSON.stringify({
    slide: sortedGuides(g.slide),
    notes: g.notes?.length ? sortedGuides(g.notes) : undefined,
    showGuides: g.showGuides,
    snapToGrid: g.snapToGrid,
    snapToObjects: g.snapToObjects,
    gridSpacing: g.gridSpacing,
  });
}

export function viewGuidesHasContent(g: ViewGuides | undefined): boolean {
  if (!g) return false;
  if (g.slide.length) return true;
  if (g.notes?.length) return true;
  if (g.showGuides || g.snapToGrid || g.snapToObjects) return true;
  if (g.gridSpacing) return true;
  return false;
}
