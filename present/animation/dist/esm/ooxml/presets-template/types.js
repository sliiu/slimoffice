// 阶段 A：OOXML 子树模板（preset template registry）
//
// 当前 presets/ 下的硬编码 keyframe 是对 PowerPoint preset 行为的近似，丢失了：
//   - cTn.delay/dur/accel/decel/autoRev/repeatCount/fill 等精确 timing 字段
//   - animEffect filter 的 prLst 完整结构（仅记录字符串）
//   - animMotion path 的 OOXML 原生表达（如 "M 0 0 L 0.5 0.3 E"）
//   - 多个 anim 行为的容器组织（par/seq/withEffect 等）
//
// 子树模板的设计：每个 preset 由一棵预先构造的 TimeNode 子树描述，spid 占位用
// 字面量 "$tgt"，加载时 deepClone + 占位符替换，然后嵌入 timing 树，走完整 compile 路径。
//
// 这样：preset 展开 = 一次 OOXML 子树克隆，与 PowerPoint 写出的 PPT 完全等价。
export {};
