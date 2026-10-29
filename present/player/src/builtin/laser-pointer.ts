// 激光笔插件
//
// 给放映加一个红色「激光点」：开启后鼠标在 stage 上移动时显示一个发光红点，
// 帮助演讲者指示内容。click 翻页仍然可用。
//
// 实现：一个 absolute-positioned 的 div 跟随鼠标，pointer-events: none，
// 不影响任何点击 / 动画触发。

import type { Plugin } from "@ppt/plugin-sdk";
import { createTranslator } from "../i18n";

export const laserPointerPlugin: Plugin = {
  id: "official:laser-pointer",
  name: "Laser Pointer",
  version: "1.0.0",
  activate(ctx) {
    const tr = createTranslator(ctx.locale);
    const stage = ctx.ui.stageElement();
    const root = ctx.ui.rootElement();
    const doc = root.ownerDocument;

    const dot = doc.createElement("div");
    dot.style.cssText = [
      "position:absolute",
      "width:14px",
      "height:14px",
      "border-radius:50%",
      "background:radial-gradient(circle at center,#ff4b4b 0%,#ff4b4b 30%,rgba(255,75,75,0) 70%)",
      "box-shadow:0 0 12px rgba(255,75,75,.8),0 0 24px rgba(255,75,75,.4)",
      "pointer-events:none",
      "z-index:55",
      "display:none",
      "transform:translate(-50%,-50%)",
    ].join(";");
    root.appendChild(dot);

    let active = false;

    let lastLive = 0;
    const remoteDots = new Map<string, HTMLDivElement>();

    const mkRemoteDot = (): HTMLDivElement => {
      const el = doc.createElement("div");
      el.style.cssText = [
        "position:absolute",
        "width:14px",
        "height:14px",
        "border-radius:50%",
        "background:radial-gradient(circle at center,#60a5fa 0%,#60a5fa 30%,rgba(96,165,250,0) 70%)",
        "box-shadow:0 0 12px rgba(96,165,250,.8),0 0 24px rgba(96,165,250,.4)",
        "pointer-events:none",
        "z-index:54",
        "display:none",
        "transform:translate(-50%,-50%)",
      ].join(";");
      root.appendChild(el);
      return el;
    };

    const toSlide = (e: PointerEvent): { x: number; y: number } | null => {
      const r = stage.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return null;
      return {
        x: ((e.clientX - r.left) / r.width) * ctx.presentation.size.width,
        y: ((e.clientY - r.top) / r.height) * ctx.presentation.size.height,
      };
    };

    const placeDot = (el: HTMLDivElement, x: number, y: number): void => {
      const r = stage.getBoundingClientRect();
      const rootR = root.getBoundingClientRect();
      el.style.left = r.left - rootR.left + (x / ctx.presentation.size.width) * r.width + "px";
      el.style.top = r.top - rootR.top + (y / ctx.presentation.size.height) * r.height + "px";
      el.style.display = "block";
    };

    const onMove = (e: PointerEvent): void => {
      if (!active) return;
      const r = root.getBoundingClientRect();
      dot.style.left = e.clientX - r.left + "px";
      dot.style.top = e.clientY - r.top + "px";
      dot.style.display = "block";
      const now = Date.now();
      if (now - lastLive < 40) return;
      lastLive = now;
      const pt = toSlide(e);
      if (pt) ctx.live.send({ t: "pos", x: pt.x, y: pt.y, on: true });
    };
    const onLeave = (): void => {
      dot.style.display = "none";
      ctx.live.send({ t: "pos", on: false }, { snap: true });
    };
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerleave", onLeave);

    const setActive = (on: boolean): void => {
      active = on;
      if (!on) {
        dot.style.display = "none";
        ctx.live.send({ t: "pos", on: false }, { snap: true });
      }
      stage.style.cursor = on ? "none" : "";
    };

    const offLive = ctx.live.on((data, meta) => {
      if (!data || typeof data !== "object") return;
      const msg = data as { t?: string; x?: number; y?: number; on?: boolean };
      if (msg.t !== "pos") return;
      let el = remoteDots.get(meta.from);
      if (!el) {
        el = mkRemoteDot();
        remoteDots.set(meta.from, el);
      }
      if (msg.on === false) {
        el.style.display = "none";
        return;
      }
      const x = Number(msg.x);
      const y = Number(msg.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      placeDot(el, x, y);
    });

    ctx.contextMenu.addItem({
      id: "laser:toggle",
      kind: "checkbox",
      label: tr("laser.menu.toggle"),
      shortcut: "L",
      group: "plugin",
      order: 110,
      checked: () => active,
      onClick: () => setActive(!active),
    });

    return () => {
      offLive();
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerleave", onLeave);
      stage.style.cursor = "";
      dot.remove();
      for (const el of remoteDots.values()) el.remove();
    };
  },
};
