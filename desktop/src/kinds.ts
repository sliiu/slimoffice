export type OfficeKind = "present" | "document" | "sheet" | "unknown";

export function officeKind(name: string): OfficeKind {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pptx" || ext === "pptm") return "present";
  if (ext === "docx" || ext === "doc") return "document";
  if (ext === "xlsx" || ext === "xls" || ext === "csv") return "sheet";
  return "unknown";
}
