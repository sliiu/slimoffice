import type { DeckComment } from "@ppt/core";

export function defaultCommentAnchor(
  size: { width: number; height: number },
  ordinalOnSlide: number,
): { x: number; y: number } {
  const col = ordinalOnSlide % 3;
  const row = Math.floor(ordinalOnSlide / 3);
  return {
    x: Math.round(size.width * 0.06 + col * 52),
    y: Math.round(size.height * 0.08 + row * 44),
  };
}

function clampAnchor(
  x: number,
  y: number,
  slideW: number,
  slideH: number,
): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(slideW, Math.round(x))),
    y: Math.max(0, Math.min(slideH, Math.round(y))),
  };
}

function pinStyle(
  x: number,
  y: number,
  slideW: number,
  slideH: number,
  resolved: boolean,
  selected: boolean,
): string {
  const bg = resolved ? "#64748b" : "#f59e0b";
  const ring = selected
    ? "box-shadow:0 0 0 3px rgba(251,191,36,.75),0 2px 8px rgba(0,0,0,.5)"
    : "box-shadow:0 1px 4px rgba(0,0,0,.45)";
  const scale = selected ? "scale(1.18)" : "scale(1)";
  return [
    "position:absolute",
    "pointer-events:auto",
    `transform:translate(-50%,-50%) ${scale}`,
    "width:20px",
    "height:20px",
    "border-radius:50%",
    selected ? "border:2px solid #fbbf24" : "border:2px solid #fff",
    `background:${bg}`,
    ring,
    "cursor:grab",
    "padding:0",
    "touch-action:none",
    selected ? "z-index:2" : "z-index:1",
    `left:${(x / slideW) * 100}%`,
    `top:${(y / slideH) * 100}%`,
  ].join(";");
}

export interface CommentPinsHandle {
  refresh(): void;
  destroy(): void;
}

function commentRootId(comments: DeckComment[], commentId: string): string {
  let cur = comments.find((c) => c.id === commentId);
  if (!cur) return commentId;
  while (cur.parentId) {
    const parent = comments.find((c) => c.id === cur!.parentId);
    if (!parent) break;
    cur = parent;
  }
  return cur.id;
}

export function mountCommentPins(opts: {
  stage: HTMLElement;
  slideW: number;
  slideH: number;
  getComments: () => DeckComment[];
  getSlideIndex: () => number;
  getVisible?: () => boolean;
  getSelectedId?: () => string | null;
  screenToStage: (clientX: number, clientY: number) => { x: number; y: number };
  onSelect?: (commentId: string) => void;
  onMove?: (commentId: string, x: number, y: number) => void;
}): CommentPinsHandle {
  const layer = opts.stage.ownerDocument.createElement("div");
  layer.className = "ppt-comment-pins";
  layer.style.cssText =
    "position:absolute;inset:0;pointer-events:none;z-index:5;overflow:visible";
  opts.stage.appendChild(layer);

  const refresh = (): void => {
    if (opts.getVisible && !opts.getVisible()) {
      layer.style.display = "none";
      layer.replaceChildren();
      return;
    }
    layer.style.display = "";
    layer.replaceChildren();
    const slideIdx = opts.getSlideIndex();
    const all = opts.getComments();
    const selectedRootId = opts.getSelectedId?.()
      ? commentRootId(all, opts.getSelectedId()!)
      : null;
    const here = all.filter((c) => c.slideIndex === slideIdx && !c.parentId);
    for (const c of here) {
      const selected = selectedRootId === c.id;
      const pin = opts.stage.ownerDocument.createElement("button");
      pin.type = "button";
      pin.dataset.commentId = c.id;
      pin.className =
        "ppt-comment-pin" +
        (c.resolved ? " is-resolved" : "") +
        (selected ? " is-selected" : "");
      pin.title = c.text;
      const baseX = c.x ?? opts.slideW * 0.08;
      const baseY = c.y ?? opts.slideH * 0.12;
      pin.style.cssText = pinStyle(
        baseX,
        baseY,
        opts.slideW,
        opts.slideH,
        !!c.resolved,
        selected,
      );

      let dragStart: { x: number; y: number } | null = null;
      let moved = false;

      const placePin = (x: number, y: number): { x: number; y: number } => {
        const clamped = clampAnchor(x, y, opts.slideW, opts.slideH);
        pin.style.cssText = pinStyle(
          clamped.x,
          clamped.y,
          opts.slideW,
          opts.slideH,
          !!c.resolved,
          selected,
        );
        return clamped;
      };

      pin.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        e.preventDefault();
        dragStart = { x: e.clientX, y: e.clientY };
        moved = false;
        pin.setPointerCapture(e.pointerId);
        pin.style.cursor = "grabbing";
      });

      pin.addEventListener("pointermove", (e) => {
        if (!dragStart) return;
        const dx = e.clientX - dragStart.x;
        const dy = e.clientY - dragStart.y;
        if (!moved && Math.hypot(dx, dy) < 4) return;
        moved = true;
        const pt = opts.screenToStage(e.clientX, e.clientY);
        placePin(pt.x, pt.y);
      });

      const finishDrag = (e: PointerEvent): void => {
        if (!dragStart) return;
        pin.releasePointerCapture(e.pointerId);
        pin.style.cursor = "grab";
        const start = dragStart;
        dragStart = null;
        if (!moved) {
          opts.onSelect?.(c.id);
          return;
        }
        const pt = opts.screenToStage(e.clientX, e.clientY);
        const next = clampAnchor(pt.x, pt.y, opts.slideW, opts.slideH);
        const prev = { x: c.x, y: c.y };
        if (prev.x === next.x && prev.y === next.y) return;
        opts.onMove?.(c.id, next.x, next.y);
      };

      pin.addEventListener("pointerup", finishDrag);
      pin.addEventListener("pointercancel", finishDrag);

      layer.appendChild(pin);
    }
  };

  return {
    refresh,
    destroy: () => layer.remove(),
  };
}
