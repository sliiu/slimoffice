import type { Plugin } from "@ppt/plugin-sdk";
import { createTranslator } from "../i18n";

const HOST = "ws://127.0.0.1:19520/host";

function notesFor(ctx: Parameters<Plugin["activate"]>[0], visibleIndex: number): string {
  const abs = ctx.presentation.visibleOrder[visibleIndex];
  const slide = abs !== undefined ? ctx.presentation.slides[abs] : undefined;
  return slide?.notes?.trim() || "";
}

function titleFor(ctx: Parameters<Plugin["activate"]>[0], visibleIndex: number): string {
  const abs = ctx.presentation.visibleOrder[visibleIndex];
  const slide = abs !== undefined ? ctx.presentation.slides[abs] : undefined;
  return slide?.name || "";
}

function pushState(
  ws: WebSocket,
  ctx: Parameters<Plugin["activate"]>[0],
  startedAt: number,
): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  const visibleIndex = ctx.player.current();
  const step = ctx.player.step();
  ws.send(
    JSON.stringify({
      v: 1,
      type: "state",
      slide: visibleIndex + 1,
      total: ctx.player.total(),
      step: step.currentStep,
      steps: step.totalSteps,
      elapsed: Math.floor((Date.now() - startedAt) / 1000),
      playing: true,
      title: titleFor(ctx, visibleIndex),
      notes: notesFor(ctx, visibleIndex),
    }),
  );
}

/** Bridge SlimPPT playback to the PassPad companion / AI Passport remote. */
export const passpadPlugin: Plugin = {
  id: "official:passpad",
  name: "PassPad Remote",
  version: "0.1.0",
  activate(ctx) {
    const tr = createTranslator(ctx.locale);
    const startedAt = Date.now();
    let ws: WebSocket | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    const status = ctx.ui.rootElement().ownerDocument.createElement("div");
    status.style.cssText = "font-size:13px;line-height:1.5;color:var(--ppt-dock-fg,#e2e8f0);";
    status.textContent = tr("passpad.connecting");

    ctx.ui.addPanel({
      id: "passpad-remote",
      title: tr("passpad.panel.title"),
      order: 35,
      initialOpen: true,
      render: (host) => {
        host.appendChild(status);
      },
    });

    const applyCmd = (action: string, index?: number): void => {
      if (action === "next" || action === "nextStep") {
        if (!ctx.player.nextStep()) ctx.player.next();
      } else if (action === "prev" || action === "prevStep") {
        ctx.player.prev();
      } else if (action === "goto" && typeof index === "number") {
        ctx.player.goto(Math.max(0, index - 1));
      } else if (action === "exit") {
        ctx.player.goto(ctx.player.total() - 1);
      }
    };

    const connect = (): void => {
      try {
        ws = new WebSocket(HOST);
      } catch {
        status.textContent = tr("passpad.unreachable");
        return;
      }
      ws.onopen = () => {
        status.textContent = tr("passpad.linked");
        ws?.send(JSON.stringify({ v: 1, type: "hello", role: "host", host: "slimppt" }));
        if (ws) pushState(ws, ctx, startedAt);
      };
      ws.onclose = () => {
        status.textContent = tr("passpad.disconnected");
      };
      ws.onerror = () => {
        status.textContent = tr("passpad.unreachableHint");
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as { type?: string; action?: string; index?: number };
          if (msg.type === "cmd" && msg.action) applyCmd(msg.action, msg.index);
        } catch {
          /* ignore */
        }
      };
    };

    connect();
    const offSlide = ctx.events.on("slidechange", () => {
      if (ws) pushState(ws, ctx, startedAt);
    });
    const offStep = ctx.events.on("stepchange", () => {
      if (ws) pushState(ws, ctx, startedAt);
    });
    timer = setInterval(() => {
      if (ws) pushState(ws, ctx, startedAt);
    }, 5000);

    return () => {
      offSlide();
      offStep();
      if (timer) clearInterval(timer);
      ws?.close();
    };
  },
};
