import type { Rect } from "./geometry";
import type { Shape, TextParagraph } from "./shape";
import { identityTransform } from "./geometry";

export type SmartArtLayoutKind =
  | "list"
  | "process"
  | "cycle"
  | "pyramid"
  | "hierarchy"
  | "matrix"
  | "chevron"
  | "funnel"
  | "timeline"
  | "radial"
  | "stacked"
  | "equation"
  | "horizontalList"
  | "processVertical"
  | "orgChart"
  | "venn"
  | "target"
  | "blockCycle"
  | "pictureAccent"
  | "arrowRibbon"
  | "invertedPyramid"
  | "pie"
  | "balance"
  | "opposingArrows"
  | "gear"
  | "horizontalHierarchy"
  | "converging"
  | "alternating"
  | "hexagon"
  | "pictureCaption";

export const SMARTART_LAYOUT_KINDS: SmartArtLayoutKind[] = [
  "list",
  "horizontalList",
  "stacked",
  "pictureAccent",
  "process",
  "processVertical",
  "chevron",
  "arrowRibbon",
  "cycle",
  "blockCycle",
  "pyramid",
  "funnel",
  "hierarchy",
  "orgChart",
  "matrix",
  "timeline",
  "radial",
  "target",
  "venn",
  "equation",
  "invertedPyramid",
  "pie",
  "balance",
  "opposingArrows",
  "gear",
  "horizontalHierarchy",
  "converging",
  "alternating",
  "hexagon",
  "pictureCaption",
];

export interface SmartArtMeta {
  layout: SmartArtLayoutKind;
}

export interface SmartArtItem {
  id: string;
  text: string;
  lvl?: number;
  /** Optional accent image (`pictureAccent` layout). */
  imageSrc?: string;
}

export const SMARTART_LAYOUT_LABELS: Record<SmartArtLayoutKind, string> = {
  list: "Vertical List",
  horizontalList: "Horizontal List",
  process: "Process",
  processVertical: "Vertical Process",
  cycle: "Cycle",
  blockCycle: "Block Cycle",
  pyramid: "Pyramid",
  hierarchy: "Hierarchy",
  orgChart: "Organization Chart",
  matrix: "Matrix",
  chevron: "Chevron Process",
  arrowRibbon: "Ascending Ribbon",
  funnel: "Funnel",
  timeline: "Timeline",
  radial: "Radial",
  target: "Target",
  venn: "Venn Diagram",
  stacked: "Stacked List",
  pictureAccent: "Picture Accent List",
  equation: "Equation",
  invertedPyramid: "Inverted Pyramid",
  pie: "Basic Pie",
  balance: "Balance",
  opposingArrows: "Opposing Arrows",
  gear: "Gear",
  horizontalHierarchy: "Horizontal Hierarchy",
  converging: "Converging Arrows",
  alternating: "Alternating Flow",
  hexagon: "Hexagon Process",
  pictureCaption: "Picture Caption",
};

const OFFICE_LAYOUT_TAIL: Record<string, SmartArtLayoutKind> = {
  invertedpyramid: "invertedPyramid",
  pyramid2: "invertedPyramid",
  pie: "pie",
  pie1: "pie",
  basicpie: "pie",
  balance: "balance",
  balance1: "balance",
  opposingideas: "opposingArrows",
  opposingarrows: "opposingArrows",
  gear: "gear",
  gear1: "gear",
  horizontalhierarchy: "horizontalHierarchy",
  hierarchy3: "horizontalHierarchy",
  converging: "converging",
  convergingarrows: "converging",
  alternatingflow: "alternating",
  alternatinghexagon: "alternating",
  hexagon: "hexagon",
  basichexagon: "hexagon",
  picturecaption: "pictureCaption",
  picturecaptionlist: "pictureCaption",
};

/** Numbered Office tails (`process1`, `cycle2`) that are not in the exact table. */
const TAIL_RULES: ReadonlyArray<readonly [RegExp, SmartArtLayoutKind]> = [
  [/picturecaption|snapshotpicture/, "pictureCaption"],
  [/pictureaccent|accentpicture/, "pictureAccent"],
  [/alternating/, "alternating"],
  [/hexagon/, "hexagon"],
  [/invertedpyramid/, "invertedPyramid"],
  [/orgchart|organization/, "orgChart"],
  [/horizontalhier/, "horizontalHierarchy"],
  [/verticalprocess/, "processVertical"],
  [/horizontalbullet|horizontallist|^hlist/, "horizontalList"],
  [/stacked/, "stacked"],
  [/chevron/, "chevron"],
  [/arrowribbon|ascending|stepup/, "arrowRibbon"],
  [/blockcycle/, "blockCycle"],
  [/opposing/, "opposingArrows"],
  [/balance/, "balance"],
  [/venn/, "venn"],
  [/target|bullseye/, "target"],
  [/funnel/, "funnel"],
  [/pyramid/, "pyramid"],
  [/radial/, "radial"],
  [/timeline/, "timeline"],
  [/equation/, "equation"],
  [/matrix/, "matrix"],
  [/hierarchy/, "hierarchy"],
  [/gear/, "gear"],
  [/pie/, "pie"],
  [/cycle/, "cycle"],
  [/process/, "process"],
  [/list/, "list"],
];

/** Office `layoutDef@uniqueId` tail, or a SlimPPT urn, → layout kind. */
export function smartArtLayoutFromUniqueId(uniqueId: string | undefined): SmartArtLayoutKind | undefined {
  if (!uniqueId) return undefined;
  const slim = /^urn:slimppt:smartart\/([A-Za-z]+)$/.exec(uniqueId);
  if (slim && (SMARTART_LAYOUT_KINDS as readonly string[]).includes(slim[1]!)) {
    return slim[1] as SmartArtLayoutKind;
  }
  const tail = uniqueId.split("/").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
  const exact = OFFICE_LAYOUT_TAIL[tail];
  if (exact) return exact;
  for (const [re, kind] of TAIL_RULES) {
    if (re.test(tail)) return kind;
  }
  return undefined;
}

/** OOXML dgm cat type → layout kind。 */
export function smartArtLayoutFromCat(cat: string | undefined): SmartArtLayoutKind {
  switch (cat) {
    case "cycle":
      return "cycle";
    case "pyramid":
      return "pyramid";
    case "hierarchy":
    case "tree":
      return "hierarchy";
    case "matrix":
      return "matrix";
    case "process":
    case "convert":
      return "process";
    case "chevron":
    case "arrow":
      return "chevron";
    case "funnel":
      return "funnel";
    case "relationship":
    case "radial":
      return "radial";
    case "timeline":
    case "date":
      return "timeline";
    case "stacked":
      return "stacked";
    case "equation":
    case "math":
      return "equation";
    case "horizontal":
    case "hlist":
      return "horizontalList";
    case "vertical":
    case "vprocess":
      return "processVertical";
    case "org":
    case "orgchart":
      return "orgChart";
    case "venn":
    case "intersection":
      return "venn";
    case "target":
    case "bullseye":
      return "target";
    case "block":
      return "blockCycle";
    case "picture":
    case "accent":
      return "pictureAccent";
    case "ribbon":
    case "stair":
      return "arrowRibbon";
    default:
      return "list";
  }
}

// IR 里换行 = 多个段落（`<a:br>` 由 parser 拆段、serializer 按段写 `<a:p>`）；run 内嵌 "\n"
// 写进 `<a:t>` 后会被 PowerPoint 当空白折叠。textFromShape 反向用 "\n" 拼段，round-trip 对称。
function para(text: string): TextParagraph[] {
  const lines = text.split(/\r?\n/);
  return (lines.length ? lines : [""]).map((line) => ({ runs: [{ text: line }] }));
}

type LayoutItem = { id: string; text: TextParagraph[]; lvl: number; imageSrc?: string };

function toLayoutItems(items: SmartArtItem[]): LayoutItem[] {
  return items.map((it, i) => ({
    id: it.id || `item_${i}`,
    text: para(it.text || `Item ${i + 1}`),
    lvl: it.lvl ?? 0,
    imageSrc: it.imageSrc,
  }));
}

const CARD_COLORS = {
  list: { fill: "#dbeafe", stroke: "#3b82f6" },
  process: { fill: "#fef3c7", stroke: "#f59e0b" },
  cycle: { fill: "#dcfce7", stroke: "#16a34a" },
  pyramid: { fill: "#fce7f3", stroke: "#ec4899" },
  hierarchy: { fill: "#e0e7ff", stroke: "#6366f1" },
  hierarchyChild: { fill: "#fef9c3", stroke: "#ca8a04" },
  matrix: { fill: "#f3e8ff", stroke: "#9333ea" },
  chevron: { fill: "#cffafe", stroke: "#0891b2" },
  funnel: { fill: "#ffe4e6", stroke: "#e11d48" },
  timeline: { fill: "#ecfccb", stroke: "#65a30d" },
  radial: { fill: "#ffedd5", stroke: "#ea580c" },
  radialHub: { fill: "#fed7aa", stroke: "#c2410c" },
  stacked: { fill: "#e2e8f0", stroke: "#475569" },
  equation: { fill: "#ddd6fe", stroke: "#7c3aed" },
  horizontalList: { fill: "#dbeafe", stroke: "#2563eb" },
  processVertical: { fill: "#fef3c7", stroke: "#d97706" },
  orgChart: { fill: "#e0e7ff", stroke: "#4f46e5" },
  orgChartChild: { fill: "#f0fdf4", stroke: "#16a34a" },
  venn: { fill: "#bfdbfe", stroke: "#1d4ed8" },
  venn2: { fill: "#fecdd3", stroke: "#e11d48" },
  venn3: { fill: "#bbf7d0", stroke: "#15803d" },
  target: { fill: "#ffedd5", stroke: "#ea580c" },
  targetRing: { fill: "#fff7ed", stroke: "#fb923c" },
  blockCycle: { fill: "#d1fae5", stroke: "#059669" },
  pictureAccent: { fill: "#f1f5f9", stroke: "#64748b" },
  pictureSlot: { fill: "#e2e8f0", stroke: "#94a3b8" },
  arrowRibbon: { fill: "#e0f2fe", stroke: "#0284c7" },
  invertedPyramid: { fill: "#fce7f3", stroke: "#db2777" },
  pie: { fill: "#dbeafe", stroke: "#2563eb" },
  balance: { fill: "#fef3c7", stroke: "#d97706" },
  opposingArrows: { fill: "#cffafe", stroke: "#0e7490" },
  gear: { fill: "#e0e7ff", stroke: "#4f46e5" },
  horizontalHierarchy: { fill: "#e0e7ff", stroke: "#4338ca" },
  converging: { fill: "#ffedd5", stroke: "#c2410c" },
  alternating: { fill: "#fef3c7", stroke: "#d97706" },
  hexagon: { fill: "#cffafe", stroke: "#0e7490" },
  pictureCaption: { fill: "#f8fafc", stroke: "#64748b" },
};

function makeCard(
  itemId: string,
  idx: number,
  bbox: Rect,
  text: TextParagraph[],
  color: { fill: string; stroke: string },
  lvl = 0,
): Shape[] {
  return [
    {
      id: `sa_${idx}_bg_${itemId}`,
      name: `sa|lvl:${lvl}`,
      zIndex: idx * 10,
      visible: true,
      locked: false,
      opacity: 1,
      kind: "rect",
      bbox,
      transform: identityTransform(),
      rx: 6,
      ry: 6,
      fill: { kind: "solid", color: color.fill },
      stroke: { paint: { kind: "solid", color: color.stroke }, width: 1 },
    },
    {
      id: `sa_${idx}_text_${itemId}`,
      name: `Item ${idx + 1} text`,
      zIndex: idx * 10 + 1,
      visible: true,
      locked: false,
      opacity: 1,
      kind: "text",
      bbox,
      transform: identityTransform(),
      paragraphs: text,
      vAlign: "middle",
      wrap: true,
      insets: { l: 10, t: 6, r: 10, b: 6 },
    },
  ];
}

function makeConnector(id: string, x1: number, y1: number, x2: number, y2: number, zIndex: number): Shape {
  const pad = 2;
  // The tail arrow (med × med at 2px) extends ~10px past the line end. Stop the line that far
  // short of the target so the head ends at the card's edge instead of over its first word.
  const len = Math.hypot(x2 - x1, y2 - y1);
  const headLen = 10;
  if (len > headLen * 1.5) {
    x2 -= ((x2 - x1) / len) * headLen;
    y2 -= ((y2 - y1) / len) * headLen;
  }
  return {
    id,
    name: "Connector",
    zIndex,
    visible: true,
    locked: false,
    opacity: 1,
    kind: "line",
    x1,
    y1,
    x2,
    y2,
    bbox: {
      x: Math.min(x1, x2) - pad,
      y: Math.min(y1, y2) - pad,
      w: Math.abs(x2 - x1) + pad * 2,
      h: Math.abs(y2 - y1) + pad * 2,
    },
    transform: identityTransform(),
    stroke: {
      paint: { kind: "solid", color: "#64748b" },
      width: 2,
      tailEnd: { kind: "triangle", w: "med", len: "med" },
    },
  };
}

function chevronNotch(b: Rect): number {
  return Math.min(b.w * 0.18, 24);
}

function chevronPath(b: Rect): string {
  const notch = chevronNotch(b);
  return `M ${b.x} ${b.y} L ${b.x + b.w - notch} ${b.y} L ${b.x + b.w} ${b.y + b.h / 2} L ${b.x + b.w - notch} ${b.y + b.h} L ${b.x} ${b.y + b.h} L ${b.x + notch} ${b.y + b.h / 2} Z`;
}

function makeChevronCard(itemId: string, idx: number, bbox: Rect, text: TextParagraph[], lvl = 0): Shape[] {
  return [
    {
      id: `sa_${idx}_bg_${itemId}`,
      name: `sa|lvl:${lvl}`,
      zIndex: idx * 10,
      visible: true,
      locked: false,
      opacity: 1,
      kind: "path",
      bbox,
      transform: identityTransform(),
      d: chevronPath(bbox),
      fillRule: "nonzero",
      fill: { kind: "solid", color: CARD_COLORS.chevron.fill },
      stroke: { paint: { kind: "solid", color: CARD_COLORS.chevron.stroke }, width: 1 },
    },
    {
      id: `sa_${idx}_text_${itemId}`,
      name: `Item ${idx + 1} text`,
      zIndex: idx * 10 + 1,
      visible: true,
      locked: false,
      opacity: 1,
      kind: "text",
      // PowerPoint Chevron Process：文字区夹在进/出两个缺口之间，水平居中。
      bbox: { x: bbox.x + chevronNotch(bbox), y: bbox.y, w: bbox.w - 2 * chevronNotch(bbox), h: bbox.h },
      transform: identityTransform(),
      paragraphs: text.map((p) => (p.align ? p : { ...p, align: "middle" })),
      vAlign: "middle",
      wrap: true,
      insets: { l: 6, t: 4, r: 6, b: 4 },
    },
  ];
}

function layoutList(items: LayoutItem[], bbox: Rect): Shape[] {
  const padding = Math.min(16, bbox.w * 0.04);
  const rowH = Math.max(36, (bbox.h - padding * 2) / items.length);
  const out: Shape[] = [];
  let y = bbox.y + padding;
  items.forEach((it, i) => {
    const cardBBox: Rect = { x: bbox.x + padding, y, w: bbox.w - padding * 2, h: rowH - 6 };
    out.push(...makeCard(it.id, i, cardBBox, it.text, CARD_COLORS.list, it.lvl));
    y += rowH;
  });
  return out;
}

function layoutProcess(items: LayoutItem[], bbox: Rect): Shape[] {
  const padding = Math.min(16, bbox.w * 0.03);
  const colW = (bbox.w - padding * 2) / items.length;
  const out: Shape[] = [];
  const cardBboxes: Rect[] = [];
  items.forEach((it, i) => {
    const cardBBox: Rect = {
      x: bbox.x + padding + i * colW,
      y: bbox.y + bbox.h * 0.25,
      w: colW * 0.88,
      h: bbox.h * 0.5,
    };
    cardBboxes.push(cardBBox);
    out.push(...makeCard(it.id, i, cardBBox, it.text, CARD_COLORS.process, it.lvl));
  });
  for (let i = 0; i < cardBboxes.length - 1; i++) {
    const a = cardBboxes[i]!;
    const b = cardBboxes[i + 1]!;
    out.push(
      makeConnector(
        `sa_conn_proc_${i}`,
        a.x + a.w,
        a.y + a.h / 2,
        b.x,
        b.y + b.h / 2,
        -10 + i,
      ),
    );
  }
  return out;
}

function layoutCycle(items: LayoutItem[], bbox: Rect): Shape[] {
  const cx = bbox.x + bbox.w / 2;
  const cy = bbox.y + bbox.h / 2;
  const r = Math.min(bbox.w, bbox.h) * 0.35;
  const cardW = Math.min(bbox.w * 0.25, 160);
  const cardH = Math.min(bbox.h * 0.18, 60);
  const out: Shape[] = [];
  const centers: Array<{ x: number; y: number }> = [];
  items.forEach((it, i) => {
    const angle = -Math.PI / 2 + (i * Math.PI * 2) / items.length;
    const x = cx + Math.cos(angle) * r - cardW / 2;
    const y = cy + Math.sin(angle) * r - cardH / 2;
    centers.push({ x: x + cardW / 2, y: y + cardH / 2 });
    out.push(...makeCard(it.id, i, { x, y, w: cardW, h: cardH }, it.text, CARD_COLORS.cycle, it.lvl));
  });
  for (let i = 0; i < centers.length; i++) {
    const a = centers[i]!;
    const b = centers[(i + 1) % centers.length]!;
    out.push(makeConnector(`sa_conn_cycle_${i}`, a.x, a.y, b.x, b.y, -20 + i));
  }
  return out;
}

function layoutPyramid(items: LayoutItem[], bbox: Rect): Shape[] {
  const padding = Math.min(8, bbox.h * 0.02);
  const rowH = (bbox.h - padding * 2) / items.length;
  const out: Shape[] = [];
  items.forEach((it, i) => {
    const widthRatio = (i + 1) / items.length;
    const w = bbox.w * widthRatio;
    const x = bbox.x + (bbox.w - w) / 2;
    const y = bbox.y + padding + i * rowH;
    out.push(...makeCard(it.id, i, { x, y, w, h: rowH - 4 }, it.text, CARD_COLORS.pyramid, it.lvl));
  });
  return out;
}

function layoutFunnel(items: LayoutItem[], bbox: Rect): Shape[] {
  const padding = Math.min(8, bbox.h * 0.02);
  const rowH = (bbox.h - padding * 2) / items.length;
  const out: Shape[] = [];
  items.forEach((it, i) => {
    const widthRatio = 1 - i / Math.max(1, items.length - 1 || 1);
    const w = bbox.w * Math.max(0.35, widthRatio);
    const x = bbox.x + (bbox.w - w) / 2;
    const y = bbox.y + padding + i * rowH;
    out.push(...makeCard(it.id, i, { x, y, w, h: rowH - 4 }, it.text, CARD_COLORS.funnel, it.lvl));
  });
  return out;
}

function layoutHierarchy(items: LayoutItem[], bbox: Rect): Shape[] {
  const maxLvl = Math.max(0, ...items.map((it) => it.lvl));
  const byLvl = new Map<number, LayoutItem[]>();
  for (const it of items) {
    const row = byLvl.get(it.lvl) ?? [];
    row.push(it);
    byLvl.set(it.lvl, row);
  }
  const out: Shape[] = [];
  const rowH = bbox.h / (maxLvl + 1);
  // 卡片跟着可用格子长大（而不是固定 140×52）：多段文字（标题 + 说明）才有地方落，
  // 不会从卡片里溢出去；行内很多节点时仍受 colW 约束不互相压。
  const cardH = Math.max(52, Math.min(rowH * 0.62, 150));
  const cardCenters: Map<string, { x: number; y: number; top: number }> = new Map();
  let globalIdx = 0;
  for (let lvl = 0; lvl <= maxLvl; lvl++) {
    const rowItems = byLvl.get(lvl) ?? [];
    const colW = bbox.w / Math.max(1, rowItems.length);
    const cardW = Math.max(Math.min(140, colW - 8), Math.min(colW * 0.82, 320));
    const y = bbox.y + lvl * rowH + (rowH - cardH) / 2;
    rowItems.forEach((it, i) => {
      const x = bbox.x + i * colW + (colW - cardW) / 2;
      const color = lvl === 0 ? CARD_COLORS.hierarchy : CARD_COLORS.hierarchyChild;
      out.push(...makeCard(it.id, globalIdx, { x, y, w: cardW, h: cardH }, it.text, color, it.lvl));
      cardCenters.set(it.id, { x: x + cardW / 2, y: y + cardH, top: y });
      globalIdx += 1;
    });
  }
  const roots = byLvl.get(0) ?? [];
  const children = items.filter((it) => it.lvl > 0);
  if (roots.length === 1 && children.length > 0) {
    const rootC = cardCenters.get(roots[0]!.id);
    if (rootC) {
      children.forEach((ch, i) => {
        const childC = cardCenters.get(ch.id);
        if (!childC) return;
        out.push(
          makeConnector(`sa_conn_hier_${i}`, rootC.x, rootC.y, childC.x, childC.top, -30 + i),
        );
      });
    }
  }
  return out;
}

function layoutMatrix(items: LayoutItem[], bbox: Rect): Shape[] {
  const cols = Math.ceil(Math.sqrt(items.length));
  const rows = Math.ceil(items.length / cols);
  const w = bbox.w / cols;
  const h = bbox.h / rows;
  const out: Shape[] = [];
  items.forEach((it, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    out.push(
      ...makeCard(
        it.id,
        i,
        { x: bbox.x + c * w + 4, y: bbox.y + r * h + 4, w: w - 8, h: h - 8 },
        it.text,
        CARD_COLORS.matrix,
        it.lvl,
      ),
    );
  });
  return out;
}

function layoutChevron(items: LayoutItem[], bbox: Rect): Shape[] {
  const padding = Math.min(12, bbox.w * 0.02);
  const overlap = 18;
  const totalW = bbox.w - padding * 2 + overlap * (items.length - 1);
  const colW = totalW / items.length;
  const cardH = bbox.h * 0.55;
  const y = bbox.y + (bbox.h - cardH) / 2;
  const out: Shape[] = [];
  items.forEach((it, i) => {
    const x = bbox.x + padding + i * (colW - overlap);
    out.push(...makeChevronCard(it.id, i, { x, y, w: colW, h: cardH }, it.text, it.lvl));
  });
  return out;
}

function layoutTimeline(items: LayoutItem[], bbox: Rect): Shape[] {
  const padding = Math.min(20, bbox.w * 0.04);
  const lineY = bbox.y + bbox.h * 0.45;
  const stepW = (bbox.w - padding * 2) / Math.max(1, items.length - 1 || 1);
  const cardW = Math.min(stepW * 0.85, 140);
  const cardH = bbox.h * 0.28;
  const out: Shape[] = [];
  const dots: Array<{ x: number; y: number }> = [];
  items.forEach((it, i) => {
    const cx = items.length === 1 ? bbox.x + bbox.w / 2 : bbox.x + padding + i * stepW;
    dots.push({ x: cx, y: lineY });
    const labelAbove = i % 2 === 0;
    const cardY = labelAbove ? lineY - cardH - 16 : lineY + 16;
    out.push(
      ...makeCard(
        it.id,
        i,
        { x: cx - cardW / 2, y: cardY, w: cardW, h: cardH },
        it.text,
        CARD_COLORS.timeline,
        it.lvl,
      ),
    );
    out.push({
      id: `sa_${i}_dot_${it.id}`,
      name: "Timeline dot",
      zIndex: i * 10 + 2,
      visible: true,
      locked: false,
      opacity: 1,
      kind: "ellipse",
      bbox: { x: cx - 6, y: lineY - 6, w: 12, h: 12 },
      transform: identityTransform(),
      fill: { kind: "solid", color: CARD_COLORS.timeline.stroke },
      stroke: { paint: { kind: "solid", color: "#ffffff" }, width: 2 },
    });
  });
  if (dots.length > 1) {
    out.push(
      makeConnector(
        "sa_conn_timeline",
        dots[0]!.x,
        lineY,
        dots[dots.length - 1]!.x,
        lineY,
        -50,
      ),
    );
    const line = out.find((s) => s.id === "sa_conn_timeline");
    if (line && line.kind === "line") line.stroke = { paint: { kind: "solid", color: "#94a3b8" }, width: 3 };
  }
  return out;
}

function layoutRadial(items: LayoutItem[], bbox: Rect): Shape[] {
  if (!items.length) return [];
  const hub = items[0]!;
  const spokes = items.slice(1);
  const cx = bbox.x + bbox.w / 2;
  const cy = bbox.y + bbox.h / 2;
  const hubW = Math.min(bbox.w * 0.28, 160);
  const hubH = Math.min(bbox.h * 0.22, 72);
  const out: Shape[] = [];
  out.push(
    ...makeCard(
      hub.id,
      0,
      { x: cx - hubW / 2, y: cy - hubH / 2, w: hubW, h: hubH },
      hub.text,
      CARD_COLORS.radialHub,
      hub.lvl,
    ),
  );
  const cardW = Math.min(bbox.w * 0.22, 130);
  const cardH = Math.min(bbox.h * 0.16, 52);
  const r = Math.min(bbox.w, bbox.h) * 0.38;
  spokes.forEach((it, i) => {
    const angle = -Math.PI / 2 + (i * Math.PI * 2) / Math.max(1, spokes.length);
    const x = cx + Math.cos(angle) * r - cardW / 2;
    const y = cy + Math.sin(angle) * r - cardH / 2;
    out.push(...makeCard(it.id, i + 1, { x, y, w: cardW, h: cardH }, it.text, CARD_COLORS.radial, it.lvl));
    out.push(
      makeConnector(
        `sa_conn_radial_${i}`,
        cx,
        cy,
        x + cardW / 2,
        y + cardH / 2,
        -40 + i,
      ),
    );
  });
  return out;
}

function layoutStacked(items: LayoutItem[], bbox: Rect): Shape[] {
  const padding = Math.min(16, bbox.w * 0.04);
  const accentW = 6;
  const rowH = (bbox.h - padding * 2) / items.length;
  const out: Shape[] = [];
  let y = bbox.y + padding;
  items.forEach((it, i) => {
    const cardBBox: Rect = {
      x: bbox.x + padding + accentW + 4,
      y,
      w: bbox.w - padding * 2 - accentW - 4,
      h: rowH - 8,
    };
    const scale = i === 0 ? 1 : 0.92;
    const scaled: Rect = {
      x: cardBBox.x,
      y: cardBBox.y + (cardBBox.h * (1 - scale)) / 2,
      w: cardBBox.w * scale,
      h: cardBBox.h * scale,
    };
    out.push({
      id: `sa_${i}_accent_${it.id}`,
      name: `sa|lvl:${it.lvl}`,
      zIndex: i * 10,
      visible: true,
      locked: false,
      opacity: 1,
      kind: "rect",
      bbox: { x: bbox.x + padding, y: scaled.y, w: accentW, h: scaled.h },
      transform: identityTransform(),
      rx: 2,
      ry: 2,
      fill: { kind: "solid", color: CARD_COLORS.stacked.stroke },
    });
    out.push(...makeCard(it.id, i, scaled, it.text, CARD_COLORS.stacked, it.lvl));
    y += rowH;
  });
  return out;
}

function layoutEquation(items: LayoutItem[], bbox: Rect): Shape[] {
  const padding = Math.min(12, bbox.w * 0.03);
  const symW = 28;
  const slots = items.length * 2 - 1;
  const slotW = (bbox.w - padding * 2) / slots;
  const cardH = bbox.h * 0.5;
  const y = bbox.y + (bbox.h - cardH) / 2;
  const out: Shape[] = [];
  let slot = 0;
  items.forEach((it, i) => {
    const cardBBox: Rect = {
      x: bbox.x + padding + slot * slotW,
      y,
      w: slotW * 1.6,
      h: cardH,
    };
    out.push(...makeCard(it.id, i, cardBBox, it.text, CARD_COLORS.equation, it.lvl));
    slot += 2;
    if (i < items.length - 1) {
      const symX = bbox.x + padding + (slot - 1) * slotW + slotW * 0.25;
      out.push({
        id: `sa_sym_${i}`,
        name: i === items.length - 2 ? "Equals" : "Plus",
        zIndex: -5 + i,
        visible: true,
        locked: false,
        opacity: 1,
        kind: "text",
        bbox: { x: symX, y: y + cardH * 0.2, w: symW, h: cardH * 0.6 },
        transform: identityTransform(),
        paragraphs: para(i === items.length - 2 ? "=" : "+"),
        vAlign: "middle",
        wrap: false,
      });
    }
  });
  return out;
}

function layoutHorizontalList(items: LayoutItem[], bbox: Rect): Shape[] {
  const padding = Math.min(12, bbox.w * 0.03);
  const colW = (bbox.w - padding * 2) / items.length;
  const cardH = bbox.h * 0.55;
  const y = bbox.y + (bbox.h - cardH) / 2;
  const out: Shape[] = [];
  items.forEach((it, i) => {
    out.push(
      ...makeCard(
        it.id,
        i,
        { x: bbox.x + padding + i * colW + 4, y, w: colW - 8, h: cardH },
        it.text,
        CARD_COLORS.horizontalList,
        it.lvl,
      ),
    );
  });
  return out;
}

function layoutProcessVertical(items: LayoutItem[], bbox: Rect): Shape[] {
  const padding = Math.min(16, bbox.h * 0.04);
  const rowH = (bbox.h - padding * 2) / items.length;
  const cardW = bbox.w * 0.55;
  const x = bbox.x + (bbox.w - cardW) / 2;
  const out: Shape[] = [];
  const cardBboxes: Rect[] = [];
  items.forEach((it, i) => {
    const cardBBox: Rect = { x, y: bbox.y + padding + i * rowH, w: cardW, h: rowH * 0.78 };
    cardBboxes.push(cardBBox);
    out.push(...makeCard(it.id, i, cardBBox, it.text, CARD_COLORS.processVertical, it.lvl));
  });
  for (let i = 0; i < cardBboxes.length - 1; i++) {
    const a = cardBboxes[i]!;
    const b = cardBboxes[i + 1]!;
    out.push(
      makeConnector(
        `sa_conn_vproc_${i}`,
        a.x + a.w / 2,
        a.y + a.h,
        b.x + b.w / 2,
        b.y,
        -10 + i,
      ),
    );
  }
  return out;
}

function parentIdForItem(items: LayoutItem[], index: number): string | null {
  const lvl = items[index]?.lvl ?? 0;
  if (lvl === 0) return null;
  for (let j = index - 1; j >= 0; j--) {
    if ((items[j]?.lvl ?? 0) === lvl - 1) return items[j]!.id;
  }
  return null;
}

function layoutOrgChart(items: LayoutItem[], bbox: Rect): Shape[] {
  const maxLvl = Math.max(0, ...items.map((it) => it.lvl));
  const byLvl = new Map<number, LayoutItem[]>();
  for (const it of items) {
    const row = byLvl.get(it.lvl) ?? [];
    row.push(it);
    byLvl.set(it.lvl, row);
  }
  const out: Shape[] = [];
  const cardW = Math.min(bbox.w * 0.2, 128);
  const cardH = Math.min(bbox.h * 0.14, 48);
  const rowH = bbox.h / (maxLvl + 1);
  const cardCenters = new Map<string, { x: number; y: number; top: number; bottom: number }>();
  let globalIdx = 0;
  for (let lvl = 0; lvl <= maxLvl; lvl++) {
    const rowItems = byLvl.get(lvl) ?? [];
    const y = bbox.y + lvl * rowH + (rowH - cardH) / 2;
    rowItems.forEach((it, i) => {
      const colW = bbox.w / Math.max(1, rowItems.length);
      const x = bbox.x + i * colW + (colW - cardW) / 2;
      const color = lvl === 0 ? CARD_COLORS.orgChart : CARD_COLORS.orgChartChild;
      out.push(...makeCard(it.id, globalIdx, { x, y, w: cardW, h: cardH }, it.text, color, it.lvl));
      cardCenters.set(it.id, { x: x + cardW / 2, y: y + cardH / 2, top: y, bottom: y + cardH });
      globalIdx += 1;
    });
  }
  items.forEach((it, i) => {
    const parentId = parentIdForItem(items, i);
    if (!parentId) return;
    const parent = cardCenters.get(parentId);
    const child = cardCenters.get(it.id);
    if (!parent || !child) return;
    out.push(
      makeConnector(
        `sa_conn_org_${i}`,
        parent.x,
        parent.bottom,
        child.x,
        child.top,
        -50 + i,
      ),
    );
  });
  return out;
}

function layoutVenn(items: LayoutItem[], bbox: Rect): Shape[] {
  const n = Math.min(3, Math.max(2, items.length));
  const slice = items.slice(0, n);
  const out: Shape[] = [];
  const r = Math.min(bbox.w, bbox.h) * 0.22;
  const centers =
    n === 2
      ? [
          { x: bbox.x + bbox.w * 0.38, y: bbox.y + bbox.h * 0.5, color: CARD_COLORS.venn },
          { x: bbox.x + bbox.w * 0.62, y: bbox.y + bbox.h * 0.5, color: CARD_COLORS.venn2 },
        ]
      : [
          { x: bbox.x + bbox.w * 0.5, y: bbox.y + bbox.h * 0.38, color: CARD_COLORS.venn },
          { x: bbox.x + bbox.w * 0.36, y: bbox.y + bbox.h * 0.62, color: CARD_COLORS.venn2 },
          { x: bbox.x + bbox.w * 0.64, y: bbox.y + bbox.h * 0.62, color: CARD_COLORS.venn3 },
        ];
  centers.forEach((c, i) => {
    const it = slice[i]!;
    out.push({
      id: `sa_${i}_venn_${it.id}`,
      name: `sa|lvl:${it.lvl}`,
      zIndex: i,
      visible: true,
      locked: false,
      opacity: 0.72,
      kind: "ellipse",
      bbox: { x: c.x - r, y: c.y - r, w: r * 2, h: r * 2 },
      transform: identityTransform(),
      fill: { kind: "solid", color: c.color.fill },
      stroke: { paint: { kind: "solid", color: c.color.stroke }, width: 2 },
    });
    const labelW = r * 1.1;
    out.push({
      id: `sa_${i}_text_${it.id}`,
      name: `Item ${i + 1} text`,
      zIndex: 100 + i,
      visible: true,
      locked: false,
      opacity: 1,
      kind: "text",
      bbox: { x: c.x - labelW / 2, y: c.y - r * 0.35, w: labelW, h: r * 0.7 },
      transform: identityTransform(),
      paragraphs: it.text,
      vAlign: "middle",
      wrap: true,
      insets: { l: 6, t: 4, r: 6, b: 4 },
    });
  });
  return out;
}

function layoutTarget(items: LayoutItem[], bbox: Rect): Shape[] {
  if (!items.length) return [];
  const cx = bbox.x + bbox.w / 2;
  const cy = bbox.y + bbox.h / 2;
  const out: Shape[] = [];
  const hub = items[0]!;
  const hubR = Math.min(bbox.w, bbox.h) * 0.12;
  out.push({
    id: `sa_0_ring_hub_${hub.id}`,
    name: "Target hub",
    zIndex: 0,
    visible: true,
    locked: false,
    opacity: 1,
    kind: "ellipse",
    bbox: { x: cx - hubR, y: cy - hubR, w: hubR * 2, h: hubR * 2 },
    transform: identityTransform(),
    fill: { kind: "solid", color: CARD_COLORS.target.stroke },
    stroke: { paint: { kind: "solid", color: "#ffffff" }, width: 2 },
  });
  out.push({
    id: `sa_0_text_${hub.id}`,
    name: "Item 1 text",
    zIndex: 1,
    visible: true,
    locked: false,
    opacity: 1,
    kind: "text",
    bbox: { x: cx - hubR, y: cy - hubR, w: hubR * 2, h: hubR * 2 },
    transform: identityTransform(),
    paragraphs: hub.text,
    vAlign: "middle",
    wrap: true,
    insets: { l: 4, t: 2, r: 4, b: 2 },
  });
  const spokes = items.slice(1);
  const cardW = Math.min(bbox.w * 0.18, 110);
  const cardH = Math.min(bbox.h * 0.12, 44);
  spokes.forEach((it, i) => {
    const ring = 0.28 + (i % 2) * 0.12;
    const angle = -Math.PI / 2 + (i * Math.PI * 2) / Math.max(1, spokes.length);
    const x = cx + Math.cos(angle) * bbox.w * ring - cardW / 2;
    const y = cy + Math.sin(angle) * bbox.h * ring - cardH / 2;
    out.push(
      ...makeCard(it.id, i + 1, { x, y, w: cardW, h: cardH }, it.text, CARD_COLORS.targetRing, it.lvl),
    );
    out.push({
      id: `sa_ring_${i}`,
      name: "Target ring",
      zIndex: -20 - i,
      visible: true,
      locked: false,
      opacity: 0.35,
      kind: "ellipse",
      bbox: {
        x: cx - bbox.w * ring,
        y: cy - bbox.h * ring,
        w: bbox.w * ring * 2,
        h: bbox.h * ring * 2,
      },
      transform: identityTransform(),
      fill: { kind: "none" },
      stroke: { paint: { kind: "solid", color: CARD_COLORS.target.stroke }, width: 1.5, dash: [6, 4] },
    });
  });
  return out;
}

function layoutBlockCycle(items: LayoutItem[], bbox: Rect): Shape[] {
  const cx = bbox.x + bbox.w / 2;
  const cy = bbox.y + bbox.h / 2;
  const r = Math.min(bbox.w, bbox.h) * 0.34;
  const cardW = Math.min(bbox.w * 0.22, 120);
  const cardH = Math.min(bbox.h * 0.14, 52);
  const out: Shape[] = [];
  const centers: Array<{ x: number; y: number }> = [];
  items.forEach((it, i) => {
    const angle = -Math.PI / 2 + (i * Math.PI * 2) / items.length;
    const x = cx + Math.cos(angle) * r - cardW / 2;
    const y = cy + Math.sin(angle) * r - cardH / 2;
    centers.push({ x: x + cardW / 2, y: y + cardH / 2 });
    out.push({
      id: `sa_${i}_bg_${it.id}`,
      name: `sa|lvl:${it.lvl}`,
      zIndex: i * 10,
      visible: true,
      locked: false,
      opacity: 1,
      kind: "rect",
      bbox: { x, y, w: cardW, h: cardH },
      transform: identityTransform(),
      rx: 2,
      ry: 2,
      fill: { kind: "solid", color: CARD_COLORS.blockCycle.fill },
      stroke: { paint: { kind: "solid", color: CARD_COLORS.blockCycle.stroke }, width: 2 },
    });
    out.push({
      id: `sa_${i}_text_${it.id}`,
      name: `Item ${i + 1} text`,
      zIndex: i * 10 + 1,
      visible: true,
      locked: false,
      opacity: 1,
      kind: "text",
      bbox: { x, y, w: cardW, h: cardH },
      transform: identityTransform(),
      paragraphs: it.text,
      vAlign: "middle",
      wrap: true,
      insets: { l: 8, t: 4, r: 8, b: 4 },
    });
  });
  for (let i = 0; i < centers.length; i++) {
    const a = centers[i]!;
    const b = centers[(i + 1) % centers.length]!;
    out.push(makeConnector(`sa_conn_block_${i}`, a.x, a.y, b.x, b.y, -20 + i));
  }
  return out;
}

function layoutPictureAccent(items: LayoutItem[], bbox: Rect): Shape[] {
  const padding = Math.min(14, bbox.h * 0.03);
  const rowH = (bbox.h - padding * 2) / items.length;
  const picW = Math.min(bbox.w * 0.22, 96);
  const out: Shape[] = [];
  let y = bbox.y + padding;
  items.forEach((it, i) => {
    const rowBBox: Rect = {
      x: bbox.x + padding + picW + 8,
      y: y + 4,
      w: bbox.w - padding * 2 - picW - 8,
      h: rowH - 8,
    };
    const picBBox = { x: bbox.x + padding, y: y + 6, w: picW, h: rowH - 12 };
    if (it.imageSrc) {
      out.push({
        id: `sa_${i}_pic_${it.id}`,
        name: `sa|lvl:${it.lvl}`,
        zIndex: i * 10,
        visible: true,
        locked: false,
        opacity: 1,
        kind: "image",
        bbox: picBBox,
        transform: identityTransform(),
        src: it.imageSrc,
      });
    } else {
      out.push({
        id: `sa_${i}_pic_${it.id}`,
        name: `sa|lvl:${it.lvl}`,
        zIndex: i * 10,
        visible: true,
        locked: false,
        opacity: 1,
        kind: "rect",
        bbox: picBBox,
        transform: identityTransform(),
        rx: 4,
        ry: 4,
        fill: { kind: "solid", color: CARD_COLORS.pictureSlot.fill },
        stroke: { paint: { kind: "solid", color: CARD_COLORS.pictureSlot.stroke }, width: 1 },
      });
    }
    out.push(...makeCard(it.id, i, rowBBox, it.text, CARD_COLORS.pictureAccent, it.lvl));
    y += rowH;
  });
  return out;
}

function layoutArrowRibbon(items: LayoutItem[], bbox: Rect): Shape[] {
  const padding = Math.min(16, bbox.w * 0.04);
  const stepX = (bbox.w - padding * 2) / Math.max(1, items.length);
  const stepY = bbox.h * 0.12;
  const cardW = Math.min(stepX * 0.82, 130);
  const cardH = bbox.h * 0.22;
  const baseY = bbox.y + bbox.h - cardH - padding;
  const out: Shape[] = [];
  const cardBboxes: Rect[] = [];
  items.forEach((it, i) => {
    const cardBBox: Rect = {
      x: bbox.x + padding + i * stepX,
      y: baseY - i * stepY,
      w: cardW,
      h: cardH,
    };
    cardBboxes.push(cardBBox);
    out.push(...makeCard(it.id, i, cardBBox, it.text, CARD_COLORS.arrowRibbon, it.lvl));
  });
  for (let i = 0; i < cardBboxes.length - 1; i++) {
    const a = cardBboxes[i]!;
    const b = cardBboxes[i + 1]!;
    out.push(
      makeConnector(
        `sa_conn_ribbon_${i}`,
        a.x + a.w,
        a.y + a.h / 2,
        b.x,
        b.y + b.h / 2,
        -10 + i,
      ),
    );
  }
  return out;
}

function wedgePath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const x0 = cx + Math.cos(a0) * r;
  const y0 = cy + Math.sin(a0) * r;
  const x1 = cx + Math.cos(a1) * r;
  const y1 = cy + Math.sin(a1) * r;
  return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
}

function layoutInvertedPyramid(items: LayoutItem[], bbox: Rect): Shape[] {
  const padding = Math.min(8, bbox.h * 0.02);
  const rowH = (bbox.h - padding * 2) / items.length;
  const out: Shape[] = [];
  items.forEach((it, i) => {
    const widthRatio = 1 - i / Math.max(1, items.length);
    const w = bbox.w * Math.max(0.28, widthRatio);
    const x = bbox.x + (bbox.w - w) / 2;
    const y = bbox.y + padding + i * rowH;
    out.push(...makeCard(it.id, i, { x, y, w, h: rowH - 4 }, it.text, CARD_COLORS.invertedPyramid, it.lvl));
  });
  return out;
}

const PIE_FILLS = ["#dbeafe", "#fef3c7", "#dcfce7", "#fce7f3", "#e0e7ff", "#ffedd5"];
const PIE_STROKES = ["#2563eb", "#d97706", "#15803d", "#db2777", "#4f46e5", "#c2410c"];

function layoutPie(items: LayoutItem[], bbox: Rect): Shape[] {
  const cx = bbox.x + bbox.w / 2;
  const cy = bbox.y + bbox.h / 2;
  const r = Math.min(bbox.w, bbox.h) * 0.36;
  const box: Rect = { x: cx - r, y: cy - r, w: r * 2, h: r * 2 };
  const out: Shape[] = [];
  items.forEach((it, i) => {
    const a0 = -Math.PI / 2 + (i * Math.PI * 2) / items.length;
    const a1 = -Math.PI / 2 + ((i + 1) * Math.PI * 2) / items.length;
    const mid = (a0 + a1) / 2;
    out.push({
      id: `sa_${i}_bg_${it.id}`,
      name: `sa|lvl:${it.lvl}`,
      zIndex: i * 10,
      visible: true,
      locked: false,
      opacity: 1,
      kind: "path",
      bbox: box,
      transform: identityTransform(),
      d: wedgePath(cx, cy, r, a0, a1),
      fillRule: "nonzero",
      fill: { kind: "solid", color: PIE_FILLS[i % PIE_FILLS.length]! },
      stroke: { paint: { kind: "solid", color: PIE_STROKES[i % PIE_STROKES.length]! }, width: 1 },
    });
    const tw = Math.min(88, r * 0.55);
    const th = 32;
    const tx = cx + Math.cos(mid) * r * 0.55 - tw / 2;
    const ty = cy + Math.sin(mid) * r * 0.55 - th / 2;
    out.push({
      id: `sa_${i}_text_${it.id}`,
      name: `Item ${i + 1} text`,
      zIndex: i * 10 + 1,
      visible: true,
      locked: false,
      opacity: 1,
      kind: "text",
      bbox: { x: tx, y: ty, w: tw, h: th },
      transform: identityTransform(),
      paragraphs: it.text,
      vAlign: "middle",
      wrap: true,
      insets: { l: 2, t: 2, r: 2, b: 2 },
    });
  });
  return out;
}

function layoutBalance(items: LayoutItem[], bbox: Rect): Shape[] {
  if (items.length === 1) return layoutList(items, bbox);
  const pad = Math.min(12, bbox.w * 0.03);
  const top = items[0]!;
  const rest = items.slice(1);
  const mid = Math.ceil(rest.length / 2);
  const left = rest.slice(0, mid);
  const right = rest.slice(mid);
  const topH = Math.min(56, bbox.h * 0.22);
  const out: Shape[] = [];
  const topW = Math.min(bbox.w * 0.4, 220);
  out.push(
    ...makeCard(
      top.id,
      0,
      { x: bbox.x + (bbox.w - topW) / 2, y: bbox.y + pad, w: topW, h: topH },
      top.text,
      CARD_COLORS.balance,
      top.lvl,
    ),
  );
  const colTop = bbox.y + pad + topH + 10;
  const colH = Math.max(36, bbox.y + bbox.h - pad - colTop);
  const colW = (bbox.w - pad * 3) / 2;
  const placeCol = (col: LayoutItem[], x: number, startIdx: number): void => {
    if (!col.length) return;
    const rowH = colH / col.length;
    col.forEach((it, i) => {
      out.push(
        ...makeCard(
          it.id,
          startIdx + i,
          { x, y: colTop + i * rowH, w: colW, h: rowH - 6 },
          it.text,
          CARD_COLORS.balance,
          it.lvl,
        ),
      );
    });
  };
  placeCol(left, bbox.x + pad, 1);
  placeCol(right, bbox.x + pad * 2 + colW, 1 + left.length);
  return out;
}

function layoutOpposingArrows(items: LayoutItem[], bbox: Rect): Shape[] {
  const pad = Math.min(10, bbox.w * 0.02);
  const mid = Math.ceil(items.length / 2);
  const left = items.slice(0, mid);
  const right = items.slice(mid);
  const rowH = (bbox.h - pad * 2) / Math.max(left.length, right.length, 1);
  const colW = (bbox.w - pad * 3) / 2;
  const out: Shape[] = [];
  const place = (col: LayoutItem[], x: number, dir: "left" | "right", start: number): void => {
    col.forEach((it, i) => {
      const card: Rect = { x, y: bbox.y + pad + i * rowH, w: colW, h: rowH - 6 };
      const notch = Math.min(card.w * 0.16, 22);
      const d = dir === "right"
        ? chevronPath(card)
        : `M ${card.x + card.w} ${card.y} L ${card.x + notch} ${card.y} L ${card.x} ${card.y + card.h / 2} L ${card.x + notch} ${card.y + card.h} L ${card.x + card.w} ${card.y + card.h} L ${card.x + card.w - notch} ${card.y + card.h / 2} Z`;
      const idx = start + i;
      out.push({
        id: `sa_${idx}_bg_${it.id}`,
        name: `sa|lvl:${it.lvl}`,
        zIndex: idx * 10,
        visible: true,
        locked: false,
        opacity: 1,
        kind: "path",
        bbox: card,
        transform: identityTransform(),
        d,
        fillRule: "nonzero",
        fill: { kind: "solid", color: CARD_COLORS.opposingArrows.fill },
        stroke: { paint: { kind: "solid", color: CARD_COLORS.opposingArrows.stroke }, width: 1 },
      });
      const inset = dir === "right" ? card.w * 0.06 : card.w * 0.14;
      out.push({
        id: `sa_${idx}_text_${it.id}`,
        name: `Item ${idx + 1} text`,
        zIndex: idx * 10 + 1,
        visible: true,
        locked: false,
        opacity: 1,
        kind: "text",
        bbox: { x: card.x + inset, y: card.y, w: card.w * 0.72, h: card.h },
        transform: identityTransform(),
        paragraphs: it.text,
        vAlign: "middle",
        wrap: true,
        insets: { l: 4, t: 4, r: 4, b: 4 },
      });
    });
  };
  place(left, bbox.x + pad, "right", 0);
  place(right, bbox.x + pad * 2 + colW, "left", left.length);
  return out;
}

function layoutGear(items: LayoutItem[], bbox: Rect): Shape[] {
  const cx = bbox.x + bbox.w / 2;
  const cy = bbox.y + bbox.h / 2;
  const hub = items[0]!;
  const rest = items.slice(1);
  const hubR = Math.min(bbox.w, bbox.h) * 0.16;
  const orbit = Math.min(bbox.w, bbox.h) * 0.34;
  const sat = Math.min(bbox.w, bbox.h) * 0.1;
  const out: Shape[] = [];
  out.push({
    id: `sa_0_bg_${hub.id}`,
    name: `sa|lvl:${hub.lvl}`,
    zIndex: 0,
    visible: true,
    locked: false,
    opacity: 1,
    kind: "ellipse",
    bbox: { x: cx - hubR, y: cy - hubR, w: hubR * 2, h: hubR * 2 },
    transform: identityTransform(),
    fill: { kind: "solid", color: CARD_COLORS.gear.fill },
    stroke: { paint: { kind: "solid", color: CARD_COLORS.gear.stroke }, width: 1 },
  });
  out.push({
    id: `sa_0_text_${hub.id}`,
    name: "Item 1 text",
    zIndex: 1,
    visible: true,
    locked: false,
    opacity: 1,
    kind: "text",
    bbox: { x: cx - hubR, y: cy - hubR, w: hubR * 2, h: hubR * 2 },
    transform: identityTransform(),
    paragraphs: hub.text,
    vAlign: "middle",
    wrap: true,
    insets: { l: 4, t: 4, r: 4, b: 4 },
  });
  rest.forEach((it, i) => {
    const angle = -Math.PI / 2 + (i * Math.PI * 2) / Math.max(1, rest.length);
    const sx = cx + Math.cos(angle) * orbit;
    const sy = cy + Math.sin(angle) * orbit;
    const idx = i + 1;
    out.push({
      id: `sa_${idx}_bg_${it.id}`,
      name: `sa|lvl:${it.lvl}`,
      zIndex: idx * 10,
      visible: true,
      locked: false,
      opacity: 1,
      kind: "ellipse",
      bbox: { x: sx - sat, y: sy - sat, w: sat * 2, h: sat * 2 },
      transform: identityTransform(),
      fill: { kind: "solid", color: "#eef2ff" },
      stroke: { paint: { kind: "solid", color: CARD_COLORS.gear.stroke }, width: 1 },
    });
    out.push({
      id: `sa_${idx}_text_${it.id}`,
      name: `Item ${idx + 1} text`,
      zIndex: idx * 10 + 1,
      visible: true,
      locked: false,
      opacity: 1,
      kind: "text",
      bbox: { x: sx - sat, y: sy - sat, w: sat * 2, h: sat * 2 },
      transform: identityTransform(),
      paragraphs: it.text,
      vAlign: "middle",
      wrap: true,
      insets: { l: 2, t: 2, r: 2, b: 2 },
    });
  });
  return out;
}

function layoutHorizontalHierarchy(items: LayoutItem[], bbox: Rect): Shape[] {
  const maxLvl = Math.max(0, ...items.map((it) => it.lvl));
  const byLvl = new Map<number, LayoutItem[]>();
  for (const it of items) {
    const col = byLvl.get(it.lvl) ?? [];
    col.push(it);
    byLvl.set(it.lvl, col);
  }
  const out: Shape[] = [];
  const colW = bbox.w / (maxLvl + 1);
  const cardW = Math.max(72, Math.min(colW * 0.82, 220));
  let globalIdx = 0;
  const centers = new Map<string, { x: number; y: number; right: number }>();
  for (let lvl = 0; lvl <= maxLvl; lvl++) {
    const colItems = byLvl.get(lvl) ?? [];
    const rowH = bbox.h / Math.max(1, colItems.length);
    const cardH = Math.max(40, Math.min(rowH * 0.7, 90));
    const x = bbox.x + lvl * colW + (colW - cardW) / 2;
    colItems.forEach((it, i) => {
      const y = bbox.y + i * rowH + (rowH - cardH) / 2;
      const color = lvl === 0 ? CARD_COLORS.horizontalHierarchy : CARD_COLORS.hierarchyChild;
      out.push(...makeCard(it.id, globalIdx, { x, y, w: cardW, h: cardH }, it.text, color, it.lvl));
      centers.set(it.id, { x: x + cardW, y: y + cardH / 2, right: x });
      globalIdx += 1;
    });
  }
  const roots = byLvl.get(0) ?? [];
  if (roots.length === 1) {
    const root = centers.get(roots[0]!.id);
    items.filter((it) => it.lvl > 0).forEach((ch, i) => {
      const c = centers.get(ch.id);
      if (!root || !c) return;
      out.push(makeConnector(`sa_conn_hhier_${i}`, root.x, root.y, c.right, c.y, -20 + i));
    });
  }
  return out;
}

function layoutConverging(items: LayoutItem[], bbox: Rect): Shape[] {
  if (items.length < 2) return layoutList(items, bbox);
  const target = items[items.length - 1]!;
  const sources = items.slice(0, -1);
  const pad = Math.min(12, bbox.w * 0.03);
  const targetW = Math.min(bbox.w * 0.32, 200);
  const targetH = Math.min(bbox.h * 0.28, 80);
  const tx = bbox.x + bbox.w - pad - targetW;
  const ty = bbox.y + (bbox.h - targetH) / 2;
  const out: Shape[] = [];
  const rowH = (bbox.h - pad * 2) / sources.length;
  const srcW = Math.max(80, tx - bbox.x - pad * 2);
  sources.forEach((it, i) => {
    const y = bbox.y + pad + i * rowH;
    const card: Rect = { x: bbox.x + pad, y, w: srcW, h: rowH - 6 };
    out.push(...makeCard(it.id, i, card, it.text, CARD_COLORS.converging, it.lvl));
    out.push(
      makeConnector(
        `sa_conn_conv_${i}`,
        card.x + card.w,
        card.y + card.h / 2,
        tx,
        ty + targetH / 2,
        -10 + i,
      ),
    );
  });
  out.push(
    ...makeCard(target.id, sources.length, { x: tx, y: ty, w: targetW, h: targetH }, target.text, CARD_COLORS.radialHub, target.lvl),
  );
  return out;
}

function layoutAlternating(items: LayoutItem[], bbox: Rect): Shape[] {
  const padding = Math.min(16, bbox.w * 0.04);
  const colW = (bbox.w - padding * 2) / items.length;
  const cardH = bbox.h * 0.34;
  const out: Shape[] = [];
  const cards: Rect[] = [];
  items.forEach((it, i) => {
    const top = i % 2 === 0;
    const cardBBox: Rect = {
      x: bbox.x + padding + i * colW,
      y: bbox.y + (top ? bbox.h * 0.08 : bbox.h * 0.56),
      w: colW * 0.86,
      h: cardH,
    };
    cards.push(cardBBox);
    out.push(...makeCard(it.id, i, cardBBox, it.text, CARD_COLORS.alternating, it.lvl));
  });
  for (let i = 0; i < cards.length - 1; i++) {
    const a = cards[i]!;
    const b = cards[i + 1]!;
    const fromTop = i % 2 === 0;
    out.push(
      makeConnector(
        `sa_conn_alt_${i}`,
        a.x + a.w,
        fromTop ? a.y + a.h : a.y + a.h / 2,
        b.x,
        fromTop ? b.y : b.y + b.h / 2,
        -10 + i,
      ),
    );
  }
  return out;
}

function hexPath(b: Rect): string {
  const inset = Math.min(b.w * 0.16, 28);
  return `M ${b.x + inset} ${b.y} L ${b.x + b.w - inset} ${b.y} L ${b.x + b.w} ${b.y + b.h / 2} L ${b.x + b.w - inset} ${b.y + b.h} L ${b.x + inset} ${b.y + b.h} L ${b.x} ${b.y + b.h / 2} Z`;
}

function layoutHexagon(items: LayoutItem[], bbox: Rect): Shape[] {
  const padding = Math.min(12, bbox.w * 0.03);
  const colW = (bbox.w - padding * 2) / items.length;
  const h = Math.min(bbox.h * 0.46, colW * 0.92);
  const y = bbox.y + (bbox.h - h) / 2;
  const out: Shape[] = [];
  items.forEach((it, i) => {
    const card: Rect = {
      x: bbox.x + padding + i * colW,
      y,
      w: colW * 0.96,
      h,
    };
    out.push({
      id: `sa_${i}_bg_${it.id}`,
      name: `sa|lvl:${it.lvl}`,
      zIndex: i * 10,
      visible: true,
      locked: false,
      opacity: 1,
      kind: "path",
      bbox: card,
      transform: identityTransform(),
      d: hexPath(card),
      fillRule: "nonzero",
      fill: { kind: "solid", color: CARD_COLORS.hexagon.fill },
      stroke: { paint: { kind: "solid", color: CARD_COLORS.hexagon.stroke }, width: 1 },
    });
    out.push({
      id: `sa_${i}_text_${it.id}`,
      name: `Item ${i + 1} text`,
      zIndex: i * 10 + 1,
      visible: true,
      locked: false,
      opacity: 1,
      kind: "text",
      bbox: { x: card.x + card.w * 0.16, y: card.y, w: card.w * 0.68, h: card.h },
      transform: identityTransform(),
      paragraphs: it.text,
      vAlign: "middle",
      wrap: true,
      insets: { l: 4, t: 4, r: 4, b: 4 },
    });
  });
  return out;
}

function layoutPictureCaption(items: LayoutItem[], bbox: Rect): Shape[] {
  const padding = Math.min(12, bbox.w * 0.03);
  const colW = (bbox.w - padding * 2) / items.length;
  const out: Shape[] = [];
  items.forEach((it, i) => {
    const x = bbox.x + padding + i * colW;
    const picH = bbox.h * 0.52;
    const picBBox = { x, y: bbox.y + padding, w: colW * 0.9, h: picH };
    if (it.imageSrc) {
      out.push({
        id: `sa_${i}_pic_${it.id}`,
        name: `sa|lvl:${it.lvl}`,
        zIndex: i * 10,
        visible: true,
        locked: false,
        opacity: 1,
        kind: "image",
        bbox: picBBox,
        transform: identityTransform(),
        src: it.imageSrc,
      });
    } else {
      out.push({
        id: `sa_${i}_pic_${it.id}`,
        name: `sa|lvl:${it.lvl}`,
        zIndex: i * 10,
        visible: true,
        locked: false,
        opacity: 1,
        kind: "rect",
        bbox: picBBox,
        transform: identityTransform(),
        rx: 4,
        ry: 4,
        fill: { kind: "solid", color: CARD_COLORS.pictureSlot.fill },
        stroke: { paint: { kind: "solid", color: CARD_COLORS.pictureSlot.stroke }, width: 1 },
      });
    }
    const textBox: Rect = {
      x,
      y: bbox.y + padding + picH + 8,
      w: colW * 0.9,
      h: Math.max(28, bbox.h - picH - padding * 2 - 8),
    };
    out.push(...makeCard(it.id, i, textBox, it.text, CARD_COLORS.pictureCaption, it.lvl));
  });
  return out;
}

/** 按布局把 SmartArt 项展开为 rect+text 子形状（绝对 bbox，相对 slide）。 */
export function buildSmartArtShapes(
  layout: SmartArtLayoutKind,
  items: SmartArtItem[],
  bbox: Rect,
): Shape[] {
  if (!items.length) return [];
  const parsed = toLayoutItems(items);
  switch (layout) {
    case "horizontalList":
      return layoutHorizontalList(parsed, bbox);
    case "processVertical":
      return layoutProcessVertical(parsed, bbox);
    case "orgChart":
      return layoutOrgChart(parsed, bbox);
    case "venn":
      return layoutVenn(parsed, bbox);
    case "target":
      return layoutTarget(parsed, bbox);
    case "blockCycle":
      return layoutBlockCycle(parsed, bbox);
    case "pictureAccent":
      return layoutPictureAccent(parsed, bbox);
    case "arrowRibbon":
      return layoutArrowRibbon(parsed, bbox);
    case "cycle":
      return layoutCycle(parsed, bbox);
    case "pyramid":
      return layoutPyramid(parsed, bbox);
    case "funnel":
      return layoutFunnel(parsed, bbox);
    case "hierarchy":
      return layoutHierarchy(parsed, bbox);
    case "matrix":
      return layoutMatrix(parsed, bbox);
    case "process":
      return layoutProcess(parsed, bbox);
    case "chevron":
      return layoutChevron(parsed, bbox);
    case "timeline":
      return layoutTimeline(parsed, bbox);
    case "radial":
      return layoutRadial(parsed, bbox);
    case "stacked":
      return layoutStacked(parsed, bbox);
    case "equation":
      return layoutEquation(parsed, bbox);
    case "invertedPyramid":
      return layoutInvertedPyramid(parsed, bbox);
    case "pie":
      return layoutPie(parsed, bbox);
    case "balance":
      return layoutBalance(parsed, bbox);
    case "opposingArrows":
      return layoutOpposingArrows(parsed, bbox);
    case "gear":
      return layoutGear(parsed, bbox);
    case "horizontalHierarchy":
      return layoutHorizontalHierarchy(parsed, bbox);
    case "converging":
      return layoutConverging(parsed, bbox);
    case "alternating":
      return layoutAlternating(parsed, bbox);
    case "hexagon":
      return layoutHexagon(parsed, bbox);
    case "pictureCaption":
      return layoutPictureCaption(parsed, bbox);
  }
  return layoutList(parsed, bbox);
}

function textFromShape(sh: Shape): string {
  if (sh.kind !== "text") return "";
  return sh.paragraphs
    .map((p) => p.runs.map((r) => r.text).join(""))
    .join("\n")
    .trim();
}

function parseItemIndex(id: string): number {
  const m = id.match(/^sa_(\d+)_/);
  return m ? Number(m[1]) : 0;
}

function parseItemId(id: string): string {
  const m = id.match(/^sa_\d+_text_(.+)$/);
  return m?.[1] ?? id;
}

function parseLvlFromBg(children: Shape[], idx: number, itemId: string): number {
  const bg = children.find((c) => c.id === `sa_${idx}_bg_${itemId}`);
  const m = bg?.name?.match(/lvl:(\d+)/);
  return m ? Number(m[1]) : 0;
}

/** 从 SmartArt group 子形状提取当前条目（保留 id / lvl / 文本）。 */
export function extractSmartArtItems(group: { children: Shape[] }): SmartArtItem[] {
  const texts = group.children
    .filter((c) => c.kind === "text" && /^sa_\d+_text_/i.test(c.id))
    .sort((a, b) => parseItemIndex(a.id) - parseItemIndex(b.id));
  if (texts.length) {
    return texts.map((t) => {
      const idx = parseItemIndex(t.id);
      const itemId = parseItemId(t.id);
      const pic = group.children.find((c) => c.id === `sa_${idx}_pic_${itemId}`);
      return {
        id: itemId,
        text: textFromShape(t) || `Item ${idx + 1}`,
        lvl: parseLvlFromBg(group.children, idx, itemId),
        imageSrc: pic?.kind === "image" ? pic.src : undefined,
      };
    });
  }
  return group.children
    .filter((c) => c.kind === "text")
    .map((t, i) => ({
      id: t.id || `item_${i}`,
      text: textFromShape(t) || `Item ${i + 1}`,
      lvl: 0,
    }));
}

export function rebuildSmartArtChildren(
  group: { bbox: Rect; children: Shape[]; smartArtMeta?: SmartArtMeta },
  items: SmartArtItem[],
  layout?: SmartArtLayoutKind,
): void {
  const lay = layout ?? group.smartArtMeta?.layout ?? "list";
  group.children = buildSmartArtShapes(lay, items, group.bbox);
}

/** Whether the layout has per-item accent image slots. */
export function smartArtLayoutSupportsPictures(layout: SmartArtLayoutKind): boolean {
  return layout === "pictureAccent" || layout === "pictureCaption";
}

/** One line per SmartArt item (bulk text pane). */
export function serializeSmartArtItemsText(items: SmartArtItem[]): string {
  return items.map((it) => it.text).join("\n");
}

/**
 * Parse bulk text pane lines into items, preserving ids / levels / images when possible.
 */
export function parseSmartArtItemLines(text: string, seedItems: SmartArtItem[] = []): SmartArtItem[] {
  const lines = text.split(/\r?\n/);
  if (!lines.length) return [];
  return lines.map((line, i) => {
    const prev = seedItems[i];
    const trimmed = line.trim();
    if (!prev) {
      return { id: `item_${i}`, text: trimmed || `Item ${i + 1}` };
    }
    return {
      ...prev,
      text: trimmed || prev.text || `Item ${i + 1}`,
    };
  });
}
