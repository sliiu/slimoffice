// AI 表格工具集。
//
// 表格模型：editor 里表格是「带 tableMeta 的 group」，children 按 r*cols + c 排列；
// 每个 cell 是一个 TextShape。本文件覆盖：
//   - 创建新表（带 header / 数据）→ 走 createTable + AddShapeCmd
//   - 行/列增删 → 走 editor 已实现的 InsertTableRow/ColumnCmd & Remove*Cmd
//
// 所有 mutation 都走 rt.apply，自动 undo。

import { z } from "zod";
import {
  AddShapeCmd,
  InsertTableColumnCmd,
  InsertTableRowCmd,
  MergeTableCellsCmd,
  RemoveTableColumnCmd,
  RemoveTableRowCmd,
  SetTableCellStyleCmd,
  UnmergeTableCellsCmd,
  createTable,
} from "@ppt/editor/commands";
import { defineTool, ok, err } from "../types";

const colorRe = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const colorSchema = z.string().regex(colorRe);

export const tableTools = [
  // --- 创建新表 ---

  defineTool({
    name: "insertTable",
    description: [
      "Insert a NEW table (group of N×M text cells, with tableMeta) on a slide.",
      "Use this when the user asks for tabular data and there isn't already a `kind=\"table\"` layout slide doing the job.",
      "Tips:",
      "  - Provide `data` (string[][], rows[cols]) to pre-fill cells; missing cells default to empty.",
      "  - `headerRow=true` (default) styles the first row as a header (dark fill + white bold text).",
      "  - bbox defaults to a centered ~70% × 50% area if omitted; pass an explicit bbox for tighter layouts.",
    ].join(" "),
    inputSchema: z.object({
      slideIdx: z.number().int().min(0),
      rows: z.number().int().min(1).max(40),
      cols: z.number().int().min(1).max(12),
      data: z
        .array(z.array(z.string()))
        .max(40)
        .optional()
        .describe("Row-major 2D array of cell text. Missing cells become empty."),
      bbox: z
        .object({
          x: z.number(),
          y: z.number(),
          w: z.number().min(50),
          h: z.number().min(50),
        })
        .optional(),
      headerRow: z.boolean().optional(),
      headerFill: colorSchema.optional(),
      headerColor: colorSchema.optional(),
      cellFill: colorSchema.optional(),
      cellColor: colorSchema.optional(),
      borderColor: colorSchema.optional(),
      fontFamily: z.string().optional(),
      fontSize: z.number().min(6).max(48).optional(),
      name: z.string().max(60).optional(),
    }),
    tags: ["mutate", "table"],
    execute: async (rt, { slideIdx, bbox, ...opts }) => {
      const pres = rt.getPres();
      const slide = pres.slides[slideIdx];
      if (!slide) return err(`slideIdx ${slideIdx} out of range`);
      const finalBbox = bbox ?? {
        x: pres.size.width * 0.15,
        y: pres.size.height * 0.25,
        w: pres.size.width * 0.7,
        h: pres.size.height * 0.5,
      };
      try {
        const shape = createTable({ ...opts, bbox: finalBbox });
        const res = rt.apply(new AddShapeCmd(slideIdx, 0, shape));
        if (!res.ok) return res;
        return ok({ slideIdx, shapeId: shape.id, rows: opts.rows, cols: opts.cols });
      } catch (e) {
        return err((e as Error).message);
      }
    },
  }),

  // --- 行操作 ---

  defineTool({
    name: "insertTableRow",
    description: "Insert a new row into an existing table group. afterRow=-1 inserts at the top; afterRow=rows-1 appends. New cells reuse the styling from the reference row.",
    inputSchema: z.object({
      slideIdx: z.number().int().min(0),
      tableShapeId: z.string().describe("Id of the table group (the group shape, not a cell)."),
      afterRow: z
        .number()
        .int()
        .min(-1)
        .describe("Insert after this row index (0-based). -1 = insert at the top."),
    }),
    tags: ["mutate", "table"],
    shapeScoped: true,
    execute: async (rt, { slideIdx, tableShapeId, afterRow }) =>
      rt.apply(new InsertTableRowCmd(slideIdx, tableShapeId, afterRow)),
  }),

  defineTool({
    name: "removeTableRow",
    description: "Delete a row from a table group. Refuses if the table only has 1 row.",
    inputSchema: z.object({
      slideIdx: z.number().int().min(0),
      tableShapeId: z.string(),
      rowIdx: z.number().int().min(0),
    }),
    tags: ["mutate", "table"],
    shapeScoped: true,
    execute: async (rt, { slideIdx, tableShapeId, rowIdx }) =>
      rt.apply(new RemoveTableRowCmd(slideIdx, tableShapeId, rowIdx)),
  }),

  // --- 列操作 ---

  defineTool({
    name: "insertTableColumn",
    description: "Insert a new column into an existing table group. afterCol=-1 inserts at the left; afterCol=cols-1 appends.",
    inputSchema: z.object({
      slideIdx: z.number().int().min(0),
      tableShapeId: z.string(),
      afterCol: z.number().int().min(-1),
    }),
    tags: ["mutate", "table"],
    shapeScoped: true,
    execute: async (rt, { slideIdx, tableShapeId, afterCol }) =>
      rt.apply(new InsertTableColumnCmd(slideIdx, tableShapeId, afterCol)),
  }),

  defineTool({
    name: "removeTableColumn",
    description: "Delete a column from a table group. Refuses if the table only has 1 column.",
    inputSchema: z.object({
      slideIdx: z.number().int().min(0),
      tableShapeId: z.string(),
      colIdx: z.number().int().min(0),
    }),
    tags: ["mutate", "table"],
    shapeScoped: true,
    execute: async (rt, { slideIdx, tableShapeId, colIdx }) =>
      rt.apply(new RemoveTableColumnCmd(slideIdx, tableShapeId, colIdx)),
  }),

  defineTool({
    name: "mergeTableCells",
    description:
      "Merge a rectangular range of table cells (inclusive, 0-based). Pass the table GROUP id, not a cell. Adjacent existing merges that intersect the range are absorbed. Text from visible cells is concatenated into the top-left owner.",
    inputSchema: z.object({
      slideIdx: z.number().int().min(0),
      tableShapeId: z.string().describe("Id of the table group (not a cell)."),
      startRow: z.number().int().min(0),
      startCol: z.number().int().min(0),
      endRow: z.number().int().min(0).describe("Inclusive. Can be < startRow; the range is normalized."),
      endCol: z.number().int().min(0),
    }),
    tags: ["mutate", "table"],
    shapeScoped: true,
    execute: (rt, { slideIdx, tableShapeId, startRow, startCol, endRow, endCol }) => {
      const g = findTable(rt.getPres(), slideIdx, tableShapeId);
      if (!g) return err(`table group ${tableShapeId} not found on slide ${slideIdx}`);
      const { rows, cols } = g.tableMeta!;
      if (startRow >= rows || endRow >= rows || startCol >= cols || endCol >= cols) {
        return err(`merge range out of bounds (table is ${rows}×${cols})`);
      }
      if (startRow === endRow && startCol === endCol) {
        return err("merge range must cover at least two cells");
      }
      return rt.apply(new MergeTableCellsCmd(slideIdx, tableShapeId, startRow, startCol, endRow, endCol));
    },
  }),

  defineTool({
    name: "unmergeTableCells",
    description:
      "Split the merged region that contains (row, col) back into 1×1 cells. Pass the table GROUP id. No-op if that cell is not merged.",
    inputSchema: z.object({
      slideIdx: z.number().int().min(0),
      tableShapeId: z.string(),
      row: z.number().int().min(0),
      col: z.number().int().min(0),
    }),
    tags: ["mutate", "table"],
    shapeScoped: true,
    execute: (rt, { slideIdx, tableShapeId, row, col }) => {
      const g = findTable(rt.getPres(), slideIdx, tableShapeId);
      if (!g) return err(`table group ${tableShapeId} not found on slide ${slideIdx}`);
      const { rows, cols } = g.tableMeta!;
      if (row >= rows || col >= cols) return err(`cell (${row},${col}) out of bounds (table is ${rows}×${cols})`);
      return rt.apply(new UnmergeTableCellsCmd(slideIdx, tableShapeId, row, col));
    },
  }),

  defineTool({
    name: "setTableCellStyle",
    description:
      "Style one table cell (fill, vertical align, border color/width). Hidden merge placeholders redirect to the owner cell. Distinct from setShapeFillColor on a cell id — this tool takes row/col on the table group.",
    inputSchema: z.object({
      slideIdx: z.number().int().min(0),
      tableShapeId: z.string(),
      row: z.number().int().min(0),
      col: z.number().int().min(0),
      fillColor: colorSchema.optional().describe("#rrggbb cell background. Omit to leave fill unchanged."),
      clearFill: z.boolean().optional(),
      vAlign: z.enum(["top", "middle", "bottom"]).optional(),
      borderColor: colorSchema.optional(),
      borderWidth: z.number().min(0).max(12).optional(),
    }),
    tags: ["mutate", "table"],
    shapeScoped: true,
    execute: (rt, { slideIdx, tableShapeId, row, col, fillColor, clearFill, vAlign, borderColor, borderWidth }) => {
      const g = findTable(rt.getPres(), slideIdx, tableShapeId);
      if (!g) return err(`table group ${tableShapeId} not found on slide ${slideIdx}`);
      const { rows, cols } = g.tableMeta!;
      if (row >= rows || col >= cols) return err(`cell (${row},${col}) out of bounds (table is ${rows}×${cols})`);
      const patch: {
        fill?: { kind: "solid"; color: string } | null;
        vAlign?: "top" | "middle" | "bottom";
        stroke?: { paint: { kind: "solid"; color: string }; width: number } | null;
      } = {};
      if (clearFill) patch.fill = null;
      else if (fillColor) patch.fill = { kind: "solid", color: fillColor };
      if (vAlign) patch.vAlign = vAlign;
      if (borderColor !== undefined || borderWidth !== undefined) {
        const width = borderWidth ?? 1;
        const color = borderColor ?? "#1e3a8a";
        if (width <= 0) patch.stroke = null;
        else patch.stroke = { paint: { kind: "solid", color }, width };
      }
      if (patch.fill === undefined && patch.vAlign === undefined && patch.stroke === undefined) {
        return err("setTableCellStyle requires fillColor/clearFill, vAlign, or borderColor/borderWidth");
      }
      return rt.apply(new SetTableCellStyleCmd(slideIdx, tableShapeId, row, col, patch));
    },
  }),
];

function findTable(
  pres: { slides: Array<{ layers?: Array<{ shapes: Array<{ id: string; kind: string; tableMeta?: { rows: number; cols: number } }> }> }> },
  slideIdx: number,
  tableShapeId: string,
): { tableMeta: { rows: number; cols: number } } | null {
  const slide = pres.slides[slideIdx];
  if (!slide) return null;
  const walk = (
    shapes: Array<{ id: string; kind: string; tableMeta?: { rows: number; cols: number }; children?: unknown[] }>,
  ): { tableMeta: { rows: number; cols: number } } | null => {
    for (const s of shapes) {
      if (s.id === tableShapeId && s.kind === "group" && s.tableMeta) return s as { tableMeta: { rows: number; cols: number } };
      if (s.kind === "group" && Array.isArray(s.children)) {
        const inner = walk(s.children as typeof shapes);
        if (inner) return inner;
      }
    }
    return null;
  };
  for (const layer of slide.layers ?? []) {
    const hit = walk(layer.shapes);
    if (hit) return hit;
  }
  return null;
}
