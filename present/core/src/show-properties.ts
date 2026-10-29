/** ECMA-376 §19.2.1.38 `p:showPr` — 放映方式（循环 / 窗口 / 排练时间 / 旁白）。 */

export type ShowKind = "present" | "browse" | "kiosk";

export interface ShowSlideRange {
  /** 1-based inclusive. */
  start: number;
  end: number;
}

export interface ShowProperties {
  loop?: boolean;
  showNarration?: boolean;
  showAnimation?: boolean;
  useTimings?: boolean;
  kind?: ShowKind;
  browseShowScrollbar?: boolean;
  slides?: "all" | ShowSlideRange;
  customShowId?: number;
  /** `#RRGGBB` 墨迹笔色。 */
  penColor?: string;
  showMediaControls?: boolean;
}

export interface ShowUiState {
  loop: boolean;
  windowed: boolean;
  useTimings: boolean;
  playNarrations: boolean;
  showMediaControls: boolean;
}

const DEFAULT_UI: ShowUiState = {
  loop: false,
  windowed: false,
  useTimings: true,
  playNarrations: true,
  showMediaControls: true,
};

export function showPropertiesSnapshot(s: ShowProperties | undefined): string {
  if (!s) return "";
  return JSON.stringify({
    loop: s.loop ?? false,
    showNarration: s.showNarration ?? true,
    showAnimation: s.showAnimation ?? true,
    useTimings: s.useTimings ?? true,
    kind: s.kind ?? "present",
    browseShowScrollbar: s.browseShowScrollbar,
    slides: s.slides ?? "all",
    customShowId: s.customShowId,
    penColor: s.penColor,
    showMediaControls: s.showMediaControls ?? true,
  });
}

export function showPropertiesHasContent(s: ShowProperties | undefined): boolean {
  return Boolean(s);
}

export function showPropertiesToUi(s: ShowProperties | undefined): ShowUiState {
  if (!s) return { ...DEFAULT_UI };
  return {
    loop: s.loop ?? false,
    windowed: s.kind === "browse",
    useTimings: s.useTimings ?? true,
    playNarrations: s.showNarration ?? true,
    showMediaControls: s.showMediaControls ?? true,
  };
}

export function applyUiToShowProperties(prev: ShowProperties | undefined, ui: ShowUiState): ShowProperties {
  let kind: ShowKind = "present";
  if (ui.windowed) kind = "browse";
  else if (prev?.kind === "kiosk") kind = "kiosk";
  return {
    ...prev,
    loop: ui.loop,
    kind,
    useTimings: ui.useTimings,
    showNarration: ui.playNarrations,
    showMediaControls: ui.showMediaControls,
  };
}

/** 放映页序：自定义放映 / `sldRg`；全选时返回 undefined（沿用默认可见页）。 */
export function showPropertiesSlideOrder(
  s: ShowProperties | undefined,
  slideCount: number,
  customShows?: Array<{ id: string; slideIndices?: number[] }>,
): number[] | undefined {
  if (!s) return undefined;
  if (s.customShowId !== undefined && customShows?.length) {
    const hit = customShows.find((c) => Number(c.id) === s.customShowId || c.id === String(s.customShowId));
    if (hit?.slideIndices?.length) return hit.slideIndices.filter((i) => i >= 0 && i < slideCount);
  }
  if (!s.slides || s.slides === "all") return undefined;
  const start = Math.max(1, Math.min(slideCount, s.slides.start));
  const end = Math.max(start, Math.min(slideCount, s.slides.end));
  const out: number[] = [];
  for (let i = start; i <= end; i++) out.push(i - 1);
  return out.length ? out : undefined;
}

export function clampSlideIndexToOrder(startIdx: number, order: number[] | undefined): number {
  if (!order?.length) return startIdx;
  if (order.includes(startIdx)) return startIdx;
  return order[0]!;
}
