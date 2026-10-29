// 阶段 C 拆分后的 compile 子目录 barrel。
// 外部代码（runtime / player / scripts / editor）继续通过 "./compile" 导入。
export { compileTiming } from "./core.js";
export { resolveHold, resolveIterations } from "./timing-prop.js";
export { buildBuildIndex, findBuild, chartSplitCount } from "./builds.js";
export { buildTnIndex, walkTn } from "./tn-index.js";
export { walkInstances } from "./walk.js";
export { compileLeaf } from "./leaf.js";
export { buildStep, appendAutoStep, emit } from "./emit.js";
export { expandIterateSlices, withTgtEl } from "./iterate.js";
export { triggerOf, hasOnClick, shapeClickTarget, containsClick, CLICK_LIKE_EVTS, } from "./trigger.js";
export { genId, msOf, condDelay, decodeAnimVal, decodeTavValue, tavEasing, leafDefaultDuration, shouldDelegateAnimToParPreset, } from "./helpers.js";
