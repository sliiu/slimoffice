import type { Plugin } from "@ppt/plugin-sdk";
import { CanvasBackend, waitForImagesLoaded, type Scene } from "@ppt/renderer";
import { createTranslator } from "../i18n";

function pptFileBase(ctx: { presentation: { title?: string }; shared: Record<string, unknown> }): string {
  const raw = String(ctx.shared["ppt:fileName"] ?? ctx.presentation.title ?? "").trim();
  const noExt = raw.replace(/\.(pptx|pptm|ppt)$/i, "");
  const safe = noExt.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, " ").trim();
  return safe || "presentation";
}

function downloadBlob(blob: Blob, filename: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.getContext("2d")?.getImageData(0, 0, 1, 1);
    } catch (e) {
      reject(e);
      return;
    }
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
  });
}

async function rasterLiveScene(scene: Scene): Promise<Blob> {
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-99999px;top:0;width:${scene.width}px;height:${scene.height}px`;
  document.body.appendChild(host);
  const be = new CanvasBackend(scene, host, { pixelRatio: window.devicePixelRatio || 1 });
  try {
    be.flush();
    await waitForImagesLoaded();
    be.flush();
    return await canvasToBlob(be.canvas);
  } finally {
    be.destroy();
    host.remove();
  }
}

export const screenshotPlugin: Plugin = {
  id: "official:screenshot",
  name: "Screenshot",
  version: "1.0.0",
  activate(ctx) {
    const tr = createTranslator(ctx.locale);

    const capture = async (): Promise<void> => {
      const getScene = ctx.shared["ppt:liveScene"] as (() => Scene | null) | undefined;
      const scene = getScene?.();
      if (!scene) {
        ctx.log("screenshot: no scene");
        return;
      }
      try {
        const blob = await rasterLiveScene(scene);
        const n = ctx.player.current() + 1;
        downloadBlob(blob, `${pptFileBase(ctx)}-slide-${n}.png`);
      } catch (e) {
        ctx.log("screenshot failed", e);
      }
    };

    const menu = ctx.contextMenu.addItem({
      id: "screenshot:save",
      label: tr("screenshot.menu.save"),
      shortcut: "S",
      group: "plugin",
      order: 120,
      onClick: () => void capture(),
    });

    ctx.ui.addToolbarButton({
      label: tr("screenshot.toolbar"),
      tooltip: tr("screenshot.menu.save"),
      position: "end",
      onClick: () => void capture(),
    });

    return () => menu.remove();
  },
};
