"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InsertWebEmbedCmd = void 0;
exports.buildWebEmbedShape = buildWebEmbedShape;
const core_1 = require("@sliiu/present-core");
const shape_factory_1 = require("./shape-factory");
function buildWebEmbedShape(input) {
    const { embed, bbox, allowFullscreen = true } = input;
    const label = embed.provider === "youtube"
        ? "YouTube"
        : embed.provider === "vimeo"
            ? "Vimeo"
            : "Web Embed";
    return {
        id: (0, shape_factory_1.genShapeId)("web"),
        name: label,
        zIndex: 0,
        kind: "webEmbed",
        bbox,
        transform: (0, core_1.identityTransform)(),
        visible: true,
        locked: false,
        opacity: 1,
        embedUrl: embed.embedUrl,
        provider: embed.provider,
        originalUrl: embed.originalUrl,
        allowFullscreen,
        descr: (0, core_1.encodeWebEmbedDescr)(embed),
        hyperlink: { kind: "url", target: embed.originalUrl || embed.embedUrl },
    };
}
/** Insert a web iframe embed (YouTube / Vimeo) onto the active slide layer. */
class InsertWebEmbedCmd {
    slideIdx;
    layerIdx;
    label = "Insert web embed";
    shape;
    constructor(slideIdx, layerIdx, input) {
        this.slideIdx = slideIdx;
        this.layerIdx = layerIdx;
        this.shape = buildWebEmbedShape(input);
    }
    apply(pres) {
        const slide = pres.slides[this.slideIdx];
        const layer = slide?.layers[this.layerIdx];
        if (!layer)
            return;
        layer.shapes.push(this.shape);
    }
    revert(pres) {
        const slide = pres.slides[this.slideIdx];
        const layer = slide?.layers[this.layerIdx];
        if (!layer)
            return;
        const pos = layer.shapes.findIndex((s) => s.id === this.shape.id);
        if (pos >= 0)
            layer.shapes.splice(pos, 1);
    }
}
exports.InsertWebEmbedCmd = InsertWebEmbedCmd;
