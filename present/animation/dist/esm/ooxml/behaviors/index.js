// 行为节点编译器注册表。
// 每个 `kind` 对应一个编译函数。compileLeaf 通过 switch 调度，
// 这里集中导出便于阶段 A 引入新的预设展开器后统一替换。
export { compileSet } from "./set.js";
export { compileAnim } from "./anim.js";
export { compileAnimClr } from "./anim-clr.js";
export { compileAnimEffect } from "./anim-effect.js";
export { compileAnimMotion } from "./anim-motion.js";
export { compileAnimRot } from "./anim-rot.js";
export { compileAnimScale } from "./anim-scale.js";
export { compileCmd } from "./cmd.js";
export { compileMedia } from "./media.js";
