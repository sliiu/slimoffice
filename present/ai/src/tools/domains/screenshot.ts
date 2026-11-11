// 给正在对话的模型看一页设计稿。浏览器里走 snapshotSlide。
// 没有 DOM 的 MCP 进程不走这里，由服务器改调无头浏览器。

import { z } from "zod";
import { snapshotSlide } from "@ppt/player";
import { defineTool } from "../types";

export interface SlidePngPayload {
  slideIdx: number;
  pngBase64: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

export const screenshotTools = [
  defineTool({
    name: "screenshot_slide",
    description:
      "Render one slide to a PNG of the designed page (entrance targets stay visible; clicks are not played). Call this after layout, color, or text edits and look at the image for overlap, overflow, and contrast. slideIdx is 0-based. In the editor this uses the canvas snapshot. On the file server the host substitutes a headless-browser capture.",
    inputSchema: z.object({
      slideIdx: z.number().int().min(0),
    }),
    tags: ["read"],
    execute: async (rt, { slideIdx }) => {
      if (typeof document === "undefined") {
        return {
          ok: false as const,
          error: "No DOM in this process. The file server captures this slide in a headless browser.",
        };
      }
      const pres = rt.getPres();
      const slide = pres.slides[slideIdx];
      if (!slide) return { ok: false as const, error: `slideIdx ${slideIdx} out of range (have ${pres.slides.length})` };
      const blob = await snapshotSlide(slide, pres.size, { width: 960, masters: pres.masters });
      const png = new Uint8Array(await blob.arrayBuffer());
      const slides: SlidePngPayload[] = [{ slideIdx, pngBase64: bytesToBase64(png) }];
      return { ok: true as const, slides, note: `Slide ${slideIdx} rendered.` };
    },
  }),
];
