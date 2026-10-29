// 阶段 C 拆分后的 compile 子目录 barrel。
// 外部代码（runtime / player / scripts / editor）继续通过 "./compile" 导入。

export type {
  TargetInfo,
  Resolver,
  TextSlice,
  TnTimeEntry,
  CompileCtx,
  CompileBuildSpec,
  BuildEnumerator,
  TrackKind,
  PropTrack,
  MotionTrack,
  FilterTrack,
  CmdTrack,
  MediaTrack,
  AtomTrack,
  LeafNode,
  Atom,
  AtomInstance,
  StepTrigger,
  CompiledStep,
  CompiledTiming,
  AncestorEntrExitPreset,
} from "./types";

export { compileTiming } from "./core";
export { resolveHold, resolveIterations } from "./timing-prop";
export { buildBuildIndex, findBuild, chartSplitCount } from "./builds";
export type { BuildIndex } from "./builds";
export { buildTnIndex, walkTn } from "./tn-index";
export { walkInstances } from "./walk";
export { compileLeaf } from "./leaf";
export { buildStep, appendAutoStep, emit } from "./emit";
export { expandIterateSlices, withTgtEl } from "./iterate";
export {
  triggerOf,
  hasOnClick,
  shapeClickTarget,
  containsClick,
  CLICK_LIKE_EVTS,
} from "./trigger";
export {
  genId,
  msOf,
  condDelay,
  decodeAnimVal,
  decodeTavValue,
  tavEasing,
  leafDefaultDuration,
  shouldDelegateAnimToParPreset,
} from "./helpers";
