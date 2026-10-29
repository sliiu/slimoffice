/**
 * 改背景 paint 时断开主题 bgRef，否则 from-scratch 仍会写出旧的 `<p:bgRef>`。
 */
export function assignSlideBackground(host, next) {
    host.background = next;
    delete host.bgRef;
}
// ECMA-376 §19.5.50 p:transition@spd — fast/med/slow 三档对应的标准秒数。
// 这是 OOXML 规范的标定常量（不是项目内的启发式取值），parse 与 serialize 共用。
export const TRANSITION_SPEED_TO_SEC = Object.freeze({
    fast: 0.5,
    med: 0.75,
    slow: 1.25,
});
