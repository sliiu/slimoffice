export const STD_EASE = "cubic-bezier(0.4, 0, 0.2, 1)";
export const LINEAR = "linear";
export function dirVec(dir, w, h) {
    switch (dir) {
        case "left":
            return { dx: w, dy: 0, axis: "x", sign: 1 };
        case "right":
            return { dx: -w, dy: 0, axis: "x", sign: -1 };
        case "up":
            return { dx: 0, dy: h, axis: "y", sign: 1 };
        case "down":
            return { dx: 0, dy: -h, axis: "y", sign: -1 };
        case "topLeft":
            return { dx: w, dy: h, axis: "x", sign: 1 };
        case "topRight":
            return { dx: -w, dy: h, axis: "x", sign: -1 };
        case "bottomLeft":
            return { dx: w, dy: -h, axis: "x", sign: 1 };
        case "bottomRight":
            return { dx: -w, dy: -h, axis: "x", sign: -1 };
        default:
            return { dx: w, dy: 0, axis: "x", sign: 1 };
    }
}
export async function runAll(anims, cleanup) {
    await Promise.all(anims.map((a) => a.finished.catch(() => undefined)));
    for (const a of anims) {
        try {
            a.commitStyles();
        }
        catch {
            // ignore
        }
        a.cancel();
    }
    cleanup?.();
}
export function ms(ctx) {
    return Math.max(1, ctx.duration * 1000);
}
export function easing(ctx) {
    return ctx.params?.ease ?? STD_EASE;
}
