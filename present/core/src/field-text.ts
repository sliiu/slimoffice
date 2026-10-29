import type { TextRun } from "./shape";

export interface FieldResolveContext {
  slideIndex: number;
  slideCount?: number;
  now?: Date;
}

/** Resolve OOXML-style field types (slidenum, datetime*, etc.) for display. */
export function resolveFieldText(field: string, ctx: FieldResolveContext): string {
  const key = field.toLowerCase();
  const now = ctx.now ?? new Date();
  if (key === "slidenum" || key === "slidenumber") {
    return String(ctx.slideIndex + 1);
  }
  if (key.startsWith("datetime")) {
    return now.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: key.includes("time") ? "2-digit" : undefined,
      minute: key.includes("time") ? "2-digit" : undefined,
    });
  }
  if (key === "footer" || key === "header") return "";
  return field;
}

export function runDisplayText(run: TextRun, ctx: FieldResolveContext): string {
  if (run.field) return resolveFieldText(run.field, ctx);
  return run.text;
}
