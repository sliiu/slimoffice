// ECMA-376 §19.5.50 p:transition
//   advClick 缺省为 true：单击可以在动画播完后换到下一页。
//   显式 advClick="0"：单击只推进本页动画，不换页。
//   advTm 缺省表示没有自动换片。写了 0 仍是自动换片，但要等本页自动动画播完，
//   不能在开播的同一刻切走。正数从开播起按墙钟计。
export function clickAdvancesSlide(transition) {
    return transition?.params?.advClick !== false;
}
export function autoAdvanceAfterSec(transition) {
    const adv = transition?.params?.advAfter;
    if (typeof adv !== "number" || !Number.isFinite(adv) || adv < 0)
        return null;
    return adv;
}
/** 从放映开始算，这条自动时间轴何时结束。停在第一次需要单击的 step。 */
export function autoplayTimelineSec(steps) {
    let end = 0;
    for (const s of steps) {
        if (s.trigger !== "onLoad")
            break;
        const reps = Number.isFinite(s.iterations) ? Math.max(1, s.iterations) : 1;
        end += s.delay + s.duration * (s.autoReverse ? 2 : 1) * reps;
    }
    return end;
}
/**
 * advTm > 0：到点就换，不延长到动画结束。
 * advTm = 0：等自动动画播完再换；没有自动动画则立刻换。
 */
export function autoAdvanceWaitSec(advAfter, autoplaySec) {
    if (advAfter > 0)
        return advAfter;
    return autoplaySec > 0 ? autoplaySec : 0;
}
