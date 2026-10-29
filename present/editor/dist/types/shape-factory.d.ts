import type { ChartDef, ChartShape, GroupShape, LineShape, Paint, Rect, Shape, ShapeStyleRefs, Stroke, TextShape } from "@sliiu/present-core";
export declare function genShapeId(prefix?: string): string;
/** Office「插入形状」默认 `<p:style>`：导出后换主题时描边/填充仍跟 accent1。 */
export declare function officeInsertStyleRefs(role?: "shape" | "line" | "text"): ShapeStyleRefs;
export interface BaseOpts {
    id?: string;
    idPrefix?: string;
    name?: string;
    opacity?: number;
    rotation?: number;
    /** false = 不写 p:style（表格 / 图表 graphicFrame 无此元素）。 */
    themeStyle?: "shape" | "line" | "text" | false;
}
export interface CreateShapeOptions extends BaseOpts {
    fill?: Paint;
    stroke?: Stroke;
    /** 若 preset 解出来是 text 形状（目前只有"text"会走 createTextBox，但 path 等不支持）。 */
    text?: string;
}
/**
 * 从 SHAPE_LIBRARY 预设（rect / ellipse / triangle / star / pentagon / hexagon /
 * rightArrow / chevron / flowChartDecision / lightningBolt / cloudCallout / ...）
 * 生成一个 Shape。fill / stroke / opacity / rotation 可覆盖默认值。
 *
 * 返回 null 仅当 presetId 既不是已知简写也不在 SHAPE_LIBRARY 时 —— 调用方
 * 需要兜底为普通 rect 或返回错误给上游。
 */
export declare function createShapeFromPreset(presetId: string, bbox: Rect, opts?: CreateShapeOptions): Shape;
export declare function officialPresetId(libraryId: string): string;
/** 按当前 bbox + presetType + presetAdj 重算 PathShape.d（resize / 调整锚点共用）。 */
export declare function applyOfficialPresetGeometry(s: {
    bbox: Rect;
    presetType?: string;
    presetAdj?: Record<string, number>;
    d: string;
    fillRule?: "nonzero" | "evenodd";
}): boolean;
export interface CreateTextBoxOptions extends BaseOpts {
    text: string;
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: number;
    italic?: boolean;
    color?: string;
    align?: "start" | "middle" | "end" | "justify";
    vAlign?: "top" | "middle" | "bottom";
    fill?: Paint;
    stroke?: Stroke;
    wrap?: boolean;
}
/**
 * 创建一个独立的文本框（OOXML txBox=1）。
 *
 * 与 SHAPE_LIBRARY 的"text"快捷分支区分：这个版本接受多行文本（按 \n 拆段），
 * 并允许设定字号 / 字色 / 对齐，让 AI 一次性插一段带格式的文本。
 */
export declare function createTextBox(bbox: Rect, opts: CreateTextBoxOptions): TextShape;
export interface CreateLineOptions extends BaseOpts {
    /** 起点（slide 坐标）。 */
    x1: number;
    y1: number;
    /** 终点（slide 坐标）。 */
    x2: number;
    y2: number;
    color?: string;
    width?: number;
    dashPreset?: import("@sliiu/present-core").StrokeDashPreset;
    headArrow?: "none" | "triangle" | "stealth" | "diamond" | "oval" | "arrow";
    tailArrow?: "none" | "triangle" | "stealth" | "diamond" | "oval" | "arrow";
    stroke?: Stroke;
}
export declare function createLine(opts: CreateLineOptions): LineShape;
export interface CreateTableOptions extends BaseOpts {
    rows: number;
    cols: number;
    bbox: Rect;
    /** 二维数据；缺省单元格留空。headerRow=true 时第一行视为表头。 */
    data?: string[][];
    headerRow?: boolean;
    headerFill?: string;
    headerColor?: string;
    cellFill?: string;
    cellColor?: string;
    borderColor?: string;
    fontFamily?: string;
    fontSize?: number;
}
export interface CreateChartOptions extends BaseOpts {
    bbox: Rect;
    chart: ChartDef;
}
/**
 * 创建一个 ChartShape。chart 字段直接是 OOXML §21.2.2 的内存等价物：
 *   - type: bar/column/line/pie/doughnut/area/scatter（核心 5 类）+ chartEx 类型
 *   - series: 各序列名称 + 数值数组
 *   - categories: X 轴类别（line/bar/area/column）或饼图扇区标签
 *   - colors / legend / showValues / title / axes / dataLabels: 视觉配置
 *
 * AI / 调用方负责保证 series.values.length === categories.length（除 scatter
 * 用 points 二维数组外）；不一致时渲染层会按 min(values.length, categories.length)
 * 截断绘制。
 */
export declare function createChart(opts: CreateChartOptions): ChartShape;
export declare function createTable(opts: CreateTableOptions): GroupShape;
