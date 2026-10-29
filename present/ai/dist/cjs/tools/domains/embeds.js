"use strict";
// OLE / 3D 模型 / Web 嵌入 —— 插入与替换。
//
// 都走 @sliiu/present-editor/commands 的专用 Insert*Cmd，append 到 layers[0]。
// `src` / `embedSrc` / `glbSrc` 必须是 data: URL 才能嵌进导出的 PPTX。
Object.defineProperty(exports, "__esModule", { value: true });
exports.embedTools = void 0;
const zod_1 = require("zod");
const core_1 = require("@sliiu/present-core");
const commands_1 = require("@sliiu/present-editor/commands");
const types_1 = require("../types");
const rectSchema = zod_1.z.object({
    x: zod_1.z.number(),
    y: zod_1.z.number(),
    w: zod_1.z.number().min(1),
    h: zod_1.z.number().min(1),
});
function defaultBbox(pres, ratio = 0.45) {
    const w = Math.max(80, pres.size.width * ratio);
    const h = Math.max(80, pres.size.height * ratio);
    return { x: (pres.size.width - w) / 2, y: (pres.size.height - h) / 2, w, h };
}
function bytesToDataUrl(bytes) {
    const b64 = typeof Buffer !== "undefined"
        ? Buffer.from(bytes).toString("base64")
        : btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""));
    return `data:model/gltf-binary;base64,${b64}`;
}
async function loadPresetGlb(presetId) {
    const preset = core_1.MODEL3D_PRESETS.find((p) => p.id === presetId) ?? core_1.MODEL3D_PRESETS[0];
    if (!preset)
        return { error: `unknown 3D preset "${presetId}"` };
    const url = `/${preset.samplePath}`.replace(/\/{2,}/g, "/");
    try {
        const res = await fetch(url);
        if (!res.ok)
            return { error: `3D preset ${preset.id} unavailable (${res.status})` };
        const glbSrc = bytesToDataUrl(new Uint8Array(await res.arrayBuffer()));
        return { id: preset.id, glbSrc };
    }
    catch (e) {
        return { error: `3D preset ${preset.id} failed: ${e.message}` };
    }
}
exports.embedTools = [
    (0, types_1.defineTool)({
        name: "insertOle",
        description: "Insert an embedded OLE object (Excel / Word / PDF / generic binary) onto a slide. `embedSrc` must be a data: URL of the file bytes. Renders as an icon (or preview when the payload contains a raster). Follow up with reorderShape if it covers text.",
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            fileName: zod_1.z.string().min(1).describe("Original file name including extension, e.g. report.xlsx"),
            embedSrc: zod_1.z.string().min(8).describe("data: URL of the embedded file bytes."),
            bbox: rectSchema.optional(),
            showAsIcon: zod_1.z.boolean().optional().describe("Default true — show as icon instead of content preview."),
        }),
        tags: ["mutate", "shape"],
        execute: (rt, { slideIdx, fileName, embedSrc, bbox, showAsIcon }) => {
            const pres = rt.getPres();
            if (!pres.slides[slideIdx])
                return (0, types_1.err)(`slideIdx ${slideIdx} out of range`);
            const cmd = new commands_1.InsertOleCmd(slideIdx, 0, {
                fileName,
                embedSrc,
                bbox: bbox ?? defaultBbox(pres),
                showAsIcon: showAsIcon ?? true,
            });
            const res = rt.apply(cmd);
            if (!res.ok)
                return res;
            return (0, types_1.ok)({ slideIdx, shapeId: cmd.shape.id, kind: "ole" });
        },
    }),
    (0, types_1.defineTool)({
        name: "replaceOleEmbed",
        description: "Replace the embedded file bytes on an existing OLE shape. Pass a new fileName + embedSrc data URL.",
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            shapeId: zod_1.z.string(),
            fileName: zod_1.z.string().min(1),
            embedSrc: zod_1.z.string().min(8),
        }),
        tags: ["mutate", "shape"],
        shapeScoped: true,
        execute: (rt, { slideIdx, shapeId, fileName, embedSrc }) => rt.apply(new commands_1.UpdateOleEmbedCmd(slideIdx, shapeId, fileName, embedSrc)),
    }),
    (0, types_1.defineTool)({
        name: "setOleShowAsIcon",
        description: "Toggle whether an OLE object displays as an icon (true) or as a content preview (false).",
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            shapeId: zod_1.z.string(),
            showAsIcon: zod_1.z.boolean(),
        }),
        tags: ["mutate", "shape"],
        shapeScoped: true,
        execute: (rt, { slideIdx, shapeId, showAsIcon }) => rt.apply(new commands_1.SetOleShowAsIconCmd(slideIdx, shapeId, showAsIcon)),
    }),
    (0, types_1.defineTool)({
        name: "insertModel3D",
        description: "Insert a 3D model (glTF / GLB) onto a slide. `glbSrc` must be a data: URL of the .glb bytes. `presetId` is a library id (currently `cube`) used for naming; the actual mesh comes from glbSrc. Follow up with reorderShape if it covers text.",
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            glbSrc: zod_1.z.string().min(8).describe("data: URL of the GLB payload."),
            presetId: zod_1.z.string().default("cube"),
            objectName: zod_1.z.string().max(80).optional(),
            bbox: rectSchema.optional(),
        }),
        tags: ["mutate", "shape"],
        execute: (rt, { slideIdx, glbSrc, presetId, objectName, bbox }) => {
            const pres = rt.getPres();
            if (!pres.slides[slideIdx])
                return (0, types_1.err)(`slideIdx ${slideIdx} out of range`);
            const cmd = new commands_1.InsertModel3DCmd(slideIdx, 0, presetId, glbSrc, bbox ?? defaultBbox(pres), objectName);
            const res = rt.apply(cmd);
            if (!res.ok)
                return res;
            return (0, types_1.ok)({ slideIdx, shapeId: cmd.shape.id, kind: "model3d" });
        },
    }),
    (0, types_1.defineTool)({
        name: "replaceModel3D",
        description: "Replace the GLB payload on an existing 3D model shape. Optionally rename it.",
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            shapeId: zod_1.z.string(),
            glbSrc: zod_1.z.string().min(8),
            objectName: zod_1.z.string().max(80).optional(),
        }),
        tags: ["mutate", "shape"],
        shapeScoped: true,
        execute: (rt, { slideIdx, shapeId, glbSrc, objectName }) => rt.apply(new commands_1.UpdateModel3DGlbCmd(slideIdx, shapeId, glbSrc, objectName)),
    }),
    (0, types_1.defineTool)({
        name: "listModel3DPresets",
        description: "List built-in 3D model presets for insertModel3DPreset (currently cube).",
        inputSchema: zod_1.z.object({}),
        tags: ["read", "shape"],
        execute: async () => (0, types_1.ok)({ presets: core_1.MODEL3D_PRESETS.map((p) => ({ id: p.id, label: p.label })) }),
    }),
    (0, types_1.defineTool)({
        name: "insertModel3DPreset",
        description: "Insert a built-in 3D model onto the slide (presetId from listModel3DPresets, default cube). Use on cover/hero/stat as a visual accent, not a full-slide backdrop. Follow with reorderShape if it covers text.",
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            presetId: zod_1.z.string().default("cube"),
            objectName: zod_1.z.string().max(80).optional(),
            bbox: rectSchema.optional(),
        }),
        tags: ["mutate", "shape"],
        execute: async (rt, { slideIdx, presetId, objectName, bbox }) => {
            const pres = rt.getPres();
            if (!pres.slides[slideIdx])
                return (0, types_1.err)(`slideIdx ${slideIdx} out of range`);
            const loaded = await loadPresetGlb(presetId);
            if ("error" in loaded)
                return (0, types_1.err)(loaded.error);
            const cmd = new commands_1.InsertModel3DCmd(slideIdx, 0, loaded.id, loaded.glbSrc, bbox ?? defaultBbox(pres, 0.28), objectName);
            const res = rt.apply(cmd);
            if (!res.ok)
                return res;
            return (0, types_1.ok)({ slideIdx, shapeId: cmd.shape.id, kind: "model3d", presetId: loaded.id });
        },
    }),
    (0, types_1.defineTool)({
        name: "insertWebEmbed",
        description: "Insert a web iframe embed (YouTube / Vimeo only) onto a slide. Pass the original watch URL; it is normalized to a safe embed src. Custom HTTPS pages are rejected. PPTX export degrades this to a placeholder — warn the user if they need a true Office object.",
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            url: zod_1.z.string().min(8).describe("YouTube or Vimeo URL to embed."),
            bbox: rectSchema.optional(),
            allowFullscreen: zod_1.z.boolean().optional(),
        }),
        tags: ["mutate", "shape"],
        execute: (rt, { slideIdx, url, bbox, allowFullscreen }) => {
            const pres = rt.getPres();
            if (!pres.slides[slideIdx])
                return (0, types_1.err)(`slideIdx ${slideIdx} out of range`);
            const embed = (0, core_1.normalizeWebEmbedUrl)(url);
            if (!embed)
                return (0, types_1.err)(`Only YouTube and Vimeo URLs can be embedded: ${url}`);
            const cmd = new commands_1.InsertWebEmbedCmd(slideIdx, 0, {
                embed,
                bbox: bbox ?? defaultBbox(pres, 0.55),
                allowFullscreen: allowFullscreen ?? true,
            });
            const res = rt.apply(cmd);
            if (!res.ok)
                return res;
            return (0, types_1.ok)({ slideIdx, shapeId: cmd.shape.id, kind: "webEmbed", provider: embed.provider });
        },
    }),
];
