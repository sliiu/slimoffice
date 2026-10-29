// 切换效果里可以脱离 DOM 核对的几何：分割的开合、轮子的轮辐、条纹的角、涟漪的圆心、剥离的折角。
// 播放函数只负责把这些字符串套到 clip-path / mask 上。

export type SplitMotion =
  | { kind: "expand"; clip: string }
  | { kind: "meet"; axis: "x" | "y" };

/** orient=vert 左右分开，horz 上下分开。dir=in 从两侧收到中间，其余从中间向外展开。 */
export function splitMotion(orient: unknown, dir: unknown): SplitMotion {
  const vert = orient === "vert";
  if (dir === "in") return { kind: "meet", axis: vert ? "x" : "y" };
  return { kind: "expand", clip: vert ? "inset(0 50% 0 50%)" : "inset(50% 0 50% 0)" };
}

/** 面板上的四档（中央向左右展开 / 左右向中央收缩 / …）和 OOXML orient+dir 互转。 */
export function splitToken(orient: unknown, dir: unknown): string {
  return `${orient === "vert" ? "vert" : "horz"}${dir === "in" ? "In" : "Out"}`;
}

export function splitParamsFromToken(token: string): { orient: "horz" | "vert"; dir: "in" | "out" } {
  const vert = token.startsWith("vert");
  const inward = token.endsWith("In");
  return { orient: vert ? "vert" : "horz", dir: inward ? "in" : "out" };
}

/** OOXML CT_WheelTransition 的 spokes。缺省 4。界面提供 1/2/3/4/8，其它 1–8 的整数照播。 */
export function wheelSpokes(pattern: unknown): number {
  const n = Number(pattern);
  if (!Number.isFinite(n)) return 4;
  const rounded = Math.round(n);
  if (rounded < 1 || rounded > 8) return 4;
  return rounded;
}

/** 固定点数的轮辐多边形，portion 0 收成射线，1 铺满画面。reverse 往反方向张开。 */
export function wheelPolygon(spokes: number, portion: number, reverse: boolean): string {
  const n = Math.max(1, Math.min(8, Math.round(spokes)));
  const steps = 6;
  const p = Math.min(1, Math.max(0, portion));
  const spin = reverse ? -1 : 1;
  const pts: string[] = [];
  for (let s = 0; s < n; s++) {
    const startAng = spin * (s / n) * Math.PI * 2 - Math.PI / 2;
    const sweep = spin * ((p * Math.PI * 2) / n);
    pts.push("50% 50%");
    for (let i = 0; i <= steps; i++) {
      const ang = startAng + sweep * (i / steps);
      const x = 50 + Math.cos(ang) * 90;
      const y = 50 + Math.sin(ang) * 90;
      pts.push(`${x.toFixed(2)}% ${y.toFixed(2)}%`);
    }
  }
  return `polygon(${pts.join(",")})`;
}

const STRIP_ORIGIN: Record<string, [number, number]> = {
  topLeft: [100, 100],
  topRight: [0, 100],
  bottomLeft: [100, 0],
  bottomRight: [0, 0],
};

/** 条纹沿 dir 扫过。dir 是运动方向（topLeft = 朝左上，即从右下进来）。三点同点数，方便插值。 */
export function stripsClips(dir: string): [string, string, string] {
  const [ox, oy] = STRIP_ORIGIN[dir] ?? STRIP_ORIGIN.bottomRight!;
  const sx = ox === 0 ? 1 : -1;
  const sy = oy === 0 ? 1 : -1;
  const at = (dx: number, dy: number): string => {
    const x = ox + sx * dx;
    const y = oy + sy * dy;
    return `polygon(${x}% ${y}%, ${x}% ${y}%, ${ox}% ${oy}%, ${ox}% ${oy}%)`;
  };
  const end = "polygon(-15% -15%, 115% -15%, 115% 115%, -15% 115%)";
  return [at(0, 0), at(70, 35), end];
}

/** 涟漪收缩的圆心。角方向用面板的 topLeft / topRight / bottomLeft / bottomRight。 */
export function rippleAt(dir: string): string {
  switch (dir) {
    case "topLeft":
      return "0% 0%";
    case "topRight":
      return "100% 0%";
    case "bottomLeft":
      return "0% 100%";
    case "bottomRight":
      return "100% 100%";
    default:
      return "50% 50%";
  }
}

const DIAMOND_TILE =
  `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><polygon points="14,2 26,14 14,26 2,14" fill="black"/></svg>`;
const HEX_TILE =
  `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="28" viewBox="0 0 32 28"><polygon points="8,2 24,2 30,14 24,26 8,26 2,14" fill="black"/></svg>`;
const HONEY_TILE =
  `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="36" viewBox="0 0 40 36"><polygon points="12,3 28,3 36,18 28,33 12,33 4,18" fill="black"/></svg>`;

/** 闪耀的菱形 / 六边形，以及蜂巢的疏六边形。mask 里黑色是露出的部分。 */
export function cellMask(kind: string): string {
  const svg = kind === "honeycomb" ? HONEY_TILE : kind === "hexagon" ? HEX_TILE : DIAMOND_TILE;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** 面板上「方向 · 图案」和 params.dir + params.pattern 互转。缺省向左、菱形。 */
export function glitterToken(dir: unknown, pattern: unknown): string {
  const d = dir === "right" || dir === "up" || dir === "down" ? String(dir) : "left";
  const p = pattern === "hexagon" ? "hexagon" : "diamond";
  return `${d}:${p}`;
}

export function glitterParamsFromToken(token: string): { dir: "left" | "right" | "up" | "down"; pattern: "diamond" | "hexagon" } {
  const [rawDir, rawPattern] = token.split(":");
  const dir = rawDir === "right" || rawDir === "up" || rawDir === "down" ? rawDir : "left";
  const pattern = rawPattern === "hexagon" ? "hexagon" : "diamond";
  return { dir, pattern };
}

/** 闪耀扫过的起点和终点。向左从左缘扫到右缘，其余镜像。 */
export function glitterSweep(dir: string): { from: string; to: string } {
  switch (dir) {
    case "right":
      return { from: "120% 50%", to: "-20% 50%" };
    case "up":
      return { from: "50% 120%", to: "50% -20%" };
    case "down":
      return { from: "50% -20%", to: "50% 120%" };
    default:
      return { from: "-20% 50%", to: "120% 50%" };
  }
}

/** 剥离后仍平贴的那一块。towardRight 从左下角往右揭，否则从右下角往左揭。amount 0 整页，1 几乎揭完。 */
export function peelFlatClip(towardRight: boolean, amount: number): string {
  const a = Math.min(1, Math.max(0, amount));
  if (towardRight) {
    const x = (a * 78).toFixed(1);
    const y = (100 - a * 78).toFixed(1);
    return `polygon(0% 0%, 100% 0%, 100% 100%, ${x}% ${y}%)`;
  }
  const x = (100 - a * 78).toFixed(1);
  const y = (100 - a * 78).toFixed(1);
  return `polygon(0% 0%, 100% 0%, ${x}% ${y}%, 0% 100%)`;
}
