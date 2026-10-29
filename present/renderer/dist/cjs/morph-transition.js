"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mountMorphTransitionLayers = mountMorphTransitionLayers;
const svg_backend_1 = require("./svg-backend");
function overlayBoxStyle(stage) {
    return [
        "position:absolute",
        `left:${stage.offsetLeft}px`,
        `top:${stage.offsetTop}px`,
        `width:${stage.style.width || `${stage.clientWidth}px`}`,
        `height:${stage.style.height || `${stage.clientHeight}px`}`,
        "pointer-events:none",
        "overflow:hidden",
    ].join(";");
}
/**
 * Mount SVG shape layers for morph (FLIP) when the live stage lacks per-shape DOM
 * ids (canvas / hybrid bitmap segments). Pure-SVG stages only need the ghost overlay.
 */
function mountMorphTransitionLayers(stageWrap, stage, prevScene, curScene, opts = {}) {
    const ghostZ = opts.ghostZIndex ?? 1000;
    const stageZ = opts.stageZIndex ?? 1001;
    const ghostWrap = document.createElement("div");
    ghostWrap.style.cssText = `${overlayBoxStyle(stage)};z-index:${ghostZ}`;
    if (opts.chromeBg)
        ghostWrap.style.background = opts.chromeBg;
    stageWrap.appendChild(ghostWrap);
    const ghostBe = new svg_backend_1.SvgBackend(prevScene, ghostWrap, { transparent: true });
    ghostBe.flush();
    const needsStageOverlay = !stage.querySelector("[data-id],[data-shape-id]");
    let stageOverlay = null;
    let stageBe = null;
    let target = stage;
    let hidStage = false;
    if (needsStageOverlay) {
        stageOverlay = document.createElement("div");
        stageOverlay.style.cssText = `${overlayBoxStyle(stage)};z-index:${stageZ}`;
        stageWrap.appendChild(stageOverlay);
        stageBe = new svg_backend_1.SvgBackend(curScene, stageOverlay, { transparent: true });
        stageBe.flush();
        target = stageOverlay;
        stage.style.visibility = "hidden";
        hidStage = true;
    }
    return {
        ghost: ghostWrap,
        target,
        cleanup() {
            ghostBe.destroy();
            stageBe?.destroy();
            ghostWrap.remove();
            stageOverlay?.remove();
            if (hidStage)
                stage.style.visibility = "";
        },
    };
}
