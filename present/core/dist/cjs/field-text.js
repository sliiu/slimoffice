"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveFieldText = resolveFieldText;
exports.runDisplayText = runDisplayText;
/** Resolve OOXML-style field types (slidenum, datetime*, etc.) for display. */
function resolveFieldText(field, ctx) {
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
    if (key === "footer" || key === "header")
        return "";
    return field;
}
function runDisplayText(run, ctx) {
    if (run.field)
        return resolveFieldText(run.field, ctx);
    return run.text;
}
