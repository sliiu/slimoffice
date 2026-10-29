// 行为节点编译器注册表。
// 每个 `kind` 对应一个编译函数。compileLeaf 通过 switch 调度，
// 这里集中导出便于阶段 A 引入新的预设展开器后统一替换。

export { compileSet } from "./set";
export { compileAnim } from "./anim";
export { compileAnimClr } from "./anim-clr";
export { compileAnimEffect } from "./anim-effect";
export { compileAnimMotion } from "./anim-motion";
export { compileAnimRot } from "./anim-rot";
export { compileAnimScale } from "./anim-scale";
export { compileCmd } from "./cmd";
export { compileMedia } from "./media";
