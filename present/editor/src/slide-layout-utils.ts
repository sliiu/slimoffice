import type { Layer, Presentation, Shape, Slide, SlideLayout, SlideMaster } from "@ppt/core";
import { genShapeId } from "./shape-factory";

function deepClone<T>(v: T): T {
  if (typeof structuredClone === "function") return structuredClone(v);
  return JSON.parse(JSON.stringify(v)) as T;
}

export function findMainLayer(slide: Slide): Layer | undefined {
  return (
    slide.layers.find((l) => l.id === "main" || l.id === "layer_main") ??
    slide.layers[slide.layers.length - 1]
  );
}

export function resolveSlideMaster(pres: Presentation, slide: Slide): SlideMaster | undefined {
  const masterId = slide.layoutRef?.masterId ?? pres.masters?.[0]?.id;
  if (!masterId) return undefined;
  return pres.masters?.find((m) => m.id === masterId);
}

export function resolveSlideLayout(pres: Presentation, slide: Slide): SlideLayout | undefined {
  const master = resolveSlideMaster(pres, slide);
  if (!master?.layouts?.length) return undefined;
  const layoutId = slide.layoutRef?.layoutId;
  if (layoutId) {
    const exact = master.layouts.find((l) => l.id === layoutId);
    if (exact) return exact;
  }
  return master.layouts[0];
}

export interface LayoutListEntry {
  masterId: string;
  layoutId: string;
  name: string;
  type?: string;
}

export function listLayoutsForSlide(pres: Presentation, slide: Slide): LayoutListEntry[] {
  const master = resolveSlideMaster(pres, slide);
  if (!master?.layouts?.length) return [];
  return master.layouts.map((l) => ({
    masterId: master.id,
    layoutId: l.id,
    name: l.name || l.type || l.id,
    type: l.type,
  }));
}

function reIdShapeTree(shape: Shape): void {
  shape.id = genShapeId("ph");
  if (shape.kind === "group") {
    for (const child of shape.children) reIdShapeTree(child);
  }
}

/** Clone placeholder shapes from a layout with fresh ids (for slide reset / layout switch). */
export function cloneLayoutPlaceholders(layout: SlideLayout): Shape[] {
  return (layout.shapes ?? [])
    .filter((s) => s.placeholder)
    .map((s) => {
      const copy = deepClone(s);
      reIdShapeTree(copy);
      return copy;
    });
}

export function replaceSlideMainShapes(slide: Slide, shapes: Shape[]): void {
  const main = findMainLayer(slide);
  if (!main) return;
  main.shapes = shapes;
}

export function syncRawMainShapes(slide: Slide, shapes: Shape[]): void {
  if (!slide.__source) return;
  slide.__source.rawMainShapes = shapes.map((s) => deepClone(s));
}
