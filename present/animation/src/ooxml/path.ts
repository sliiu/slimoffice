// ECMA-376 §19.5.9 animMotion@path
// PPT path 命令使用大写 SVG-like 命令 + 单独命令字母 E（end），坐标在 [0..1] 归一化空间。
// 我们把它转换为标准 SVG d 字符串（保持归一化），由 sampler 在每帧采样为 (x, y)。

export interface SampledPoint {
  x: number;
  y: number;
  angle: number;
  // §19.5.9 animMotion@ptsTypes 把对应 control point 标记为 corner 时，runtime
  // 在该点不做角度平均（保持锐角切换）；非 corner 时切线可平滑。
  // 由 samplePath 根据 ptsTypes + 段切线计算填充。
  cornerAhead?: boolean;
}

// 把 OOXML 风格 path 规约为 SVG 风格 d
export function normalizeMotionPath(raw: string): string {
  return raw
    .replace(/(^|\s)E(?=\s|$)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

// 沿路径均匀采样 n 个点（含起点终点），返回归一化坐标 + 切线角度。
// scaleW/scaleH 把归一化坐标转换为像素。
// ptsTypes（§19.5.9 animMotion@ptsTypes）每个字符对应一个 endpoint:
//   "F" = fixed corner / "C" = corner → 角点，切线保持段内方向，不与下一段平均
//   "A" = auto-smooth / "S" = smooth   → 平滑过渡，角点处取前后平均切线
//   ""/空 → 默认平滑
// 影响：采样点落在段交界（segment boundary）时，若交界点是 corner，则该点 angle
// 用"刚结束的段尾方向"，避免 rotateToPath 在角点跳变到下一段方向。
export function samplePath(
  d: string,
  n: number,
  scaleW: number,
  scaleH: number,
  ptsTypes?: string,
): SampledPoint[] {
  const segs = tokenize(d, scaleW, scaleH);
  if (segs.length === 0) return [];
  const corners = parsePtsTypes(ptsTypes, segs.length);
  const lens: number[] = [];
  let total = 0;
  for (const seg of segs) {
    const L = approxLen(seg);
    lens.push(L);
    total += L;
  }
  if (total <= 0) {
    const last = segs[segs.length - 1]!;
    const p = atSeg(last, 1);
    return Array.from({ length: n }, () => ({ x: p.x, y: p.y, angle: 0 }));
  }
  const out: SampledPoint[] = [];
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0 : i / (n - 1);
    const target = u * total;
    let acc = 0;
    let segIdx = 0;
    let local = 0;
    for (let s = 0; s < segs.length; s++) {
      const L = lens[s]!;
      if (target <= acc + L || s === segs.length - 1) {
        segIdx = s;
        local = L > 0 ? (target - acc) / L : 0;
        break;
      }
      acc += L;
    }
    const pt = atSeg(segs[segIdx]!, local);
    // §19.5.9 corner 处保持段尾切线：runtime 看到 cornerAhead 后不再向下一段平均。
    if (segIdx < segs.length - 1 && local >= 1 - 1e-6 && corners[segIdx]) {
      pt.cornerAhead = true;
    }
    out.push(pt);
  }
  return out;
}

function parsePtsTypes(s: string | undefined, segCount: number): boolean[] {
  const out: boolean[] = new Array(segCount).fill(false);
  if (!s) return out;
  // 字符按段 endpoint 一一对应；超出的部分忽略，不足的部分按 false 处理。
  for (let i = 0; i < Math.min(s.length, segCount); i++) {
    const ch = s[i]!.toUpperCase();
    out[i] = ch === "F" || ch === "C";
  }
  return out;
}

interface Seg {
  type: "L" | "C" | "Q" | "M";
  pts: Array<{ x: number; y: number }>;
}

function tokenize(d: string, sw: number, sh: number): Seg[] {
  const tokens = d.replace(/,/g, " ").trim().split(/\s+/);
  const segs: Seg[] = [];
  let i = 0;
  let cur = { x: 0, y: 0 };
  let lastCmd = "M";
  const readPt = (rel: boolean): { x: number; y: number } => {
    const x = Number(tokens[i++]) * sw;
    const y = Number(tokens[i++]) * sh;
    return rel ? { x: cur.x + x, y: cur.y + y } : { x, y };
  };
  while (i < tokens.length) {
    let cmd = tokens[i]!;
    if (/^[a-zA-Z]$/.test(cmd)) {
      lastCmd = cmd;
      i++;
    } else {
      cmd = lastCmd;
    }
    const rel = cmd === cmd.toLowerCase();
    switch (cmd.toUpperCase()) {
      case "M": {
        const p = readPt(rel);
        segs.push({ type: "M", pts: [p] });
        cur = p;
        lastCmd = rel ? "l" : "L";
        break;
      }
      case "L": {
        const p = readPt(rel);
        segs.push({ type: "L", pts: [cur, p] });
        cur = p;
        break;
      }
      case "H": {
        const x = Number(tokens[i++]) * sw;
        const nx = rel ? cur.x + x : x;
        const p = { x: nx, y: cur.y };
        segs.push({ type: "L", pts: [cur, p] });
        cur = p;
        break;
      }
      case "V": {
        const y = Number(tokens[i++]) * sh;
        const ny = rel ? cur.y + y : y;
        const p = { x: cur.x, y: ny };
        segs.push({ type: "L", pts: [cur, p] });
        cur = p;
        break;
      }
      case "C": {
        const c1 = readPt(rel);
        const c2 = readPt(rel);
        const p = readPt(rel);
        segs.push({ type: "C", pts: [cur, c1, c2, p] });
        cur = p;
        break;
      }
      case "Q": {
        const c1 = readPt(rel);
        const p = readPt(rel);
        segs.push({ type: "Q", pts: [cur, c1, p] });
        cur = p;
        break;
      }
      case "Z": {
        if (segs.length > 0) {
          const first = firstMove(segs) ?? cur;
          segs.push({ type: "L", pts: [cur, first] });
          cur = first;
        }
        break;
      }
      default:
        i++;
        break;
    }
  }
  return segs;
}

function firstMove(segs: Seg[]): { x: number; y: number } | null {
  for (const s of segs) if (s.type === "M") return s.pts[0]!;
  return null;
}

function approxLen(s: Seg): number {
  if (s.type === "M") return 0;
  if (s.type === "L") {
    const [a, b] = s.pts;
    return Math.hypot(b!.x - a!.x, b!.y - a!.y);
  }
  let len = 0;
  let prev = s.pts[0]!;
  const N = 16;
  for (let i = 1; i <= N; i++) {
    const t = i / N;
    const p = evalSeg(s, t);
    len += Math.hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
  }
  return len;
}

function evalSeg(s: Seg, t: number): { x: number; y: number } {
  if (s.type === "L" || s.type === "M") {
    const a = s.pts[0]!;
    const b = s.pts[s.pts.length - 1]!;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }
  if (s.type === "Q") {
    const [p0, p1, p2] = s.pts;
    const u = 1 - t;
    return {
      x: u * u * p0!.x + 2 * u * t * p1!.x + t * t * p2!.x,
      y: u * u * p0!.y + 2 * u * t * p1!.y + t * t * p2!.y,
    };
  }
  const [p0, p1, p2, p3] = s.pts;
  const u = 1 - t;
  return {
    x: u * u * u * p0!.x + 3 * u * u * t * p1!.x + 3 * u * t * t * p2!.x + t * t * t * p3!.x,
    y: u * u * u * p0!.y + 3 * u * u * t * p1!.y + 3 * u * t * t * p2!.y + t * t * t * p3!.y,
  };
}

function atSeg(s: Seg, t: number): SampledPoint {
  const eps = 0.001;
  const p = evalSeg(s, t);
  // §19.5.9 切线计算：t≥1-eps 时前向差会被 min(1, …) 钳住与 p 重合，
  // 改用 (p - 前一点) 的后向差；其他情况仍用前向差，保证切线方向连续。
  let q;
  let backward = false;
  if (t + eps > 1) {
    q = evalSeg(s, Math.max(0, t - eps));
    backward = true;
  } else {
    q = evalSeg(s, t + eps);
  }
  const dx = backward ? p.x - q.x : q.x - p.x;
  const dy = backward ? p.y - q.y : q.y - p.y;
  return { x: p.x, y: p.y, angle: Math.atan2(dy, dx) };
}

// rotate path d 字符串中所有数对（按 (x,y) 配对）以原点为中心旋转 deg 度。
export function rotateMotionPath(d: string, deg: number): string {
  if (!deg) return d;
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return d.replace(/(-?\d*\.?\d+)\s+(-?\d*\.?\d+)/g, (_m, xs: string, ys: string) => {
    const x = Number(xs);
    const y = Number(ys);
    const nx = x * cos - y * sin;
    const ny = x * sin + y * cos;
    return `${nx.toFixed(6)} ${ny.toFixed(6)}`;
  });
}
