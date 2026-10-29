"use strict";
// ECMA-376 §19.5.18 cTn 中 fill / repeatCount / repeatDur / autoRev 的精确解析。
//
// 这些字段在 leaf (Atom) 与 step (CompiledStep) 两个层面都会用到（叶子节点上的
// repeat / 容器节点上的 repeat 都合法），所以集中到一个工具模块。
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveHold = resolveHold;
exports.resolveIterations = resolveIterations;
exports.resolveSpdRatio = resolveSpdRatio;
exports.spdReverses = spdReverses;
exports.reversedLocalTime = reversedLocalTime;
exports.parseTmFilter = parseTmFilter;
// §19.5.21 cTn.fill：动画结束后属性的处理方式。
//   规范默认 = "remove"：动画结束后撤销动画属性，回到初始值
//   "hold"/"freeze"：保留末态
//   "transition"：与 "remove" 等价
//
// §19.5.18 fill 沿父容器继承：父 par 容器设了 fill="hold"，子 leaf 缺省也是 hold。
// 这是 entrance / exit 能"末态保留"的语义来源（preset par 容器 cTn.fill="hold"，
// 内部 set / anim / animEffect leaf 不必显式 fill 也按 hold 处理）。
// emphasis preset par 容器同样 fill="hold"，但内部"瞬时强调"如 fade/out 末态
// 表现为元素消失——所以严格继承会破坏 emphasis 的视觉行为。
//
// 折中策略：
//   1. leaf 自己显式 fill="remove"/"transition" → 撤销
//   2. leaf 自己显式 fill="hold"/"freeze"       → 保留
//   3. 都没显式：继承父链路上最近的 fill；若全无（顶层 par 也没）按规范 remove。
//      —— 这等价于 "PowerPoint 实测 entrance/exit/emphasis 行为"的最大公约数。
function resolveHold(cTn, ancestorFill) {
    const fill = cTn.fill ?? ancestorFill;
    return fill === "hold" || fill === "freeze";
}
// iterations: number | Infinity
//   优先级：repeatCount = "indefinite" → Infinity
//          repeatCount 数值 → repeatCount/1000
//          repeatDur 数值 + 已知 duration → repeatDur / (duration*1000)
//          否则 1
//   注意：autoRev 不影响 iterations 计数；§19.5.18 说 autoRev 在每次 iter 内部反向。
//   duration 单位秒（compile 层）；repeatCount/repeatDur 原生单位 ms。
function resolveIterations(cTn, durationSec) {
    if (cTn.repeatCount === "indefinite")
        return Infinity;
    if (typeof cTn.repeatCount === "number" && cTn.repeatCount > 0) {
        return Math.max(1, cTn.repeatCount / 1000);
    }
    if (cTn.repeatDur === "indefinite")
        return Infinity;
    if (typeof cTn.repeatDur === "number" &&
        cTn.repeatDur > 0 &&
        durationSec > 0) {
        return Math.max(1, cTn.repeatDur / 1000 / durationSec);
    }
    return 1;
}
// §19.5.18 cTn@spd: 时长缩放比例（"100%"/"50000"=50%/数字百分比）。返回非负倍率，
// 0 表示无效（解析失败回退 1）。PowerPoint 非规范字符串 "slow"/"med"/"fast"
// 这里按 PowerPoint 实测大致对应表映射（Microsoft 文档：slow=0.5×, med=1×, fast=2×）。
// 负值表示反向播放。倍率仍取绝对值；方向见 spdReverses。
function resolveSpdRatio(spd) {
    if (spd === undefined)
        return 1;
    const s = spd.trim().toLowerCase();
    if (s === "" || s === "med" || s === "medium" || s === "normal")
        return 1;
    if (s === "slow")
        return 0.5;
    if (s === "fast")
        return 2;
    if (s === "veryslow")
        return 0.25;
    if (s === "veryfast")
        return 4;
    // 数字形式："50%" 或 "50000"（千分比常被错写为百分比，按 50000 ≈ 50% 解析）。
    if (s.endsWith("%")) {
        const n = Number(s.slice(0, -1));
        if (Number.isFinite(n) && n !== 0)
            return Math.abs(n) / 100;
    }
    const n = Number(s);
    if (Number.isFinite(n) && n !== 0) {
        return Math.abs(n) / 100000;
    }
    return 1;
}
/** cTn@spd 为负时，这一段从末态播回起点。命名速度没有负号。 */
function spdReverses(spd) {
    if (!spd)
        return false;
    const s = spd.trim();
    if (s.endsWith("%")) {
        const n = Number(s.slice(0, -1));
        return Number.isFinite(n) && n < 0;
    }
    const n = Number(s);
    return Number.isFinite(n) && n < 0;
}
/** 反向时 t=0 落在时长末尾，t=duration 落在起点。 */
function reversedLocalTime(t, duration, reverse) {
    if (!reverse || duration <= 0)
        return t;
    const clamped = Math.min(duration, Math.max(0, t));
    return duration - clamped;
}
// §19.5.18 cTn@tmFilter (SMIL 2.1 timeFilter)：分段线性 (t, v) 列表，定义 dur 内
// 当前 progress 到目标 progress 的映射，可与 accel/decel 叠加。返回一个 easing 函数
// (t∈[0,1] → 输出 progress∈[0,1])；解析失败返回 undefined。
//
// 字符串格式：以分号分隔关键点，每个点是 "t,v"；分号末尾可省略。
// 同 (t1<=t2<=...<=tN)；第一个 t 通常 0，最后通常 1。
function parseTmFilter(s) {
    if (!s)
        return undefined;
    const points = [];
    for (const seg of s.split(/[;\n]+/)) {
        const trimmed = seg.trim();
        if (!trimmed)
            continue;
        const parts = trimmed.split(/[,\s]+/).filter(Boolean).map(Number);
        if (parts.length < 2)
            continue;
        const t = parts[0];
        const v = parts[1];
        if (!Number.isFinite(t) || !Number.isFinite(v))
            continue;
        points.push([t, v]);
    }
    if (points.length < 2)
        return undefined;
    points.sort((a, b) => a[0] - b[0]);
    return (x) => {
        if (x <= points[0][0])
            return points[0][1];
        const last = points[points.length - 1];
        if (x >= last[0])
            return last[1];
        for (let i = 0; i < points.length - 1; i++) {
            const [t0, v0] = points[i];
            const [t1, v1] = points[i + 1];
            if (x >= t0 && x <= t1) {
                const span = t1 - t0;
                const local = span > 0 ? (x - t0) / span : 0;
                return v0 + (v1 - v0) * local;
            }
        }
        return last[1];
    };
}
