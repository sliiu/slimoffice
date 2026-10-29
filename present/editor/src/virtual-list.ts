/** Decks larger than this use windowed thumbnail / sorter rendering. */
export const VIRTUAL_LIST_THRESHOLD = 40;

const DEFAULT_OVERSCAN = 3;

export interface VirtualListHandle {
  refresh(): void;
  scrollToIndex(index: number, align?: "start" | "center" | "end" | "nearest"): void;
  destroy(): void;
}

interface MountedSlot {
  index: number;
  el: HTMLElement;
  cleanup?: () => void;
}

function rangeForScroll(
  scrollTop: number,
  viewportHeight: number,
  count: number,
  sizeAt: (i: number) => number,
  overscan: number,
): { start: number; end: number; total: number } {
  let total = 0;
  const offsets: number[] = new Array(count);
  for (let i = 0; i < count; i++) {
    offsets[i] = total;
    total += sizeAt(i);
  }
  const findIndex = (y: number): number => {
    let lo = 0;
    let hi = count - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (offsets[mid]! <= y) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const start = Math.max(0, findIndex(scrollTop) - overscan);
  const end = Math.min(count - 1, findIndex(scrollTop + viewportHeight) + overscan);
  return { start, end, total };
}

/**
 * Vertical virtual list: only mounts row DOM for the visible scroll range (+ overscan).
 */
export function createVirtualList(opts: {
  scrollRoot: HTMLElement;
  container: HTMLElement;
  count: number;
  estimateSize: (index: number) => number;
  overscan?: number;
  rowTag?: keyof HTMLElementTagNameMap;
  render: (index: number, row: HTMLElement) => void | (() => void);
}): VirtualListHandle {
  const overscan = opts.overscan ?? DEFAULT_OVERSCAN;
  const rowTag = opts.rowTag ?? "div";
  const mounted = new Map<number, MountedSlot>();
  let destroyed = false;
  const sizeAt = opts.estimateSize;

  const relayout = (): void => {
    if (destroyed) return;
    const { scrollTop, clientHeight } = opts.scrollRoot;
    const { start, end, total } = rangeForScroll(scrollTop, clientHeight, opts.count, sizeAt, overscan);
    opts.container.style.height = `${total}px`;
    opts.container.style.position = "relative";

    for (const [idx, slot] of mounted) {
      if (idx < start || idx > end) {
        slot.cleanup?.();
        slot.el.remove();
        mounted.delete(idx);
      }
    }

    let offset = 0;
    for (let i = 0; i < opts.count; i++) {
      const h = sizeAt(i);
      if (i >= start && i <= end) {
        let slot = mounted.get(i);
        if (!slot) {
          const el = document.createElement(rowTag);
          el.dataset.virtualIndex = String(i);
          el.style.position = "absolute";
          el.style.left = "0";
          el.style.right = "0";
          const cleanup = opts.render(i, el);
          slot = { index: i, el, cleanup: typeof cleanup === "function" ? cleanup : undefined };
          mounted.set(i, slot);
          opts.container.appendChild(el);
        }
        slot.el.style.top = `${offset}px`;
        slot.el.style.height = `${h}px`;
      }
      offset += h;
    }
  };

  const onScroll = (): void => relayout();
  opts.scrollRoot.addEventListener("scroll", onScroll, { passive: true });
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => relayout()) : null;
  ro?.observe(opts.scrollRoot);

  const handle: VirtualListHandle = {
    refresh: () => relayout(),
    scrollToIndex(index, align: "start" | "center" | "end" | "nearest" = "nearest") {
      if (index < 0 || index >= opts.count) return;
      let top = 0;
      for (let i = 0; i < index; i++) top += sizeAt(i);
      const h = sizeAt(index);
      const view = opts.scrollRoot.clientHeight;
      let target = top;
      if (align === "center") target = top - (view - h) / 2;
      else if (align === "end") target = top - view + h;
      else if (align === "nearest") {
        const st = opts.scrollRoot.scrollTop;
        if (top < st) target = top;
        else if (top + h > st + view) target = top - view + h;
        else return relayout();
      }
      opts.scrollRoot.scrollTop = Math.max(0, target);
      relayout();
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      opts.scrollRoot.removeEventListener("scroll", onScroll);
      ro?.disconnect();
      for (const slot of mounted.values()) {
        slot.cleanup?.();
        slot.el.remove();
      }
      mounted.clear();
      opts.container.style.height = "";
      opts.container.style.position = "";
    },
  };

  relayout();
  return handle;
}

export interface VirtualGridHandle {
  refresh(): void;
  scrollToIndex(itemIndex: number, align?: "start" | "center" | "end" | "nearest"): void;
  destroy(): void;
}

/**
 * Grid virtual list (fixed row height). `itemCount` cells laid out in `columnCount` columns.
 */
export function createVirtualGrid(opts: {
  scrollRoot: HTMLElement;
  container: HTMLElement;
  itemCount: number;
  columnCount: number;
  rowHeight: number;
  gap: number;
  overscan?: number;
  render: (itemIndex: number, cell: HTMLElement) => void | (() => void);
}): VirtualGridHandle {
  const rowCount = Math.max(1, Math.ceil(opts.itemCount / Math.max(1, opts.columnCount)));
  const rowStride = opts.rowHeight + opts.gap;
  const list = createVirtualList({
    scrollRoot: opts.scrollRoot,
    container: opts.container,
    count: rowCount,
    overscan: opts.overscan,
    estimateSize: () => rowStride,
    render: (rowIndex, rowEl) => {
      rowEl.style.display = "grid";
      rowEl.style.gridTemplateColumns = `repeat(${opts.columnCount}, minmax(0, 1fr))`;
      rowEl.style.gap = `${opts.gap}px`;
      rowEl.style.boxSizing = "border-box";
      const cleanups: Array<() => void> = [];
      for (let c = 0; c < opts.columnCount; c++) {
        const itemIndex = rowIndex * opts.columnCount + c;
        if (itemIndex >= opts.itemCount) break;
        const cell = document.createElement("div");
        cell.dataset.itemIndex = String(itemIndex);
        const cu = opts.render(itemIndex, cell);
        if (typeof cu === "function") cleanups.push(cu);
        rowEl.appendChild(cell);
      }
      return () => {
        for (const cu of cleanups) cu();
      };
    },
  });

  return {
    refresh: () => list.refresh(),
    scrollToIndex: (itemIndex, align) => {
      const row = Math.floor(itemIndex / Math.max(1, opts.columnCount));
      list.scrollToIndex(row, align);
    },
    destroy: () => list.destroy(),
  };
}

export function gridColumnCount(containerWidth: number, minCellWidth: number, gap: number): number {
  return Math.max(1, Math.floor((containerWidth + gap) / (minCellWidth + gap)));
}
