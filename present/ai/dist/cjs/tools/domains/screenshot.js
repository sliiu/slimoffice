"use strict";
// 给正在对话的模型看一页设计稿。浏览器里走 snapshotSlide。
// 没有 DOM 的 MCP 进程不走这里，由服务器改调无头浏览器。
Object.defineProperty(exports, "__esModule", { value: true });
exports.screenshotTools = void 0;
const zod_1 = require("zod");
const player_1 = require("@sliiu/present-player");
const types_1 = require("../types");
function bytesToBase64(bytes) {
    if (typeof Buffer !== "undefined")
        return Buffer.from(bytes).toString("base64");
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
        bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
}
exports.screenshotTools = [
    (0, types_1.defineTool)({
        name: "screenshot_slide",
        description: "Render one slide to a PNG of the designed page (entrance targets stay visible; clicks are not played). Call this after layout, color, or text edits and look at the image for overlap, overflow, and contrast. slideIdx is 0-based. In the editor this uses the canvas snapshot. On the file server the host substitutes a headless-browser capture.",
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
        }),
        tags: ["read"],
        execute: async (rt, { slideIdx }) => {
            if (typeof document === "undefined") {
                return {
                    ok: false,
                    error: "No DOM in this process. The file server captures this slide in a headless browser.",
                };
            }
            const pres = rt.getPres();
            const slide = pres.slides[slideIdx];
            if (!slide)
                return { ok: false, error: `slideIdx ${slideIdx} out of range (have ${pres.slides.length})` };
            const blob = await (0, player_1.snapshotSlide)(slide, pres.size, { width: 960, masters: pres.masters });
            const png = new Uint8Array(await blob.arrayBuffer());
            const slides = [{ slideIdx, pngBase64: bytesToBase64(png) }];
            return { ok: true, slides, note: `Slide ${slideIdx} rendered.` };
        },
    }),
];
