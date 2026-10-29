"use strict";
// §19.5.10 a:animRot — 旋转动画行为。@by/@from/@to 单位 1/60000 度。
//
// 注意 by 模式的 additive 默认：ECMA-376 §19.5.10 写 by = "the amount of rotation to
// add to the current rotation of the object"，天然带 sum 语义。我们在这里只标
// relative=true，由 leaf.ts 的统一 fallback（relative && !additive → "sum"）落到
// PropertyAccumulator 的 sum 通道，这样 spin/shake 类多段 by 才能正确累加而不是各自
// 覆盖。
Object.defineProperty(exports, "__esModule", { value: true });
exports.compileAnimRot = compileAnimRot;
function compileAnimRot(node, dur, parentEasing) {
    const keys = [];
    let relative = false;
    if (node.by !== undefined) {
        keys.push({ time: 0, value: 0 });
        keys.push({ time: dur, value: node.by / 60000, easing: parentEasing });
        relative = true;
    }
    else {
        if (node.from !== undefined)
            keys.push({ time: 0, value: node.from / 60000 });
        if (node.to !== undefined)
            keys.push({ time: dur, value: node.to / 60000, easing: parentEasing });
    }
    if (keys.length === 0)
        return [];
    return [{ kind: "prop", property: "rotation", valueKind: "number", keys, relative }];
}
