// ECMA-376 Part 1 §19.5 PresentationML Animations
// 严格按规范命名，零损失保留 XML 结构。
// 所有时间单位 ms（OOXML 原生）；角度 60000 = 1°；百分比 100000 = 1.0；点坐标 100000 = slide 维度的 100%。
// 类型守卫
export function isContainer(n) {
    return n.kind === "par" || n.kind === "seq" || n.kind === "excl";
}
export function isBehavior(n) {
    return (n.kind === "set" ||
        n.kind === "anim" ||
        n.kind === "animClr" ||
        n.kind === "animEffect" ||
        n.kind === "animMotion" ||
        n.kind === "animRot" ||
        n.kind === "animScale" ||
        n.kind === "cmd");
}
export function isMedia(n) {
    return n.kind === "audio" || n.kind === "video";
}
export function getCTn(n) {
    if (isContainer(n))
        return n.ctn;
    if (isMedia(n))
        return n.cMediaNode.ctn;
    return n.cBhvr.ctn;
}
export function getTgtEl(n) {
    if (isContainer(n))
        return undefined;
    if (isMedia(n))
        return n.cMediaNode.tgtEl;
    return n.cBhvr.tgtEl;
}
export function getChildren(n) {
    return getCTn(n).childTnLst ?? [];
}
// subTnLst 单独取出：含音频/"播放完成后隐藏/快退"等附加效果。需要单独编译并
// 用 tn 引用对齐绝对时间，不能与 childTnLst 共用同一相对 offset 计算路径。
export function getSubChildren(n) {
    return getCTn(n).subTnLst ?? [];
}
