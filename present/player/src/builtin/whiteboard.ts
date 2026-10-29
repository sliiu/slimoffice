// 白板插件
//
// 目标：放映态在 slide 上叠加一层可绘制的画布，让演讲者可以临时标注（划重点、
// 圈点关键内容、画箭头等）。
//
// 设计要点：
//   1. 用一个 SVG overlay 叠在 stage 之上 —— 选 SVG 而不是 <canvas> 是因为：
//      - 笔迹保真：放大缩小不糊；
//      - 切页时可以做整页清屏 / 整页恢复；
//      - 后续可以做 export（把笔迹序列化），canvas 难做；
//      - 与 player stage 的 transform: scale 直接同 viewBox，坐标系统一。
//   2. 坐标系：白板内部全部用 slide 单位（与 OOXML / scene 一致），不依赖屏幕像素。
//      笔触宽度也按 slide 单位计算，缩放时自然跟随。
//   3. 工具：pen（黑/红/蓝/绿/黄 5 色） + highlighter（半透明粗笔） + eraser（按
//      路径相交清除一整条笔迹，而不是橡皮擦像素 —— 矢量擦除更符合用户预期）。
//   4. 交互：通过右键菜单进入 / 退出白板，进入后 stage 的点击翻页被白板拦截；
//      退出时把当前页笔迹保留（再次进入仍可看到），但「清屏」按钮可清掉本页。
//   5. 与放映 click-advance 的关系：白板模式下 stage 不再响应 click 翻页（onPointer
//      事件被 SVG 吃掉），ESC 默认关闭白板而非结束放映。
//
// 状态：每张 slide 各自一份笔迹列表，按 visibleIndex 索引；切页时切换可见层。

import type { Plugin } from "@ppt/plugin-sdk";
import { lucideSvg } from "../icons";
import { createTranslator } from "../i18n";

interface Stroke {
  id: string;
  /** 笔触颜色（hex 或 rgba）。 */
  color: string;
  /** 笔触宽度（slide 单位）。 */
  width: number;
  /** 透明度 0-1（highlighter < 1）。 */
  opacity: number;
  /** 路径点 [x, y, x, y, ...]（slide 单位）。 */
  points: number[];
  /** SVG path 元素引用，方便擦除时删除。 */
  el?: SVGPathElement;
}

type Tool = "pen" | "highlighter" | "eraser";

const PEN_COLORS = ["#ef4444", "#22c55e", "#3b82f6", "#fbbf24", "#000000", "#ffffff"];
const PEN_WIDTH = 4;
const HIGHLIGHT_WIDTH = 24;
const HIGHLIGHT_OPACITY = 0.35;

export const whiteboardPlugin: Plugin = {
  id: "official:whiteboard",
  name: "Whiteboard",
  version: "1.0.0",
  activate(ctx) {
    const tr = createTranslator(ctx.locale);
    const stage = ctx.ui.stageElement();
    const root = ctx.ui.rootElement();
    const doc = root.ownerDocument;
    const slideSize = ctx.presentation.size;

    // 笔迹存储：按 visibleIndex → Stroke[]
    const strokesByVisibleIndex = new Map<number, Stroke[]>();
    let currentVisibleIndex = ctx.player.current();

    // SVG overlay — 绝对覆盖整个 stage，使用 slide 单位作为 viewBox 与 stage 一致。
    // pointer-events 在白板激活时为 auto，未激活时为 none。
    const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    // 标记为持久 overlay：player 翻页时会清空 stage 渲染产物，但保留带此属性的层，
    // 否则翻一次页后白板 SVG 会被移出 DOM，再次开启白板时点击穿透到 stage 触发翻页。
    svg.setAttribute("data-ppt-overlay", "");
    svg.setAttribute("viewBox", `0 0 ${slideSize.width} ${slideSize.height}`);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.style.cssText = [
      "position:absolute",
      "left:0",
      "top:0",
      "width:100%",
      "height:100%",
      "pointer-events:none",
      "z-index:50",
      "touch-action:none",
    ].join(";");
    stage.appendChild(svg);

    // 工具栏 —— 在白板激活时显示在 stage 顶部居中。
    const toolbar = doc.createElement("div");
    toolbar.className = "ppt-whiteboard-toolbar";
    toolbar.style.cssText = [
      "position:absolute",
      "top:16px",
      "left:50%",
      "transform:translateX(-50%)",
      "display:none",
      "gap:6px",
      "padding:6px 10px",
      "background:rgba(28,31,38,.92)",
      "border:1px solid rgba(255,255,255,.1)",
      "border-radius:8px",
      "box-shadow:0 8px 24px rgba(0,0,0,.5)",
      "z-index:60",
      "font:12px ui-sans-serif,system-ui,sans-serif",
      "color:#e5e7eb",
      "user-select:none",
      "backdrop-filter:blur(8px)",
    ].join(";");
    root.appendChild(toolbar);

    let active = false;
    let tool: Tool = "pen";
    let color = PEN_COLORS[0]!;
    let applyingRemote = false;
    let current: Stroke | null = null;
    let currentPathEl: SVGPathElement | null = null;

    const newStrokeId = (): string =>
      `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

    const serializeSlides = (): Record<string, Array<{ id: string; color: string; width: number; opacity: number; points: number[] }>> => {
      const slides: Record<string, Array<{ id: string; color: string; width: number; opacity: number; points: number[] }>> = {};
      for (const [i, arr] of strokesByVisibleIndex) {
        slides[String(i)] = arr.map((s) => ({
          id: s.id,
          color: s.color,
          width: s.width,
          opacity: s.opacity,
          points: s.points.slice(0, 800),
        }));
      }
      return slides;
    };

    const publish = (): void => {
      if (applyingRemote) return;
      ctx.live.send({ t: "full", active, slides: serializeSlides() }, { snap: true });
    };

    // ---- 工具栏 UI ----
    const mkBtn = (label: string, title: string, onClick: () => void): HTMLButtonElement => {
      const b = doc.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.title = title;
      b.style.cssText = [
        "background:rgba(255,255,255,.08)",
        "color:#e5e7eb",
        "border:1px solid rgba(255,255,255,.12)",
        "padding:4px 10px",
        "border-radius:4px",
        "font:inherit",
        "cursor:pointer",
        "line-height:1",
      ].join(";");
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        onClick();
      });
      return b;
    };

    const mkToolBtn = (label: string, t: Tool, title: string): HTMLButtonElement => {
      const b = mkBtn(label, title, () => {
        tool = t;
        syncToolbar();
      });
      b.dataset.tool = t;
      return b;
    };

    const penBtn = mkToolBtn(tr("wb.pen"), "pen", tr("wb.pen.title"));
    const highlightBtn = mkToolBtn(tr("wb.highlight"), "highlighter", tr("wb.highlight.title"));
    const eraserBtn = mkToolBtn(tr("wb.eraser"), "eraser", tr("wb.eraser.title"));
    toolbar.append(penBtn, highlightBtn, eraserBtn);

    // 颜色色块
    const colorRow = doc.createElement("div");
    colorRow.style.cssText = "display:flex;gap:4px;align-items:center;padding-left:6px;border-left:1px solid rgba(255,255,255,.1);margin-left:2px";
    const colorBtns: HTMLButtonElement[] = [];
    for (const c of PEN_COLORS) {
      const b = doc.createElement("button");
      b.type = "button";
      b.title = c;
      b.dataset.color = c;
      b.style.cssText = [
        "width:18px",
        "height:18px",
        "border-radius:50%",
        "border:2px solid rgba(255,255,255,.2)",
        "cursor:pointer",
        `background:${c}`,
        "padding:0",
      ].join(";");
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        color = c;
        syncToolbar();
      });
      colorRow.appendChild(b);
      colorBtns.push(b);
    }
    toolbar.appendChild(colorRow);

    const clearBtn = mkBtn(tr("wb.clear"), tr("wb.clear.title"), clearCurrent);
    const closeBtn = mkBtn(tr("wb.close"), tr("wb.close.title"), () => setActive(false));
    closeBtn.style.display = "inline-flex";
    closeBtn.style.alignItems = "center";
    closeBtn.style.gap = "6px";
    closeBtn.prepend(lucideSvg(doc, "x", 14));
    toolbar.append(clearBtn, closeBtn);

    function syncToolbar(): void {
      for (const b of [penBtn, highlightBtn, eraserBtn]) {
        const on = b.dataset.tool === tool;
        b.style.background = on ? "rgba(59,130,246,.4)" : "rgba(255,255,255,.08)";
        b.style.borderColor = on ? "#3b82f6" : "rgba(255,255,255,.12)";
      }
      for (const b of colorBtns) {
        const on = b.dataset.color === color;
        b.style.borderColor = on ? "#fff" : "rgba(255,255,255,.2)";
        b.style.transform = on ? "scale(1.15)" : "scale(1)";
      }
    }
    syncToolbar();

    // ---- 坐标换算：clientX/Y → slide unit ----
    const toSlide = (e: PointerEvent): { x: number; y: number } | null => {
      const r = stage.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return null;
      return {
        x: ((e.clientX - r.left) / r.width) * slideSize.width,
        y: ((e.clientY - r.top) / r.height) * slideSize.height,
      };
    };

    // ---- 绘制 ----
    const pointsToPath = (pts: number[]): string => {
      if (pts.length < 2) return "";
      let d = `M ${pts[0]} ${pts[1]}`;
      for (let i = 2; i < pts.length; i += 2) d += ` L ${pts[i]} ${pts[i + 1]}`;
      return d;
    };

    // 简单距离判断：在 eraser 模式下命中已有 stroke 即整条删除（容差跟 stroke 宽度走）。
    const hitStroke = (s: Stroke, x: number, y: number, tol: number): boolean => {
      const t2 = (tol + s.width) * (tol + s.width);
      const pts = s.points;
      for (let i = 0; i < pts.length; i += 2) {
        const dx = pts[i]! - x;
        const dy = pts[i + 1]! - y;
        if (dx * dx + dy * dy <= t2) return true;
      }
      return false;
    };

    const eraseAt = (x: number, y: number): void => {
      const arr = strokesByVisibleIndex.get(currentVisibleIndex);
      if (!arr) return;
      const tol = 8; // slide 单位
      for (let i = arr.length - 1; i >= 0; i--) {
        const s = arr[i]!;
        if (hitStroke(s, x, y, tol)) {
          s.el?.remove();
          arr.splice(i, 1);
        }
      }
    };

    // ---- pointer 事件 ----
    const onDown = (e: PointerEvent): void => {
      if (!active || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      svg.setPointerCapture(e.pointerId);
      const pt = toSlide(e);
      if (!pt) return;
      if (tool === "eraser") {
        eraseAt(pt.x, pt.y);
        current = { id: newStrokeId(), color: "", width: 0, opacity: 0, points: [pt.x, pt.y] };
        publish();
        return;
      }
      const isHL = tool === "highlighter";
      const stroke: Stroke = {
        id: newStrokeId(),
        color: isHL ? color : color,
        width: isHL ? HIGHLIGHT_WIDTH : PEN_WIDTH,
        opacity: isHL ? HIGHLIGHT_OPACITY : 1,
        points: [pt.x, pt.y],
      };
      const path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", stroke.color);
      path.setAttribute("stroke-width", String(stroke.width));
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      path.setAttribute("opacity", String(stroke.opacity));
      path.setAttribute("d", `M ${pt.x} ${pt.y}`);
      svg.appendChild(path);
      stroke.el = path;
      currentPathEl = path;
      current = stroke;
      const arr = strokesByVisibleIndex.get(currentVisibleIndex) ?? [];
      arr.push(stroke);
      strokesByVisibleIndex.set(currentVisibleIndex, arr);
    };

    const onMove = (e: PointerEvent): void => {
      if (!active || !current) return;
      const pt = toSlide(e);
      if (!pt) return;
      if (tool === "eraser") {
        eraseAt(pt.x, pt.y);
        return;
      }
      const last = current.points;
      const lx = last[last.length - 2]!;
      const ly = last[last.length - 1]!;
      const dx = pt.x - lx;
      const dy = pt.y - ly;
      // 距离阈值（slide 单位）—— 避免点过密，path 太长。
      if (dx * dx + dy * dy < 1) return;
      last.push(pt.x, pt.y);
      currentPathEl?.setAttribute("d", pointsToPath(last));
    };

    const onUp = (e: PointerEvent): void => {
      if (!current) return;
      try {
        svg.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      current = null;
      currentPathEl = null;
      publish();
    };

    svg.addEventListener("pointerdown", onDown);
    svg.addEventListener("pointermove", onMove);
    svg.addEventListener("pointerup", onUp);
    svg.addEventListener("pointercancel", onUp);

    // ESC 关闭白板（在白板激活时优先于 player 的 ESC）
    const onKey = (e: KeyboardEvent): void => {
      if (!active) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setActive(false);
      }
    };
    doc.addEventListener("keydown", onKey, true);

    // ---- slide 切换：切换可见的笔迹层 ----
    const renderCurrentSlide = (): void => {
      // 兜底：万一 SVG 被移出 stage（如 player 翻页清屏），重新挂回，避免笔迹层失联。
      if (svg.parentNode !== stage) stage.appendChild(svg);
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      const arr = strokesByVisibleIndex.get(currentVisibleIndex);
      if (!arr) return;
      for (const s of arr) {
        const path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", s.color);
        path.setAttribute("stroke-width", String(s.width));
        path.setAttribute("stroke-linecap", "round");
        path.setAttribute("stroke-linejoin", "round");
        path.setAttribute("opacity", String(s.opacity));
        path.setAttribute("d", pointsToPath(s.points));
        svg.appendChild(path);
        s.el = path;
      }
    };

    const offSlide = ctx.events.on("slidechange", (ev) => {
      currentVisibleIndex = ev.visibleIndex;
      renderCurrentSlide();
    });

    function clearCurrent(): void {
      strokesByVisibleIndex.delete(currentVisibleIndex);
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      publish();
    }

    function setActive(on: boolean): void {
      active = on;
      svg.style.pointerEvents = on ? "auto" : "none";
      svg.style.cursor = on ? "crosshair" : "default";
      toolbar.style.display = on ? "flex" : "none";
      if (on) {
        currentVisibleIndex = ctx.player.current();
        renderCurrentSlide();
      }
      publish();
    }

    // 注册右键菜单项
    ctx.contextMenu.addItem({
      id: "whiteboard:toggle",
      kind: "checkbox",
      label: tr("wb.menu.toggle"),
      shortcut: "W",
      group: "plugin",
      order: 100,
      checked: () => active,
      onClick: () => setActive(!active),
    });
    ctx.contextMenu.addItem({
      id: "whiteboard:clear",
      label: tr("wb.menu.clear"),
      group: "plugin",
      order: 101,
      disabled: () => {
        const arr = strokesByVisibleIndex.get(ctx.player.current());
        return !arr || arr.length === 0;
      },
      onClick: () => {
        currentVisibleIndex = ctx.player.current();
        clearCurrent();
      },
    });

    const offAttach = ctx.live.onAttach((on) => {
      if (on) publish();
    });
    const offLive = ctx.live.on((data) => {
      if (!data || typeof data !== "object") return;
      const msg = data as { t?: string; active?: boolean; slides?: Record<string, unknown> };
      if (msg.t !== "full" || !msg.slides || typeof msg.slides !== "object") return;
      applyingRemote = true;
      try {
        strokesByVisibleIndex.clear();
        for (const [key, raw] of Object.entries(msg.slides)) {
          const i = Number(key);
          if (!Number.isFinite(i) || !Array.isArray(raw)) continue;
          const arr: Stroke[] = [];
          for (const row of raw.slice(0, 200)) {
            if (!row || typeof row !== "object") continue;
            const s = row as Record<string, unknown>;
            const points = Array.isArray(s.points)
              ? (s.points as unknown[]).map((n) => Number(n)).filter((n) => Number.isFinite(n)).slice(0, 800)
              : [];
            if (points.length < 2) continue;
            arr.push({
              id: typeof s.id === "string" ? s.id : newStrokeId(),
              color: typeof s.color === "string" ? s.color : "#ef4444",
              width: Number(s.width) || PEN_WIDTH,
              opacity: Number(s.opacity) || 1,
              points,
            });
          }
          if (arr.length) strokesByVisibleIndex.set(i, arr);
        }
        if (typeof msg.active === "boolean") {
          active = msg.active;
          svg.style.pointerEvents = active ? "auto" : "none";
          svg.style.cursor = active ? "crosshair" : "default";
          toolbar.style.display = active ? "flex" : "none";
        }
        currentVisibleIndex = ctx.player.current();
        renderCurrentSlide();
      } finally {
        applyingRemote = false;
      }
    });

    return () => {
      offAttach();
      offLive();
      doc.removeEventListener("keydown", onKey, true);
      offSlide();
      svg.remove();
      toolbar.remove();
    };
  },
};
