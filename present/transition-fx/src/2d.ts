import { cellMask, glitterSweep, splitMotion, stripsClips, wheelPolygon, wheelSpokes } from "./geometry";
import { dropTwins, mountTwin } from "./twin";
import type { TransitionCtx, TransitionFactory } from "./types";
import { dirVec, easing, ms, runAll, STD_EASE } from "./util";

export const fade: TransitionFactory = async (ctx) => {
  const a = ctx.ghost.animate(
    [{ opacity: 1 }, { opacity: 0 }],
    { duration: ms(ctx), easing: easing(ctx), fill: "forwards" },
  );
  await runAll([a]);
};

export const cut: TransitionFactory = async () => {
  // instant
};

export const push: TransitionFactory = async (ctx) => {
  const { dx, dy } = dirVec(String(ctx.params.dir ?? "left"), ctx.stageSize.w, ctx.stageSize.h);
  const sBase = ctx.stage.style.transform || "";
  const gBase = ctx.ghost.style.transform || "";
  const a = ctx.stage.animate(
    [{ transform: `translate(${dx}px, ${dy}px) ${sBase}` }, { transform: sBase }],
    { duration: ms(ctx), easing: easing(ctx), fill: "forwards" },
  );
  const b = ctx.ghost.animate(
    [{ transform: gBase }, { transform: `translate(${-dx}px, ${-dy}px) ${gBase}` }],
    { duration: ms(ctx), easing: easing(ctx), fill: "forwards" },
  );
  await runAll([a, b]);
};

export const cover: TransitionFactory = async (ctx) => {
  const { dx, dy } = dirVec(String(ctx.params.dir ?? "left"), ctx.stageSize.w, ctx.stageSize.h);
  const sBase = ctx.stage.style.transform || "";
  const a = ctx.stage.animate(
    [{ transform: `translate(${dx}px, ${dy}px) ${sBase}` }, { transform: sBase }],
    { duration: ms(ctx), easing: easing(ctx), fill: "forwards" },
  );
  await runAll([a]);
};

export const uncover: TransitionFactory = async (ctx) => {
  const { dx, dy } = dirVec(String(ctx.params.dir ?? "left"), ctx.stageSize.w, ctx.stageSize.h);
  const gBase = ctx.ghost.style.transform || "";
  const a = ctx.ghost.animate(
    [{ transform: gBase }, { transform: `translate(${-dx}px, ${-dy}px) ${gBase}` }],
    { duration: ms(ctx), easing: easing(ctx), fill: "forwards" },
  );
  await runAll([a]);
};

export const wipe: TransitionFactory = async (ctx) => {
  const dir = String(ctx.params.dir ?? "left");
  const clipStart = wipeClip(dir, true);
  const clipEnd = wipeClip(dir, false);
  const a = ctx.stage.animate(
    [{ clipPath: clipStart }, { clipPath: clipEnd }],
    { duration: ms(ctx), easing: easing(ctx), fill: "forwards" },
  );
  await runAll([a], () => {
    ctx.stage.style.clipPath = "";
  });
};

export const split: TransitionFactory = async (ctx) => {
  const motion = splitMotion(ctx.params.orient, ctx.params.dir);
  if (motion.kind === "meet") {
    await splitMeet(ctx, motion.axis);
    return;
  }
  const a = ctx.stage.animate(
    [{ clipPath: motion.clip }, { clipPath: "inset(0 0 0 0)" }],
    { duration: ms(ctx), easing: easing(ctx), fill: "forwards" },
  );
  await runAll([a], () => {
    ctx.stage.style.clipPath = "";
  });
};

export const zoom: TransitionFactory = async (ctx) => {
  const out = String(ctx.params.dir ?? "in") === "out";
  const sBase = ctx.stage.style.transform || "";
  const startScale = out ? 1.7 : 0.3;
  const a = ctx.stage.animate(
    [
      { transform: `${sBase} scale(${startScale})`, opacity: 0 },
      { transform: sBase, opacity: 1 },
    ],
    { duration: ms(ctx), easing: easing(ctx), fill: "forwards" },
  );
  const b = ctx.ghost.animate(
    [{ opacity: 1 }, { opacity: 0 }],
    { duration: ms(ctx), easing: easing(ctx), fill: "forwards" },
  );
  await runAll([a, b]);
};

export const blinds: TransitionFactory = async (ctx) => {
  const horiz = String(ctx.params.orient ?? "horz") !== "vert";
  return runContentBands(ctx, 6, horiz, "together");
};

export const checker: TransitionFactory = async (ctx) => {
  const horiz = String(ctx.params.orient ?? "horz") !== "vert";
  return runChecker(ctx, horiz);
};

export const randomBar: TransitionFactory = async (ctx) => {
  const horiz = String(ctx.params.orient ?? "horz") !== "vert";
  return runContentBands(ctx, 10, horiz, "random");
};

/** 旧页切成小格，按固定乱序一块块消失。着色器快照失败时用这条。 */
export const dissolve: TransitionFactory = async (ctx) => {
  const cols = 10;
  const rows = 6;
  const cells: HTMLElement[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const top = (r / rows) * 100;
      const bottom = ((rows - r - 1) / rows) * 100;
      const left = (c / cols) * 100;
      const right = ((cols - c - 1) / cols) * 100;
      cells.push(mountTwin(ctx.ghost, `inset(${top}% ${right}% ${bottom}% ${left}%)`));
    }
  }
  const prev = ctx.ghost.style.visibility;
  ctx.ghost.style.visibility = "hidden";
  const dur = ms(ctx);
  const n = cells.length;
  const anims = cells.map((el, i) => {
    const rank = (i * 17 + 5) % n;
    return el.animate(
      [{ opacity: 1 }, { opacity: 0 }],
      { duration: Math.max(80, dur * 0.22), delay: (rank / n) * dur * 0.78, easing: "linear", fill: "forwards" },
    );
  });
  await runAll(anims, () => dropTwins(cells, ctx.ghost, prev));
};

export const newsflash: TransitionFactory = async (ctx) => {
  const sBase = ctx.stage.style.transform || "";
  const a = ctx.stage.animate(
    [
      { transform: `${sBase} translate(-100%, -100%) scale(0.1) rotate(-540deg)`, opacity: 0 },
      { transform: sBase, opacity: 1 },
    ],
    { duration: ms(ctx), easing: STD_EASE, fill: "forwards" },
  );
  await runAll([a]);
};

async function runWheel(ctx: TransitionCtx, reverse: boolean): Promise<void> {
  const n = wheelSpokes(ctx.params.pattern);
  const a = ctx.stage.animate(
    [{ clipPath: wheelPolygon(n, 0, reverse) }, { clipPath: wheelPolygon(n, 1, reverse) }],
    { duration: ms(ctx), easing: easing(ctx), fill: "forwards" },
  );
  await runAll([a], () => {
    ctx.stage.style.clipPath = "";
  });
}

export const wheel: TransitionFactory = (ctx) => runWheel(ctx, false);

export const wheelReverse: TransitionFactory = (ctx) => runWheel(ctx, true);

export const circle: TransitionFactory = async (ctx) => {
  const a = ctx.stage.animate(
    [
      { clipPath: "circle(0% at 50% 50%)" },
      { clipPath: "circle(75% at 50% 50%)" },
    ],
    { duration: ms(ctx), easing: easing(ctx), fill: "forwards" },
  );
  await runAll([a], () => {
    ctx.stage.style.clipPath = "";
  });
};

export const diamond: TransitionFactory = async (ctx) => {
  const a = ctx.stage.animate(
    [
      { clipPath: "polygon(50% 50%, 50% 50%, 50% 50%, 50% 50%)" },
      { clipPath: "polygon(50% -10%, 110% 50%, 50% 110%, -10% 50%)" },
    ],
    { duration: ms(ctx), easing: easing(ctx), fill: "forwards" },
  );
  await runAll([a], () => {
    ctx.stage.style.clipPath = "";
  });
};

export const plus: TransitionFactory = async (ctx) => {
  const a = ctx.stage.animate(
    [
      { clipPath: "polygon(50% 50%, 50% 50%, 50% 50%, 50% 50%, 50% 50%, 50% 50%, 50% 50%, 50% 50%, 50% 50%, 50% 50%, 50% 50%, 50% 50%)" },
      { clipPath: "polygon(33% 0%, 67% 0%, 67% 33%, 100% 33%, 100% 67%, 67% 67%, 67% 100%, 33% 100%, 33% 67%, 0% 67%, 0% 33%, 33% 33%)" },
    ],
    { duration: ms(ctx), easing: easing(ctx), fill: "forwards" },
  );
  await runAll([a], () => {
    ctx.stage.style.clipPath = "";
  });
};

export const random: TransitionFactory = async (ctx) => {
  const opts = [fade, push, wipe, split, dissolve];
  const pick = opts[Math.floor(Math.random() * opts.length)] ?? fade;
  await pick(ctx);
};

export const fall: TransitionFactory = async (ctx) => {
  const sBase = ctx.stage.style.transform || "";
  const gBase = ctx.ghost.style.transform || "";
  const a = ctx.stage.animate(
    [
      { transform: `${sBase} translateY(-100%)`, opacity: 0 },
      { transform: sBase, opacity: 1 },
    ],
    { duration: ms(ctx), easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "forwards" },
  );
  const b = ctx.ghost.animate(
    [
      { transform: gBase, opacity: 1 },
      { transform: `${gBase} translateY(100%) rotate(8deg)`, opacity: 0 },
    ],
    { duration: ms(ctx), easing: "cubic-bezier(0.55, 0, 0.55, 0.2)", fill: "forwards" },
  );
  await runAll([a, b]);
};

export const reveal: TransitionFactory = async (ctx) => {
  const toRight = String(ctx.params.dir ?? "left") === "right";
  const gBase = ctx.ghost.style.transform || "";
  const slide = toRight ? "translateX(22%)" : "translateX(-22%)";
  const clipEnd = toRight ? "inset(0 0 0 100%)" : "inset(0 100% 0 0)";
  const a = ctx.ghost.animate(
    [
      { transform: gBase, clipPath: "inset(0 0 0 0)", opacity: 1, filter: "brightness(1)" },
      { transform: `${slide} ${gBase}`, clipPath: clipEnd, opacity: 0, filter: "brightness(0.2)" },
    ],
    { duration: ms(ctx), easing: STD_EASE, fill: "forwards" },
  );
  await runAll([a], () => {
    ctx.ghost.style.clipPath = "";
  });
};

export const flash: TransitionFactory = async (ctx) => {
  const flashEl = ctx.ghost.ownerDocument.createElement("div");
  flashEl.style.cssText = "position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;z-index:10";
  ctx.ghost.parentElement?.appendChild(flashEl);
  const dur = ms(ctx);
  const a = flashEl.animate(
    [{ opacity: 0 }, { opacity: 1, offset: 0.4 }, { opacity: 0 }],
    { duration: dur, easing: LINEAR_INOUT, fill: "forwards" },
  );
  const b = ctx.ghost.animate(
    [{ opacity: 1 }, { opacity: 0, offset: 0.5 }, { opacity: 0 }],
    { duration: dur, easing: LINEAR_INOUT, fill: "forwards" },
  );
  await runAll([a, b], () => {
    flashEl.remove();
  });
};

function applyTileMask(el: HTMLElement, mask: string): void {
  el.style.webkitMaskImage = mask;
  el.style.maskImage = mask;
  el.style.webkitMaskRepeat = "repeat";
  el.style.maskRepeat = "repeat";
  el.style.webkitMaskPosition = "center";
  el.style.maskPosition = "center";
}

function clearTileMask(el: HTMLElement): void {
  el.style.maskImage = "";
  el.style.webkitMaskImage = "";
  el.style.maskSize = "";
  el.style.webkitMaskSize = "";
  el.style.maskPosition = "";
  el.style.webkitMaskPosition = "";
  el.style.maskRepeat = "";
  el.style.webkitMaskRepeat = "";
}

/** 菱形或六边形沿方向扫过，同时旧页闪几下。pattern 来自 OOXML hexagon / diamond。 */
export const glitter: TransitionFactory = async (ctx) => {
  const pattern = ctx.params.pattern === "hexagon" ? "hexagon" : "diamond";
  const sweep = glitterSweep(String(ctx.params.dir ?? "left"));
  applyTileMask(ctx.stage, cellMask(pattern));
  const dur = ms(ctx);
  const a = ctx.stage.animate(
    [
      { maskSize: "0% 0%", maskPosition: sweep.from, webkitMaskSize: "0% 0%", webkitMaskPosition: sweep.from },
      { maskSize: "16% 16%", maskPosition: sweep.to, webkitMaskSize: "16% 16%", webkitMaskPosition: sweep.to },
    ],
    { duration: dur, easing: easing(ctx), fill: "forwards" },
  );
  const b = ctx.ghost.animate(
    [
      { opacity: 1, filter: "brightness(1)" },
      { opacity: 0.85, filter: "brightness(2.6)", offset: 0.25 },
      { opacity: 0.45, filter: "brightness(1.15)", offset: 0.55 },
      { opacity: 0, filter: "brightness(2.2)" },
    ],
    { duration: dur, easing: easing(ctx), fill: "forwards" },
  );
  await runAll([a, b], () => clearTileMask(ctx.stage));
};

/** 疏六边形从中心铺开，格子之间留缝，不闪。 */
export const honeycomb: TransitionFactory = async (ctx) => {
  applyTileMask(ctx.stage, cellMask("honeycomb"));
  const a = ctx.stage.animate(
    [
      { maskSize: "0% 0%", webkitMaskSize: "0% 0%" },
      { maskSize: "34% 34%", webkitMaskSize: "34% 34%" },
    ],
    { duration: ms(ctx), easing: easing(ctx), fill: "forwards" },
  );
  await runAll([a], () => clearTileMask(ctx.stage));
};

/** 斜向细条撕开。向外从中心铺开新页，向内让旧页的细条收到中心。 */
export const shred: TransitionFactory = async (ctx) => {
  const inward = ctx.params.dir === "in";
  const mask = "repeating-linear-gradient(108deg, #000 0 7px, transparent 7px 12px)";
  const host = inward ? ctx.ghost : ctx.stage;
  host.style.webkitMaskImage = mask;
  host.style.maskImage = mask;
  host.style.webkitMaskRepeat = "repeat";
  host.style.maskRepeat = "repeat";
  host.style.webkitMaskPosition = "center";
  host.style.maskPosition = "center";
  const from = inward ? "160% 160%" : "0% 0%";
  const to = inward ? "0% 0%" : "160% 160%";
  const a = host.animate(
    [
      { maskSize: from, webkitMaskSize: from },
      { maskSize: to, webkitMaskSize: to },
    ],
    { duration: ms(ctx), easing: easing(ctx), fill: "forwards" },
  );
  await runAll([a], () => {
    host.style.maskImage = "";
    host.style.webkitMaskImage = "";
    host.style.maskSize = "";
    host.style.webkitMaskSize = "";
    host.style.maskPosition = "";
    host.style.webkitMaskPosition = "";
  });
};

/** 旧页切成小块飞散，新页从稍大缩回。 */
export const fracture: TransitionFactory = async (ctx) => {
  const cols = 4;
  const rows = 3;
  const shards: HTMLElement[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const top = (r / rows) * 100;
      const bottom = ((rows - r - 1) / rows) * 100;
      const left = (c / cols) * 100;
      const right = ((cols - c - 1) / cols) * 100;
      shards.push(mountTwin(ctx.ghost, `inset(${top}% ${right}% ${bottom}% ${left}%)`));
    }
  }
  const prev = ctx.ghost.style.visibility;
  ctx.ghost.style.visibility = "hidden";
  const sBase = ctx.stage.style.transform || "";
  const dur = ms(ctx);
  const anims: Animation[] = [
    ctx.stage.animate(
      [
        { transform: `${sBase} scale(1.08)`, opacity: 0 },
        { transform: sBase, opacity: 1 },
      ],
      { duration: dur, easing: easing(ctx), fill: "forwards" },
    ),
  ];
  shards.forEach((el, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const dx = (c - (cols - 1) / 2) * 36;
    const dy = (r - (rows - 1) / 2) * 28;
    const rot = (i % 2 === 0 ? 1 : -1) * (14 + (i % 5) * 8);
    const base = el.style.transform || "";
    anims.push(
      el.animate(
        [
          { transform: base, opacity: 1 },
          { transform: `translate(${dx}%, ${dy}%) rotate(${rot}deg) ${base}`, opacity: 0 },
        ],
        { duration: dur, easing: easing(ctx), fill: "forwards" },
      ),
    );
  });
  await runAll(anims, () => dropTwins(shards, ctx.ghost, prev));
};

/** 旧页向左掀起，一道高光扫过新页。 */
export const prestige: TransitionFactory = async (ctx) => {
  const parent = ctx.stage.parentElement;
  const prevPerspective = parent?.style.perspective ?? "";
  const prevStyle = parent?.style.transformStyle ?? "";
  if (parent) {
    parent.style.perspective = "1400px";
    parent.style.transformStyle = "preserve-3d";
  }
  const doc = ctx.stage.ownerDocument;
  const sheen = doc.createElement("div");
  sheen.style.cssText = "position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:8";
  const bar = doc.createElement("div");
  bar.style.cssText = "position:absolute;top:-8%;bottom:-8%;width:18%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.78),transparent)";
  sheen.appendChild(bar);
  parent?.appendChild(sheen);
  ctx.ghost.style.transformOrigin = "left center";
  ctx.ghost.style.transformStyle = "preserve-3d";
  const gBase = ctx.ghost.style.transform || "";
  const sBase = ctx.stage.style.transform || "";
  const dur = ms(ctx);
  const a = ctx.ghost.animate(
    [
      { transform: gBase, opacity: 1, filter: "brightness(1)" },
      { transform: `rotateY(-22deg) scale(0.94) ${gBase}`, opacity: 0, filter: "brightness(1.45)" },
    ],
    { duration: dur, easing: easing(ctx), fill: "forwards" },
  );
  const b = ctx.stage.animate(
    [
      { opacity: 0, transform: `${sBase} scale(1.02)`, filter: "brightness(1.2)" },
      { opacity: 1, transform: sBase, filter: "brightness(1)" },
    ],
    { duration: dur, easing: easing(ctx), fill: "forwards" },
  );
  const c = bar.animate(
    [{ transform: "translateX(-140%)" }, { transform: "translateX(640%)" }],
    { duration: dur, easing: "linear", fill: "forwards" },
  );
  await runAll([a, b, c], () => {
    sheen.remove();
    ctx.ghost.style.transformOrigin = "";
    ctx.ghost.style.transformStyle = "";
    if (parent) {
      parent.style.perspective = prevPerspective;
      parent.style.transformStyle = prevStyle;
    }
  });
};

/** 梳齿交错抽走旧页。水平是上下两排齿，垂直是左右两排齿。 */
export const comb: TransitionFactory = async (ctx) => {
  const vert = String(ctx.params.orient ?? "horz") === "vert";
  return runContentBands(ctx, 8, !vert, "comb");
};

/** 斜向宽带从指定角扫过。 */
export const strips: TransitionFactory = async (ctx) => {
  const [start, mid, end] = stripsClips(String(ctx.params.dir ?? "bottomRight"));
  const a = ctx.stage.animate(
    [{ clipPath: start }, { clipPath: mid, offset: 0.55 }, { clipPath: end }],
    { duration: ms(ctx), easing: easing(ctx), fill: "forwards" },
  );
  await runAll([a], () => {
    ctx.stage.style.clipPath = "";
  });
};

function pieClip(portion: number): string {
  const steps = 24;
  const pts = ["50% 50%"];
  const p = Math.min(1, Math.max(0, portion));
  for (let i = 0; i <= steps; i++) {
    const ang = -Math.PI / 2 + p * (i / steps) * Math.PI * 2;
    const x = 50 + Math.cos(ang) * 80;
    const y = 50 + Math.sin(ang) * 80;
    pts.push(`${x.toFixed(2)}% ${y.toFixed(2)}%`);
  }
  return `polygon(${pts.join(",")})`;
}

/** 从中心张开一块扇形，和整圆轮子分开。 */
export const wedge: TransitionFactory = async (ctx) => {
  const a = ctx.stage.animate(
    [{ clipPath: pieClip(0) }, { clipPath: pieClip(1) }],
    { duration: ms(ctx), easing: easing(ctx), fill: "forwards" },
  );
  await runAll([a], () => {
    ctx.stage.style.clipPath = "";
  });
};

const LINEAR_INOUT = "cubic-bezier(0.4, 0, 0.6, 1)";

function wipeClip(dir: string, start: boolean): string {
  switch (dir) {
    case "left":
      return start ? "inset(0 0 0 100%)" : "inset(0 0 0 0)";
    case "right":
      return start ? "inset(0 100% 0 0)" : "inset(0 0 0 0)";
    case "up":
      return start ? "inset(100% 0 0 0)" : "inset(0 0 0 0)";
    case "down":
      return start ? "inset(0 0 100% 0)" : "inset(0 0 0 0)";
    default:
      return start ? "inset(0 0 0 100%)" : "inset(0 0 0 0)";
  }
}

async function splitMeet(ctx: TransitionCtx, axis: "x" | "y"): Promise<void> {
  const left = mountTwin(ctx.stage, axis === "x" ? "inset(0 50% 0 0)" : "inset(0 0 50% 0)");
  const right = mountTwin(ctx.stage, axis === "x" ? "inset(0 0 0 50%)" : "inset(50% 0 0 0)");
  const prev = ctx.stage.style.visibility;
  ctx.stage.style.visibility = "hidden";
  const base = ctx.stage.style.transform || "";
  const fromA = axis === "x" ? "translateX(-50%)" : "translateY(-50%)";
  const fromB = axis === "x" ? "translateX(50%)" : "translateY(50%)";
  const dur = ms(ctx);
  const ease = easing(ctx);
  await runAll(
    [
      left.animate([{ transform: `${fromA} ${base}` }, { transform: base }], { duration: dur, easing: ease, fill: "forwards" }),
      right.animate([{ transform: `${fromB} ${base}` }, { transform: base }], { duration: dur, easing: ease, fill: "forwards" }),
    ],
    () => dropTwins([left, right], ctx.stage, prev),
  );
}

async function runContentBands(
  ctx: TransitionCtx,
  count: number,
  horizontal: boolean,
  order: "together" | "random" | "comb",
): Promise<void> {
  const bands: HTMLElement[] = [];
  for (let i = 0; i < count; i++) {
    const clip = horizontal
      ? `inset(${(i / count) * 100}% 0 ${((count - i - 1) / count) * 100}% 0)`
      : `inset(0 ${((count - i - 1) / count) * 100}% 0 ${(i / count) * 100}%)`;
    bands.push(mountTwin(ctx.ghost, clip));
  }
  const prev = ctx.ghost.style.visibility;
  ctx.ghost.style.visibility = "hidden";
  const dur = ms(ctx);
  const ease = easing(ctx);
  const seq = order === "random" ? shuffle(count) : bands.map((_, i) => i);
  const anims = seq.map((idx, k) => {
    const el = bands[idx]!;
    const base = el.style.transform || "";
    if (order === "comb") {
      const out = horizontal
        ? idx % 2 === 0 ? "translateY(-100%)" : "translateY(100%)"
        : idx % 2 === 0 ? "translateX(-100%)" : "translateX(100%)";
      return el.animate(
        [{ transform: base }, { transform: `${out} ${base}` }],
        { duration: dur, easing: ease, fill: "forwards", delay: (idx % 2) * dur * 0.08 },
      );
    }
    const squash = horizontal ? "scaleY(0)" : "scaleX(0)";
    const delay = order === "together" ? 0 : (k / count) * dur * 0.55;
    const duration = order === "together" ? dur : dur * 0.45;
    return el.animate(
      [{ transform: base }, { transform: `${squash} ${base}` }],
      { duration, easing: ease, fill: "forwards", delay },
    );
  });
  await runAll(anims, () => dropTwins(bands, ctx.ghost, prev));
}

function shuffle(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

async function runChecker(ctx: TransitionCtx, horizontal: boolean): Promise<void> {
  const cols = horizontal ? 8 : 5;
  const rows = horizontal ? 5 : 8;
  const cells: HTMLElement[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const top = (r / rows) * 100;
      const bottom = ((rows - r - 1) / rows) * 100;
      const left = (c / cols) * 100;
      const right = ((cols - c - 1) / cols) * 100;
      cells.push(mountTwin(ctx.ghost, `inset(${top}% ${right}% ${bottom}% ${left}%)`));
    }
  }
  const prev = ctx.ghost.style.visibility;
  ctx.ghost.style.visibility = "hidden";
  const dur = ms(ctx);
  const anims: Animation[] = [];
  cells.forEach((el, i) => {
    const even = (Math.floor(i / cols) + (i % cols)) % 2 === 0;
    anims.push(
      el.animate(
        [{ opacity: 1 }, { opacity: 0 }],
        { duration: dur * 0.55, fill: "forwards", easing: STD_EASE, delay: even ? 0 : dur * 0.4 },
      ),
    );
  });
  await runAll(anims, () => dropTwins(cells, ctx.ghost, prev));
}
