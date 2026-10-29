// 统一的 round-trip "解析期基线（origin）" + "命令脏标记（dirty）" 设施。
//
// 背景：导出走 surgical patch（writePptxRoundTrip），需要判断"某字段用户是否真的改过"，
// 才能决定是写回还是保留原始字节（含 schemeClr 引用 / 继承默认值 / 动画压成 0 的 opacity 等）。
//
// 旧实现把这份"解析期基线"散成 7 处非可枚举属性（__fillSnapshot / __strokeSnapshot /
// __srcSnapshot / __opacitySnapshot / __explicitRPr / bgSnapshot / themeSnapshot），每加一种
// 可编辑字段就要写一条 patch 路径 + 一个快照 + 一套"继承 vs 编辑"判定，极易出 bug。
//
// 这里收敛成两件东西，统一挂在对象上（均为非可枚举，不进 JSON.stringify / structuredClone）：
//   - __origin：解析期"已解析值"基线（ShapeOrigin / RunOrigin）。serializer 用 `模型值 != origin`
//     反推"改没改"。缓存恢复 / structuredClone 会丢失它 → 此时按"present = dirty"更激进写（正确性优先）。
//   - __dirty：命令侧精确脏标记（DirtyField 集合）。EditCommand.apply 改字段时登记。
//
// round-trip 的最终脏判定 = 命令标记(__dirty) OR (模型值 != origin)。两者是 OR：
//   - 命令明确知道改了什么时（如 group 内子坐标，origin diff 无法消歧）→ 标记精确生效；
//   - 没标记 / 缓存恢复丢标记时 → 回落到 origin diff，鲁棒不漏。
//
// 关键不变量：**纯解析 / 加载不产生任何 __dirty 标记** → 未编辑的 open→save 字节级幂等保持。
import type { Paint, Stroke } from "./paint";
import type { ChartDef } from "./shape";

// 解析时记录的"显式 rPr 字段快照" —— 只含 raw rPr 上确实写了的子项 / 属性，不含继承推导值。
// 从 parser 上提到 core，使 parser / serializer 都依赖 core 的单一定义（保持单向依赖 parser ← core）。
export interface ExplicitRPrSnapshot {
  /**
   * 解析期 run 上的超链接（raw rPr 里确有 `<a:hlinkClick>` / `<a:hlinkHover>` 时才有）。
   * serializer 用它区分「原本就带链接、没被编辑」与「用户新加 / 改了链接」：
   * 前者必须保留原始 `r:id` 字节，否则每次保存都会重登记一条关系、并把作者显式
   * 的 `<a:srgbClr>` 覆写成主题 hlink 色。
   */
  hyperlink?: { kind: string; target?: string; sound?: boolean; highlightClick?: boolean; endSnd?: boolean };
  hoverLink?: { kind: string; target?: string; sound?: boolean; highlightClick?: boolean; endSnd?: boolean };
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  italic?: boolean;
  // 与 TextRun.underline 同形态（mapUnderline 归一化结果）：已知样式为字符串
  // （"single"/"double"/...），未知 OOXML 枚举（如 "heavy"）归一成 boolean true。
  // 必须与运行时字段**同类型**存储，serializer 的严格等值比较才不会把
  // `true !== "true"` 误判成"用户编辑过"。
  underline?: string | boolean;
  color?: string;
  /** raw rPr 上显式 `<a:ln>` 的指纹；缺省表示原 XML 没有文字描边。 */
  textOutline?: { width: number; color?: string };
  /** raw rPr 上显式 `<a:effectLst>` 的指纹。 */
  effects?: Array<{ kind: string; color?: string }>;
  strikethrough?: "single" | "double";
  letterSpacing?: number;
  highlight?: string;
  caps?: "none" | "small" | "all";
}

// group 子坐标系仿射：ECMA-376 §20.1.7.5 grpSpPr/xfrm 的 off/ext + chOff/chExt 归一成
// "子 local 坐标 → slide 绝对坐标" abs = off + local * scale（off 已吸收 chOff*scale，
// scale = ext/chExt）。与 parser readGroupFrame / readXfrm 的正向公式完全对偶。
//
// round-trip 把"被编辑过的 group 子 shape"的 slide 绝对 bbox 反算回 group 局部坐标：
//   local = (abs - off) / scale，  localExt = absExt / scale
// 然后写回子 shape 的 <a:xfrm>。单位为 px（与模型 bbox 同坐标），writer 再转 EMU。
//
// 注意：这份 frame 由 serializer 直接从**原始 grpSp 的 raw xfrm 字节**实时推导（见
// pptx-roundtrip readRawGroupFrame），而非挂在模型 origin 上 —— 因为 applyInheritance /
// structuredClone 会丢非可枚举属性，origin 上的 frame 活不过解析期。
export interface GroupFrameOrigin {
  offX: number;
  offY: number;
  scaleX: number;
  scaleY: number;
}

// 单个 shape 的解析期基线（已解析值，用于 round-trip "改没改"对比）。
// 注意语义：字段为 undefined 与"整个 origin 不存在"在 serializer 侧按相同口径处理
// （都视作"该字段无基线"），与旧 readSnapshot 行为保持一致。
export interface ShapeOrigin {
  fill?: Paint;
  stroke?: Stroke;
  src?: string;
  // 解析期 OOXML 实际表达的 alpha（geom/text/group 默认 1；image 上有 alphaModFix 时为其值）。
  opacity?: number;
  // 解析期（含继承解析后）的 slide 绝对 bbox。用于 round-trip 判断"位置/尺寸改没改"，
  // 尤其是**占位符**这类 raw 上没有显式 <a:xfrm>、几何完全继承自 layout/master 的 shape。
  bbox?: { x: number; y: number; w: number; h: number };
  // 解析期 chart.def 深拷贝 —— SetChartDefCmd 后用于判断 chart 部件是否需重写。
  chart?: ChartDef;
  // 解析期 sp3d/scene3d 深拷贝 —— SetShape3DCmd 后用于判断 3D 节点是否需重写。
  meta3D?: import("./three-d").Sp3DInfo;
  /**
   * 解析期 effectLst 深拷贝 —— SetShapeEffectsCmd 后用于判断 `<a:effectLst>` 是否需重写。
   *
   * 必需，因为 `shape.effects` 里混着两种来源：raw `<a:spPr>/<a:effectLst>` 里显式写的，
   * 和从 `<p:style>/<a:effectRef>` 解析出来的**主题继承**效果。没有基线就无法区分，
   * 会把继承来的阴影烘焙进 spPr（切主题时不再跟随），或反过来把显式阴影整段删掉。
   */
  effects?: import("./shape").ShapeEffect[];
}

export interface RunOrigin {
  explicitRPr?: ExplicitRPrSnapshot;
}

export type OriginRecord = ShapeOrigin & RunOrigin;

// 命令侧脏字段枚举。新增可编辑字段时在这里加一项，并在对应 EditCommand.apply 里 markDirty。
export type DirtyField =
  | "bbox"
  | "transform"
  | "opacity"
  | "visible"
  | "fill"
  | "stroke"
  | "text"
  | "textStyle"
  | "paragraph"
  | "background"
  | "src"
  | "name"
  | "chart"
  | "meta3D"
  | "effects";

const ORIGIN_KEY = "__origin";
const DIRTY_KEY = "__dirty";

function defineHidden(obj: object, key: string, value: unknown): void {
  Object.defineProperty(obj, key, {
    value,
    enumerable: false,
    configurable: true,
    writable: true,
  });
}

// 读取 shape / run 的 origin 基线。无则 undefined（from-scratch / 缓存恢复后）。
export function getOrigin<T extends OriginRecord = OriginRecord>(obj: unknown): T | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  return (obj as Record<string, unknown>)[ORIGIN_KEY] as T | undefined;
}

// 合并写入 origin（非可枚举）。多次调用会浅合并（fill / stroke / opacity / ... 互不覆盖）。
export function setOrigin(obj: object, patch: Partial<OriginRecord>): void {
  const cur = (obj as Record<string, unknown>)[ORIGIN_KEY] as Record<string, unknown> | undefined;
  defineHidden(obj, ORIGIN_KEY, { ...(cur ?? {}), ...patch });
}

// 把 source 上的 origin 整体拷到 target（用于继承 / fontRef 合并等会丢非可枚举字段的 spread 场景）。
export function preserveOrigin<T extends object>(target: T, source: unknown): T {
  const o = getOrigin(source);
  if (o !== undefined) defineHidden(target, ORIGIN_KEY, o);
  return target;
}

// 标记某对象（shape / slide）的字段被命令改过。
export function markDirty(obj: object, field: DirtyField): void {
  let set = (obj as Record<string, unknown>)[DIRTY_KEY] as Set<DirtyField> | undefined;
  if (!(set instanceof Set)) {
    set = new Set<DirtyField>();
    defineHidden(obj, DIRTY_KEY, set);
  }
  set.add(field);
}

export function getDirty(obj: unknown): Set<DirtyField> | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const set = (obj as Record<string, unknown>)[DIRTY_KEY];
  return set instanceof Set ? (set as Set<DirtyField>) : undefined;
}

export function isDirty(obj: unknown, field: DirtyField): boolean {
  const set = getDirty(obj);
  return set ? set.has(field) : false;
}

export function clearDirty(obj: object, field?: DirtyField): void {
  const set = getDirty(obj);
  if (!set) return;
  if (field === undefined) set.clear();
  else set.delete(field);
}
