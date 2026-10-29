"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyEntranceHideToScene = applyEntranceHideToScene;
exports.revealDesignedAppearance = revealDesignedAppearance;
const core_1 = require("@sliiu/present-core");
/**
 * 放映专用：按当前 timing 把 entrance 目标在 scene 上藏起来（opacity=0 / 段落级 hide）。
 *
 * 编辑器会 `forceVisibleForEdit`，让入场图形在编辑态全部可见；分享 / 导出 / 直播快照
 * 打的是这份数据。播放器必须在这里重算 hidden-until-entrance，不能依赖 shape.opacity。
 */
function applyEntranceHideToScene(scene, slide) {
    const st = (0, core_1.computeInitialEntranceState)(slide);
    for (const s of st.hiddenShapes) {
        const node = scene.root.findById(s.id);
        if (node)
            node.setProperty("opacity", 0);
    }
    for (const o of st.paraOverrides) {
        const node = scene.root.findById(o.shapeId);
        if (!node)
            continue;
        if (o.opacity !== undefined)
            node.setParaProperty(o.paraIdx, "opacity", o.opacity);
    }
    for (const o of st.charOverrides) {
        const node = scene.root.findById(o.shapeId);
        if (!node)
            continue;
        if (o.opacity !== undefined) {
            node.setCharRangeProperty(o.paraIdx, o.unit, o.start, o.end, "opacity", o.opacity);
        }
    }
}
/**
 * 放映缩略图 / 下一张预览：画出设计稿，而不是「点击前隐藏」的初态。
 *
 * 进入放映时编辑器会把 entrance 目标的 opacity 写回 0。播放舞台要这个初态，
 * 缩略图如果跟着藏，演讲者看到的是空白页。只改 scene，不改 slide 数据。
 */
function revealDesignedAppearance(scene, slide) {
    const st = (0, core_1.computeInitialEntranceState)(slide);
    for (const s of st.hiddenShapes) {
        const node = scene.root.findById(s.id);
        if (node)
            node.setProperty("opacity", 1);
    }
    for (const o of st.paraOverrides) {
        const node = scene.root.findById(o.shapeId);
        if (!node)
            continue;
        if (o.opacity === 0)
            node.setParaProperty(o.paraIdx, "opacity", 1);
    }
    for (const o of st.charOverrides) {
        const node = scene.root.findById(o.shapeId);
        if (!node)
            continue;
        if (o.opacity === 0) {
            node.setCharRangeProperty(o.paraIdx, o.unit, o.start, o.end, "opacity", 1);
        }
    }
}
