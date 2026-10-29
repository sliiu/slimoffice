"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.vortex = exports.warp = exports.ripple = exports.curtains = exports.drape = exports.switchFx = exports.flip = exports.peelOff = exports.ferris = exports.rotate = exports.flythrough = exports.origami = exports.airplane = exports.crush = exports.wind = exports.pageCurlSingle = exports.pageCurl = exports.window = exports.doors = exports.conveyor = exports.orbit = exports.gallery = exports.box = exports.prism = exports.cube = void 0;
const geometry_1 = require("./geometry");
const twin_1 = require("./twin");
const util_1 = require("./util");
function wrap3d(ctx) {
    const parent = ctx.stage.parentElement;
    if (!parent)
        return { wrap: ctx.stage, cleanup: () => undefined };
    const prevPerspective = parent.style.perspective;
    const prevTransformStyle = parent.style.transformStyle;
    parent.style.perspective = `${Math.max(ctx.stageSize.w, ctx.stageSize.h) * 1.5}px`;
    parent.style.transformStyle = "preserve-3d";
    ctx.stage.style.transformStyle = "preserve-3d";
    ctx.ghost.style.transformStyle = "preserve-3d";
    ctx.stage.style.backfaceVisibility = "hidden";
    ctx.ghost.style.backfaceVisibility = "hidden";
    return {
        wrap: parent,
        cleanup: () => {
            parent.style.perspective = prevPerspective;
            parent.style.transformStyle = prevTransformStyle;
            ctx.stage.style.transformStyle = "";
            ctx.ghost.style.transformStyle = "";
            ctx.stage.style.backfaceVisibility = "";
            ctx.ghost.style.backfaceVisibility = "";
        },
    };
}
const cube = async (ctx) => {
    const dir = String(ctx.params.dir ?? "left");
    const { cleanup } = wrap3d(ctx);
    const w = ctx.stageSize.w;
    const h = ctx.stageSize.h;
    const axis = dir === "left" || dir === "right" ? "Y" : "X";
    const sign = dir === "left" || dir === "up" ? -1 : 1;
    const half = (axis === "Y" ? w : h) / 2;
    const sBase = ctx.stage.style.transform || "";
    const gBase = ctx.ghost.style.transform || "";
    ctx.stage.style.transformOrigin = "center center";
    ctx.ghost.style.transformOrigin = "center center";
    const a = ctx.stage.animate([
        { transform: `translateZ(-${half}px) rotate${axis}(${sign * -90}deg) translateZ(${half}px) ${sBase}` },
        { transform: `translateZ(-${half}px) rotate${axis}(0deg) translateZ(${half}px) ${sBase}` },
    ], { duration: (0, util_1.ms)(ctx), easing: (0, util_1.easing)(ctx), fill: "forwards" });
    const b = ctx.ghost.animate([
        { transform: `translateZ(-${half}px) rotate${axis}(0deg) translateZ(${half}px) ${gBase}` },
        { transform: `translateZ(-${half}px) rotate${axis}(${sign * 90}deg) translateZ(${half}px) ${gBase}` },
    ], { duration: (0, util_1.ms)(ctx), easing: (0, util_1.easing)(ctx), fill: "forwards" });
    await (0, util_1.runAll)([a, b], cleanup);
};
exports.cube = cube;
/** 三棱柱转 120°，和立方体的 90° 分开。左右绕 Y，上下绕 X。 */
const prism = async (ctx) => {
    const dir = String(ctx.params.dir ?? "left");
    const { cleanup } = wrap3d(ctx);
    const alongY = dir === "left" || dir === "right";
    const half = (alongY ? ctx.stageSize.w : ctx.stageSize.h) / 2;
    const axis = alongY ? "Y" : "X";
    const sign = dir === "left" || dir === "up" ? -1 : 1;
    const sBase = ctx.stage.style.transform || "";
    const gBase = ctx.ghost.style.transform || "";
    ctx.stage.style.transformOrigin = "center center";
    ctx.ghost.style.transformOrigin = "center center";
    const a = ctx.stage.animate([
        { transform: `translateZ(-${half}px) rotate${axis}(${sign * -120}deg) translateZ(${half}px) ${sBase}` },
        { transform: `translateZ(-${half}px) rotate${axis}(0deg) translateZ(${half}px) ${sBase}` },
    ], { duration: (0, util_1.ms)(ctx), easing: (0, util_1.easing)(ctx), fill: "forwards" });
    const b = ctx.ghost.animate([
        { transform: `translateZ(-${half}px) rotate${axis}(0deg) translateZ(${half}px) ${gBase}` },
        { transform: `translateZ(-${half}px) rotate${axis}(${sign * 120}deg) translateZ(${half}px) ${gBase}` },
    ], { duration: (0, util_1.ms)(ctx), easing: (0, util_1.easing)(ctx), fill: "forwards" });
    await (0, util_1.runAll)([a, b], cleanup);
};
exports.prism = prism;
/** 走进盒子：新页从内侧转出来，旧页往外让开。和立方体外表面对转分开。 */
const box = async (ctx) => {
    const dir = String(ctx.params.dir ?? "left");
    const { cleanup } = wrap3d(ctx);
    const alongY = dir === "left" || dir === "right";
    const axis = alongY ? "Y" : "X";
    const sign = dir === "left" || dir === "up" ? -1 : 1;
    const half = (alongY ? ctx.stageSize.w : ctx.stageSize.h) / 2;
    const sBase = ctx.stage.style.transform || "";
    const gBase = ctx.ghost.style.transform || "";
    ctx.stage.style.transformOrigin = "center center";
    ctx.ghost.style.transformOrigin = "center center";
    const a = ctx.stage.animate([
        { transform: `translateZ(${half * 0.35}px) rotate${axis}(${sign * 70}deg) scale(0.82) ${sBase}`, opacity: 0.2 },
        { transform: `translateZ(0px) rotate${axis}(0deg) scale(1) ${sBase}`, opacity: 1 },
    ], { duration: (0, util_1.ms)(ctx), easing: util_1.STD_EASE, fill: "forwards" });
    const b = ctx.ghost.animate([
        { transform: gBase, opacity: 1 },
        { transform: `translateZ(-${half}px) rotate${axis}(${sign * -55}deg) scale(1.15) ${gBase}`, opacity: 0 },
    ], { duration: (0, util_1.ms)(ctx), easing: util_1.STD_EASE, fill: "forwards" });
    await (0, util_1.runAll)([a, b], cleanup);
};
exports.box = box;
const gallery = async (ctx) => {
    const dir = String(ctx.params.dir ?? "right");
    const { cleanup } = wrap3d(ctx);
    const sign = dir === "left" ? -1 : 1;
    const sBase = ctx.stage.style.transform || "";
    const gBase = ctx.ghost.style.transform || "";
    const a = ctx.stage.animate([
        { transform: `translateX(${sign * ctx.stageSize.w}px) rotateY(${-sign * 90}deg) ${sBase}` },
        { transform: `translateX(0px) rotateY(0deg) ${sBase}` },
    ], { duration: (0, util_1.ms)(ctx), easing: util_1.STD_EASE, fill: "forwards" });
    const b = ctx.ghost.animate([
        { transform: `translateX(0px) rotateY(0deg) ${gBase}` },
        { transform: `translateX(${-sign * ctx.stageSize.w}px) rotateY(${sign * 90}deg) ${gBase}` },
    ], { duration: (0, util_1.ms)(ctx), easing: util_1.STD_EASE, fill: "forwards" });
    await (0, util_1.runAll)([a, b], cleanup);
};
exports.gallery = gallery;
const orbit = async (ctx) => {
    const dir = String(ctx.params.dir ?? "left");
    const { cleanup } = wrap3d(ctx);
    const sign = dir === "left" ? -1 : 1;
    const sBase = ctx.stage.style.transform || "";
    const gBase = ctx.ghost.style.transform || "";
    const a = ctx.stage.animate([
        { transform: `translateZ(-200px) rotateY(${sign * 90}deg) translateZ(200px) ${sBase}`, opacity: 0 },
        { transform: `translateZ(0) rotateY(0) translateZ(0) ${sBase}`, opacity: 1 },
    ], { duration: (0, util_1.ms)(ctx), easing: util_1.STD_EASE, fill: "forwards" });
    const b = ctx.ghost.animate([
        { transform: gBase, opacity: 1 },
        { transform: `translateZ(-200px) rotateY(${-sign * 90}deg) ${gBase}`, opacity: 0 },
    ], { duration: (0, util_1.ms)(ctx), easing: util_1.STD_EASE, fill: "forwards" });
    await (0, util_1.runAll)([a, b], cleanup);
};
exports.orbit = orbit;
const conveyor = async (ctx) => {
    const dir = String(ctx.params.dir ?? "right");
    const { cleanup } = wrap3d(ctx);
    const sign = dir === "left" ? -1 : 1;
    const sBase = ctx.stage.style.transform || "";
    const gBase = ctx.ghost.style.transform || "";
    const a = ctx.stage.animate([
        { transform: `translateX(${sign * ctx.stageSize.w}px) translateZ(-400px) ${sBase}` },
        { transform: `translateX(0) translateZ(0) ${sBase}` },
    ], { duration: (0, util_1.ms)(ctx), easing: util_1.STD_EASE, fill: "forwards" });
    const b = ctx.ghost.animate([
        { transform: gBase },
        { transform: `translateX(${-sign * ctx.stageSize.w}px) translateZ(-400px) ${gBase}` },
    ], { duration: (0, util_1.ms)(ctx), easing: util_1.STD_EASE, fill: "forwards" });
    await (0, util_1.runAll)([a, b], cleanup);
};
exports.conveyor = conveyor;
function pageHalves(ctx, vert) {
    const left = (0, twin_1.mountTwin)(ctx.ghost, vert ? "inset(0 50% 0 0)" : "inset(0 0 50% 0)");
    const right = (0, twin_1.mountTwin)(ctx.ghost, vert ? "inset(0 0 0 50%)" : "inset(50% 0 0 0)");
    const prev = ctx.ghost.style.visibility;
    ctx.ghost.style.visibility = "hidden";
    return { left, right, prev };
}
/** 旧页对开。垂直沿左右铰链转开，水平沿上下铰链转开。 */
const doors = async (ctx) => {
    const vert = String(ctx.params.orient ?? "vert") !== "horz";
    const { cleanup } = wrap3d(ctx);
    const { left, right, prev } = pageHalves(ctx, vert);
    left.style.transformOrigin = vert ? "left center" : "center top";
    right.style.transformOrigin = vert ? "right center" : "center bottom";
    const openL = vert ? "perspective(900px) rotateY(-105deg)" : "perspective(900px) rotateX(105deg)";
    const openR = vert ? "perspective(900px) rotateY(105deg)" : "perspective(900px) rotateX(-105deg)";
    const dur = (0, util_1.ms)(ctx);
    await (0, util_1.runAll)([
        left.animate([{ transform: "none", opacity: 1 }, { transform: openL, opacity: 0 }], { duration: dur, easing: util_1.STD_EASE, fill: "forwards" }),
        right.animate([{ transform: "none", opacity: 1 }, { transform: openR, opacity: 0 }], { duration: dur, easing: util_1.STD_EASE, fill: "forwards" }),
    ], () => {
        (0, twin_1.dropTwins)([left, right], ctx.ghost, prev);
        cleanup();
    });
};
exports.doors = doors;
/** 窗：两扇平着滑开，不绕铰链转。和门分开。 */
const window = async (ctx) => {
    const vert = String(ctx.params.orient ?? "vert") !== "horz";
    const { left, right, prev } = pageHalves(ctx, vert);
    const offL = vert ? "translateX(-100%)" : "translateY(-100%)";
    const offR = vert ? "translateX(100%)" : "translateY(100%)";
    const baseL = left.style.transform || "";
    const baseR = right.style.transform || "";
    const dur = (0, util_1.ms)(ctx);
    await (0, util_1.runAll)([
        left.animate([{ transform: baseL }, { transform: `${offL} ${baseL}` }], { duration: dur, easing: util_1.STD_EASE, fill: "forwards" }),
        right.animate([{ transform: baseR }, { transform: `${offR} ${baseR}` }], { duration: dur, easing: util_1.STD_EASE, fill: "forwards" }),
    ], () => (0, twin_1.dropTwins)([left, right], ctx.ghost, prev));
};
exports.window = window;
// 旧页绕一侧边缘翻起：towardRight 时铰链在右缘、左缘翻向右侧，否则镜像。
async function curlAway(ctx, towardRight) {
    const { cleanup } = wrap3d(ctx);
    const gBase = ctx.ghost.style.transform || "";
    ctx.ghost.style.transformOrigin = towardRight ? "right center" : "left center";
    const deg = towardRight ? -160 : 160;
    const a = ctx.ghost.animate([
        { transform: `perspective(1200px) rotateY(0deg) ${gBase}` },
        { transform: `perspective(1200px) rotateY(${deg}deg) ${gBase}`, opacity: 0 },
    ], { duration: (0, util_1.ms)(ctx), easing: util_1.STD_EASE, fill: "forwards" });
    await (0, util_1.runAll)([a], cleanup);
}
const pageCurl = (ctx) => curlAway(ctx, true);
exports.pageCurl = pageCurl;
/** p15 pageCurlSingle：只掀起一角。整页卷曲走 pageCurl 的书页翻边。 */
const pageCurlSingle = async (ctx) => {
    const dir = String(ctx.params.dir ?? "left");
    const fromRight = dir === "right";
    const fromTop = dir === "up" || dir === "down";
    const { cleanup } = wrap3d(ctx);
    ctx.ghost.style.transformOrigin = `${fromRight ? "0%" : "100%"} ${fromTop ? "0%" : "100%"}`;
    const gBase = ctx.ghost.style.transform || "";
    const ry = fromRight ? -62 : 62;
    const rx = fromTop ? -36 : 36;
    const a = ctx.ghost.animate([
        { transform: gBase, opacity: 1 },
        { transform: `rotateX(${rx * 0.45}deg) rotateY(${ry * 0.45}deg) ${gBase}`, opacity: 1, offset: 0.4 },
        { transform: `rotateX(${rx}deg) rotateY(${ry}deg) translateZ(80px) ${gBase}`, opacity: 0 },
    ], { duration: (0, util_1.ms)(ctx), easing: util_1.STD_EASE, fill: "forwards" });
    await (0, util_1.runAll)([a], () => {
        ctx.ghost.style.transformOrigin = "";
        cleanup();
    });
};
exports.pageCurlSingle = pageCurlSingle;
/** p15 wind：旧页切成细条，顺着风向依次吹出。向右 / 向下镜像。 */
const wind = async (ctx) => {
    const dir = String(ctx.params.dir ?? "left");
    const vertical = dir === "up" || dir === "down";
    const sign = dir === "right" || dir === "down" ? 1 : -1;
    const count = 12;
    const strips = [];
    for (let i = 0; i < count; i++) {
        const start = (i / count) * 100;
        const end = ((count - i - 1) / count) * 100;
        const clip = vertical ? `inset(0 ${end}% 0 ${start}%)` : `inset(${start}% 0 ${end}% 0)`;
        strips.push((0, twin_1.mountTwin)(ctx.ghost, clip));
    }
    const prev = ctx.ghost.style.visibility;
    ctx.ghost.style.visibility = "hidden";
    const dur = (0, util_1.ms)(ctx);
    const anims = strips.map((el, i) => {
        const base = el.style.transform || "";
        const shift = vertical
            ? `translate(0, ${sign * 120}%) rotate(${sign * 16}deg)`
            : `translate(${sign * 120}%, ${sign * -6}%) rotate(${sign * 18}deg)`;
        return el.animate([
            { transform: base, opacity: 1 },
            { transform: `${shift} ${base}`, opacity: 0 },
        ], { duration: dur * 0.62, delay: (i / count) * dur * 0.4, easing: (0, util_1.easing)(ctx), fill: "forwards" });
    });
    await (0, util_1.runAll)(anims, () => (0, twin_1.dropTwins)(strips, ctx.ghost, prev));
};
exports.wind = wind;
/** p15 crush：旧页朝选定的边压成一条线。 */
const crush = async (ctx) => {
    const dir = String(ctx.params.dir ?? "left");
    const vertical = dir === "up" || dir === "down";
    ctx.ghost.style.transformOrigin = vertical
        ? (dir === "down" ? "center bottom" : "center top")
        : (dir === "right" ? "right center" : "left center");
    const gBase = ctx.ghost.style.transform || "";
    const flat = vertical ? "scaleX(1.12) scaleY(0.02)" : "scaleX(0.02) scaleY(1.12)";
    const a = ctx.ghost.animate([
        { transform: gBase, opacity: 1 },
        { transform: `${flat} ${gBase}`, opacity: 0 },
    ], { duration: (0, util_1.ms)(ctx), easing: (0, util_1.easing)(ctx), fill: "forwards" });
    await (0, util_1.runAll)([a], () => {
        ctx.ghost.style.transformOrigin = "";
    });
};
exports.crush = crush;
// [MS-PPTX] p15:prstTrans prst="airplane"：旧页原地折成纸飞机（两个前角折向中线成机头，
// 右缘收成机尾），再朝左上飞出画面，新页一直静止在下面。invX（params.dir="right"）镜像成朝右上。
// clip-path 各帧点数必须相同，WAAPI 才能插值：左边两个角都收到机头，右缘三个点收成尾翼缺口。
const AIRPLANE_SHEET = [[0, 0], [100, 0], [100, 40], [100, 50], [100, 60], [100, 100], [0, 100]];
const AIRPLANE_PLANE = [[4, 49], [96, 8], [84, 42], [92, 50], [84, 58], [96, 92], [4, 51]];
function airplanePolygon(pts, mirror) {
    return `polygon(${pts.map(([x, y]) => `${mirror ? 100 - x : x}% ${y}%`).join(", ")})`;
}
const airplane = async (ctx) => {
    const ghost = ctx.ghost;
    const doc = ghost.ownerDocument;
    const mirror = String(ctx.params.dir ?? "left") === "right";
    const sx = mirror ? -1 : 1;
    const gBase = ghost.style.transform || "";
    const tf = (x, y, deg, s) => `translate(${-sx * x}%, ${y}%) rotate(${sx * deg}deg) scale(${s}) ${gBase}`.trim();
    const sheet = airplanePolygon(AIRPLANE_SHEET, mirror);
    const plane = airplanePolygon(AIRPLANE_PLANE, mirror);
    // clip-path 会连 filter 一起裁掉，投影只能挂在外层；外层 0×0 + overflow 可见，不改变 ghost 的定位基准。
    const parent = ghost.parentElement;
    const shadowWrap = doc.createElement("div");
    shadowWrap.style.cssText = "position:absolute;left:0;top:0;width:0;height:0;overflow:visible;pointer-events:none";
    shadowWrap.style.zIndex = ghost.style.zIndex || "2";
    if (parent) {
        parent.insertBefore(shadowWrap, ghost);
        shadowWrap.appendChild(ghost);
    }
    // 折痕：机身中线一道暗线，上翼略亮、下翼略暗；跟随 ghost 一起被裁成飞机形。
    const crease = doc.createElement("div");
    crease.style.cssText = [
        "position:absolute",
        "inset:0",
        "pointer-events:none",
        "opacity:0",
        "background:linear-gradient(to bottom, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 44%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,0) 56%, rgba(0,0,0,0.28) 100%)",
    ].join(";");
    ghost.appendChild(crease);
    const prevOrigin = ghost.style.transformOrigin;
    const prevClip = ghost.style.clipPath;
    ghost.style.transformOrigin = "50% 50%";
    const dur = (0, util_1.ms)(ctx);
    const fold = "cubic-bezier(0.45, 0, 0.55, 1)";
    const a = ghost.animate([
        { offset: 0, clipPath: sheet, transform: tf(0, 0, 0, 1), easing: fold },
        { offset: 0.1, clipPath: sheet, transform: tf(0, 0, 0, 0.94), easing: fold },
        { offset: 0.45, clipPath: plane, transform: tf(0, 0, 0, 0.5), easing: fold },
        // 起飞前先往反方向压一下，再加速爬升。
        { offset: 0.55, clipPath: plane, transform: tf(-6, 4, 4, 0.5), easing: "cubic-bezier(0.55, 0, 0.9, 0.45)" },
        { offset: 1, clipPath: plane, transform: tf(135, -110, 24, 0.34) },
    ], { duration: dur, fill: "forwards" });
    const b = crease.animate([
        { offset: 0, opacity: 0 },
        { offset: 0.1, opacity: 0 },
        { offset: 0.45, opacity: 1 },
        { offset: 1, opacity: 1 },
    ], { duration: dur, fill: "forwards" });
    const c = shadowWrap.animate([
        { offset: 0, filter: "drop-shadow(0 0 0 rgba(0,0,0,0))" },
        { offset: 0.45, filter: "drop-shadow(0 12px 16px rgba(0,0,0,0.45))" },
        { offset: 1, filter: "drop-shadow(0 24px 22px rgba(0,0,0,0.35))" },
    ], { duration: dur, fill: "forwards" });
    await (0, util_1.runAll)([a, b, c], () => {
        crease.remove();
        ghost.style.transformOrigin = prevOrigin;
        ghost.style.clipPath = prevClip;
        if (parent) {
            parent.insertBefore(ghost, shadowWrap);
            shadowWrap.remove();
        }
    });
};
exports.airplane = airplane;
/** 对折两次再飞走。向右时折痕在右缘。和翻页的单次卷起分开。 */
const origami = async (ctx) => {
    const mirror = String(ctx.params.dir ?? "left") === "right";
    const gBase = ctx.ghost.style.transform || "";
    const origin = ctx.ghost.style.transformOrigin;
    ctx.ghost.style.transformOrigin = mirror ? "right center" : "left center";
    const fly = mirror ? -130 : 130;
    const a = ctx.ghost.animate([
        { offset: 0, transform: `scaleX(1) ${gBase}`, opacity: 1 },
        { offset: 0.42, transform: `scaleX(0.06) ${gBase}`, opacity: 1 },
        { offset: 1, transform: `scaleX(0.06) translate(${fly}%, -36%) rotate(${mirror ? -18 : 18}deg) ${gBase}`, opacity: 0 },
    ], { duration: (0, util_1.ms)(ctx), easing: util_1.STD_EASE, fill: "forwards" });
    await (0, util_1.runAll)([a], () => {
        ctx.ghost.style.transformOrigin = origin;
    });
};
exports.origami = origami;
const flythrough = async (ctx) => {
    const out = String(ctx.params.dir ?? "in") === "out";
    const { cleanup } = wrap3d(ctx);
    const sBase = ctx.stage.style.transform || "";
    const gBase = ctx.ghost.style.transform || "";
    const anims = out
        ? [
            ctx.stage.animate([
                { transform: `${sBase} translateZ(-1400px) scale(0.35)`, opacity: 0 },
                { transform: sBase, opacity: 1 },
            ], { duration: (0, util_1.ms)(ctx), easing: util_1.STD_EASE, fill: "forwards" }),
            ctx.ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: (0, util_1.ms)(ctx), easing: util_1.STD_EASE, fill: "forwards" }),
        ]
        : [
            ctx.ghost.animate([
                { transform: gBase, opacity: 1 },
                { transform: `${gBase} translateZ(900px) scale(2.6)`, opacity: 0 },
            ], { duration: (0, util_1.ms)(ctx), easing: util_1.STD_EASE, fill: "forwards" }),
        ];
    await (0, util_1.runAll)(anims, cleanup);
};
exports.flythrough = flythrough;
const rotate = async (ctx) => {
    const dir = String(ctx.params.dir ?? "left");
    const { cleanup } = wrap3d(ctx);
    const axis = dir === "left" || dir === "right" ? "Y" : "X";
    const sign = dir === "left" || dir === "up" ? -1 : 1;
    const sBase = ctx.stage.style.transform || "";
    const gBase = ctx.ghost.style.transform || "";
    const a = ctx.stage.animate([
        { transform: `${sBase} rotate${axis}(${sign * 180}deg)`, opacity: 0 },
        { transform: sBase, opacity: 1 },
    ], { duration: (0, util_1.ms)(ctx), easing: util_1.STD_EASE, fill: "forwards" });
    const b = ctx.ghost.animate([{ transform: gBase, opacity: 1 }, { transform: `${gBase} rotate${axis}(${-sign * 180}deg)`, opacity: 0 }], { duration: (0, util_1.ms)(ctx), easing: util_1.STD_EASE, fill: "forwards" });
    await (0, util_1.runAll)([a, b], cleanup);
};
exports.rotate = rotate;
/** 绕画面外侧的轴转过去，像摩天轮的一格，不是原地翻面。 */
const ferris = async (ctx) => {
    const toRight = String(ctx.params.dir ?? "left") === "right";
    const { cleanup } = wrap3d(ctx);
    const origin = toRight ? "120% 50%" : "-20% 50%";
    const sign = toRight ? 1 : -1;
    const prevS = ctx.stage.style.transformOrigin;
    const prevG = ctx.ghost.style.transformOrigin;
    ctx.stage.style.transformOrigin = origin;
    ctx.ghost.style.transformOrigin = origin;
    const sBase = ctx.stage.style.transform || "";
    const gBase = ctx.ghost.style.transform || "";
    const a = ctx.stage.animate([
        { transform: `rotate(${sign * -180}deg) ${sBase}` },
        { transform: `rotate(0deg) ${sBase}` },
    ], { duration: (0, util_1.ms)(ctx), easing: util_1.STD_EASE, fill: "forwards" });
    const b = ctx.ghost.animate([
        { transform: `rotate(0deg) ${gBase}` },
        { transform: `rotate(${sign * 180}deg) ${gBase}` },
    ], { duration: (0, util_1.ms)(ctx), easing: util_1.STD_EASE, fill: "forwards" });
    await (0, util_1.runAll)([a, b], () => {
        ctx.stage.style.transformOrigin = prevS;
        ctx.ghost.style.transformOrigin = prevG;
        cleanup();
    });
};
exports.ferris = ferris;
// [MS-PPTX] p15:prstTrans prst="peelOff"：默认从右下角朝左揭起，invX（params.dir="right"）朝右。
const peelOff = async (ctx) => {
    const towardRight = String(ctx.params.dir ?? "left") === "right";
    const { cleanup } = wrap3d(ctx);
    const prevOrigin = ctx.ghost.style.transformOrigin;
    const gBase = ctx.ghost.style.transform || "";
    ctx.ghost.style.transformOrigin = towardRight ? "100% 0%" : "0% 0%";
    const lift = towardRight ? 58 : -58;
    const a = ctx.ghost.animate([
        { clipPath: (0, geometry_1.peelFlatClip)(towardRight, 0), transform: gBase, opacity: 1 },
        { clipPath: (0, geometry_1.peelFlatClip)(towardRight, 0.45), transform: `perspective(1100px) rotate(${lift * 0.35}deg) ${gBase}`, opacity: 1, offset: 0.45 },
        { clipPath: (0, geometry_1.peelFlatClip)(towardRight, 1), transform: `perspective(1100px) rotateX(62deg) rotate(${lift}deg) ${gBase}`, opacity: 0 },
    ], { duration: (0, util_1.ms)(ctx), easing: util_1.STD_EASE, fill: "forwards" });
    await (0, util_1.runAll)([a], () => {
        ctx.ghost.style.clipPath = "";
        ctx.ghost.style.transformOrigin = prevOrigin;
        cleanup();
    });
};
exports.peelOff = peelOff;
/** 卡片翻面：转到 90° 时只看见棱，没有旋转那种半透明交叠。 */
const flip = async (ctx) => {
    const dir = String(ctx.params.dir ?? "left");
    const { cleanup } = wrap3d(ctx);
    const axis = dir === "up" || dir === "down" ? "X" : "Y";
    const sign = dir === "right" || dir === "down" ? 1 : -1;
    const sBase = ctx.stage.style.transform || "";
    const gBase = ctx.ghost.style.transform || "";
    ctx.stage.style.backfaceVisibility = "hidden";
    ctx.ghost.style.backfaceVisibility = "hidden";
    const a = ctx.stage.animate([
        { transform: `${sBase} rotate${axis}(${sign * -180}deg)` },
        { transform: sBase },
    ], { duration: (0, util_1.ms)(ctx), easing: util_1.STD_EASE, fill: "forwards" });
    const b = ctx.ghost.animate([
        { transform: gBase },
        { transform: `${gBase} rotate${axis}(${sign * 180}deg)` },
    ], { duration: (0, util_1.ms)(ctx), easing: util_1.STD_EASE, fill: "forwards" });
    await (0, util_1.runAll)([a, b], cleanup);
};
exports.flip = flip;
/** 两页左右错身换位，带一点倾斜。 */
const switchFx = async (ctx) => {
    const toLeft = String(ctx.params.dir ?? "left") !== "right";
    const sign = toLeft ? -1 : 1;
    const w = ctx.stageSize.w;
    const sBase = ctx.stage.style.transform || "";
    const gBase = ctx.ghost.style.transform || "";
    const a = ctx.stage.animate([
        { transform: `translateX(${sign * w}px) rotate(${sign * -7}deg) ${sBase}` },
        { transform: sBase },
    ], { duration: (0, util_1.ms)(ctx), easing: util_1.STD_EASE, fill: "forwards" });
    const b = ctx.ghost.animate([
        { transform: gBase },
        { transform: `translateX(${-sign * w}px) rotate(${sign * 7}deg) ${gBase}` },
    ], { duration: (0, util_1.ms)(ctx), easing: util_1.STD_EASE, fill: "forwards" });
    await (0, util_1.runAll)([a, b]);
};
exports.switchFx = switchFx;
const drape = async (ctx) => {
    const toRight = String(ctx.params.dir ?? "left") === "right";
    const sign = toRight ? 1 : -1;
    const sBase = ctx.stage.style.transform || "";
    const gBase = ctx.ghost.style.transform || "";
    const ease = "cubic-bezier(0.16, 1, 0.3, 1)";
    const a = ctx.stage.animate([{ transform: `${sBase} translateY(-100%)` }, { transform: sBase }], { duration: (0, util_1.ms)(ctx), easing: ease, fill: "forwards" });
    const b = ctx.ghost.animate([
        { transform: gBase, opacity: 1 },
        { transform: `${gBase} translate(${sign * 28}%, 110%) rotate(${sign * 11}deg)`, opacity: 0 },
    ], { duration: (0, util_1.ms)(ctx), easing: ease, fill: "forwards" });
    await (0, util_1.runAll)([a, b]);
};
exports.drape = drape;
/** 帘幕：多条竖褶从中缝向两边收走。 */
const curtains = async (ctx) => {
    const count = 8;
    const folds = [];
    for (let i = 0; i < count; i++) {
        const left = (i / count) * 100;
        const right = ((count - i - 1) / count) * 100;
        folds.push((0, twin_1.mountTwin)(ctx.ghost, `inset(0 ${right}% 0 ${left}%)`));
    }
    const prev = ctx.ghost.style.visibility;
    ctx.ghost.style.visibility = "hidden";
    const dur = (0, util_1.ms)(ctx);
    const anims = folds.map((el, i) => {
        const toLeft = i < count / 2;
        const base = el.style.transform || "";
        return el.animate([
            { transform: base, opacity: 1 },
            { transform: `translateX(${toLeft ? -110 : 110}%) scaleX(0.35) ${base}`, opacity: 0.15 },
        ], { duration: dur, easing: util_1.STD_EASE, fill: "forwards", delay: Math.abs(i - (count - 1) / 2) * dur * 0.04 });
    });
    await (0, util_1.runAll)(anims, () => (0, twin_1.dropTwins)(folds, ctx.ghost, prev));
};
exports.curtains = curtains;
const ripple = async (ctx) => {
    const at = (0, geometry_1.rippleAt)(String(ctx.params.dir ?? ""));
    const a = ctx.ghost.animate([
        { clipPath: `circle(160% at ${at})`, opacity: 1 },
        { clipPath: `circle(0% at ${at})`, opacity: 0 },
    ], { duration: (0, util_1.ms)(ctx), easing: util_1.STD_EASE, fill: "forwards" });
    await (0, util_1.runAll)([a], () => {
        ctx.ghost.style.clipPath = "";
    });
};
exports.ripple = ripple;
const warp = async (ctx) => {
    const out = String(ctx.params.dir ?? "in") === "out";
    const gBase = ctx.ghost.style.transform || "";
    const sBase = ctx.stage.style.transform || "";
    if (out) {
        const a = ctx.stage.animate([
            { transform: `scale(0.08) skew(22deg) ${sBase}`, opacity: 0 },
            { transform: sBase, opacity: 1 },
        ], { duration: (0, util_1.ms)(ctx), easing: util_1.STD_EASE, fill: "forwards" });
        const b = ctx.ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: (0, util_1.ms)(ctx), easing: util_1.STD_EASE, fill: "forwards" });
        await (0, util_1.runAll)([a, b]);
        return;
    }
    const a = ctx.ghost.animate([
        { transform: gBase, opacity: 1 },
        { transform: `scale(0.08) skew(-22deg) ${gBase}`, opacity: 0 },
    ], { duration: (0, util_1.ms)(ctx), easing: util_1.STD_EASE, fill: "forwards" });
    await (0, util_1.runAll)([a]);
};
exports.warp = warp;
const vortex = async (ctx) => {
    const dir = String(ctx.params.dir ?? "left");
    const gBase = ctx.ghost.style.transform || "";
    const clockwise = dir === "right" || dir === "down";
    const spin = clockwise ? 540 : -540;
    const vertical = dir === "up" || dir === "down";
    const turn = vertical ? `rotateX(${spin}deg)` : `rotate(${spin}deg)`;
    const a = ctx.ghost.animate([
        { transform: gBase, opacity: 1 },
        { transform: `scale(0) ${turn} ${gBase}`, opacity: 0 },
    ], { duration: (0, util_1.ms)(ctx), easing: util_1.STD_EASE, fill: "forwards" });
    await (0, util_1.runAll)([a]);
};
exports.vortex = vortex;
