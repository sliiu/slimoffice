"use strict";
// 字符选区上的文字样式。选区按 UTF-16 下标，和 contenteditable 的 Range 偏移一致。
Object.defineProperty(exports, "__esModule", { value: true });
exports.patchTextRun = patchTextRun;
exports.runAtCharRanges = runAtCharRanges;
exports.applyStyleToCharRanges = applyStyleToCharRanges;
function patchTextRun(run, patch) {
    const rAny = run;
    const patchAny = patch;
    for (const k of Object.keys(patch)) {
        const val = patchAny[k];
        if (val === null)
            delete rAny[k];
        else
            rAny[k] = val;
    }
    if (patch.color !== undefined &&
        !Object.prototype.hasOwnProperty.call(patch, "fill") &&
        run.fill?.kind === "solid" &&
        run.fill.color !== patch.color) {
        run.fill = { ...run.fill, color: patch.color };
    }
}
function cloneParagraphs(paragraphs) {
    return JSON.parse(JSON.stringify(paragraphs));
}
function sliceRun(run, text) {
    const next = { ...run, text };
    if (run.fill)
        next.fill = { ...run.fill };
    return next;
}
function styleKey(run) {
    const { text: _text, ...rest } = run;
    return JSON.stringify(rest);
}
function mergeRuns(runs) {
    const out = [];
    for (const run of runs) {
        const prev = out[out.length - 1];
        if (prev && styleKey(prev) === styleKey(run))
            prev.text += run.text;
        else
            out.push(run);
    }
    return out;
}
function applyRangeToRuns(runs, start, end, patch) {
    if (end <= start)
        return runs;
    const out = [];
    let cursor = 0;
    for (const run of runs) {
        const len = run.text.length;
        const runStart = cursor;
        const runEnd = cursor + len;
        cursor = runEnd;
        const lo = Math.max(start, runStart);
        const hi = Math.min(end, runEnd);
        if (len === 0 || hi <= lo) {
            out.push(run);
            continue;
        }
        const from = lo - runStart;
        const to = hi - runStart;
        if (from > 0)
            out.push(sliceRun(run, run.text.slice(0, from)));
        const mid = sliceRun(run, run.text.slice(from, to));
        patchTextRun(mid, patch);
        out.push(mid);
        if (to < len)
            out.push(sliceRun(run, run.text.slice(to)));
    }
    return mergeRuns(out);
}
/** 选区起点落在哪一段 run 上。字体和字号框用它，而不是整框的第一个字。 */
function runAtCharRanges(paragraphs, ranges) {
    for (const range of ranges) {
        const para = paragraphs[range.paragraph];
        if (!para || range.end <= range.start)
            continue;
        let cursor = 0;
        for (const run of para.runs) {
            const next = cursor + run.text.length;
            if (range.start < next && range.end > cursor)
                return run;
            cursor = next;
        }
    }
    return undefined;
}
/** 只改选区覆盖到的字符。越界的下标会被夹到该段文本长度内。 */
function applyStyleToCharRanges(paragraphs, ranges, patch) {
    const next = cloneParagraphs(paragraphs);
    for (const range of ranges) {
        const para = next[range.paragraph];
        if (!para)
            continue;
        const length = para.runs.reduce((sum, run) => sum + run.text.length, 0);
        const start = Math.max(0, Math.min(range.start, length));
        const end = Math.max(start, Math.min(range.end, length));
        if (end <= start)
            continue;
        para.runs = applyRangeToRuns(para.runs, start, end, patch);
    }
    return next;
}
