"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isEastAsianChar = isEastAsianChar;
exports.mapVisualAlign = mapVisualAlign;
exports.mapVisualAlignWithAnchorCtr = mapVisualAlignWithAnchorCtr;
exports.applyKinsoku = applyKinsoku;
exports.glueUnbrokenEastAsian = glueUnbrokenEastAsian;
exports.wrapParagraphIntoLines = wrapParagraphIntoLines;
const font_stack_1 = require("./font-stack");
const core_1 = require("@sliiu/present-core");
const text_shared_1 = require("./text-shared");
// 与 backend 保持一致的"东亚 / CJK"判定（用于 eaVert 直立判断与 wrapping 时的"逐字可断"决策）。
function isEastAsianChar(cp) {
    if (cp >= 0x1100 && cp <= 0x11ff)
        return true; // Hangul Jamo
    if (cp >= 0x2e80 && cp <= 0x2fff)
        return true; // CJK Radicals
    if (cp >= 0x3000 && cp <= 0x33ff)
        return true; // CJK Symbols / Hiragana / Katakana / Bopomofo
    if (cp >= 0x3400 && cp <= 0x9fff)
        return true; // CJK Unified Ideographs
    if (cp >= 0xac00 && cp <= 0xd7af)
        return true; // Hangul Syllables
    if (cp >= 0xf900 && cp <= 0xfaff)
        return true; // CJK Compat Ideographs
    if (cp >= 0xff00 && cp <= 0xffef)
        return true; // Halfwidth / Fullwidth
    if (cp >= 0x20000 && cp <= 0x3ffff)
        return true; // CJK Extensions B+
    return false;
}
// ECMA-376 §21.1.2.2.6 pPr@algn — 段落水平对齐。RTL 时 start/end 视觉互换。
function mapVisualAlign(align, rtl) {
    if (!rtl)
        return align;
    if (align === "start")
        return "end";
    if (align === "end")
        return "start";
    return align;
}
// ECMA-376 §21.1.2.1.1 bodyPr@anchorCtr — 仅当 true 且段落数 == 1 时，
// 按实际行宽水平居中，忽略该段 pPr@algn。多段时规范明确 non-applicable。
function mapVisualAlignWithAnchorCtr(s, p) {
    const rtl = !!p.rtl;
    // 文本框 bodyPr@anchorCtr：仅单段时按行宽居中。
    // 表格 tcPr@anchorCtr：单元格内所有段落水平居中（与段落数无关）。
    if (s.anchorCtr && (s.cellMeta || (s.paragraphs?.length ?? 0) === 1)) {
        return mapVisualAlign("middle", rtl);
    }
    return mapVisualAlign(p.align ?? "start", rtl);
}
// 视为"可断行空白"的字符：ASCII 空格 / 全角空格 \u3000 / 零宽空格 \u200B /
// Tab 单独成 token（制表位）。NBSP 仍归为可见 word。
function isBreakSpace(ch) {
    return ch === " " || ch === "\u3000" || ch === "\u200B";
}
// ECMA-376 §19.2.1.20 kinsoku — PowerPoint's default East Asian line-break prohibitions:
// closing punctuation may not start a line, opening brackets may not end one. The tokenizer
// emits one token per CJK character, so without this "。" happily drops onto a line of its own.
// Applied whenever the neighbour is a CJK token (a deck-level <p:kinsoku> override only
// widens the sets; the defaults are what matters for generated and typical Chinese text).
const KINSOKU_NO_START = new Set(Array.from("!%),.:;>?]}¢¨°·ˇˉ―‖’”…‰′″›℃∶、。〃〉》」』】〕〗〞︶︺︾﹀﹄﹚﹜﹞！＂％＇），．：；？］｀｜｝～￠"));
const KINSOKU_NO_END = new Set(Array.from("$(£¥·‘“〈《「『【〔〖〝﹙﹛＄（［｛￡￥"));
function isSingleChar(t, set) {
    return t.kind !== "ws" && t.kind !== "tab" && set.has(t.text);
}
/** Glue prohibited line-start / line-end characters to their CJK neighbour so they wrap together. */
function applyKinsoku(tokens) {
    const out = [];
    for (const t of tokens) {
        const prev = out[out.length - 1];
        if (prev && prev.kind !== "ws" && prev.kind !== "tab" && t.kind !== "ws" && t.kind !== "tab") {
            const glueStart = isSingleChar(t, KINSOKU_NO_START) && (prev.kind === "cjk" || t.kind === "cjk");
            const glueEnd = isSingleChar(prev, KINSOKU_NO_END) && (prev.kind === "cjk" || t.kind === "cjk");
            if (glueStart || glueEnd) {
                prev.text += t.text;
                continue;
            }
        }
        out.push({ ...t });
    }
    return out;
}
/** 标点留在前一段，下一段可以从这里换行。 */
const EA_BREAK_AFTER = new Set(Array.from("，。！？；、：,.!?;:…"));
function endsWithEaBreak(text) {
    const chars = Array.from(text);
    const last = chars[chars.length - 1];
    return !!last && EA_BREAK_AFTER.has(last);
}
/** 行末可以挂出边的收口标点，和禁则里不能出现在行首的那一组相同。 */
function splitHangingSuffix(text) {
    const chars = Array.from(text);
    let i = chars.length;
    while (i > 0 && KINSOKU_NO_START.has(chars[i - 1]))
        i--;
    if (i === chars.length)
        return { body: text, hang: "" };
    return { body: chars.slice(0, i).join(""), hang: chars.slice(i).join("") };
}
/** eaLnBrk 为假：相邻汉字粘成一块，标点后面仍可断。调用前先走过禁则。 */
function glueUnbrokenEastAsian(tokens) {
    const out = [];
    for (const t of tokens) {
        const prev = out[out.length - 1];
        if (prev && prev.kind === "cjk" && t.kind === "cjk" && !endsWithEaBreak(prev.text)) {
            prev.text += t.text;
            continue;
        }
        out.push({ ...t });
    }
    return out;
}
function tokenizeText(text, eaLnBrk) {
    const tokens = applyKinsoku(tokenizeRaw(text));
    return eaLnBrk === false ? glueUnbrokenEastAsian(tokens) : tokens;
}
function tokenizeRaw(text) {
    if (!text)
        return [];
    const out = [];
    let buf = "";
    let bufKind = null;
    const flush = () => {
        if (buf) {
            out.push({ text: buf, kind: bufKind });
            buf = "";
            bufKind = null;
        }
    };
    for (const ch of Array.from(text)) {
        if (ch === "\t") {
            flush();
            out.push({ text: "\t", kind: "tab" });
            continue;
        }
        const cp = ch.codePointAt(0);
        if (isEastAsianChar(cp)) {
            flush();
            out.push({ text: ch, kind: "cjk" });
            continue;
        }
        const isWs = isBreakSpace(ch);
        const targetKind = isWs ? "ws" : "word";
        if (bufKind && bufKind !== targetKind)
            flush();
        buf += ch;
        bufKind = targetKind;
    }
    flush();
    return out;
}
function nextTabStop(x, p) {
    const stops = (p.tabStops ?? [])
        .filter((t) => t.pos > x + 0.5)
        .sort((a, b) => a.pos - b.pos);
    if (stops.length) {
        const s = stops[0];
        return { pos: s.pos, align: s.align ?? "l" };
    }
    const sz = p.defTabSz && p.defTabSz > 1 ? p.defTabSz : 36;
    return { pos: Math.floor(x / sz + 1) * sz, align: "l" };
}
function tabAlignedAdvance(x, p, fieldWidth, decWidth) {
    const stop = nextTabStop(x, p);
    let target = stop.pos;
    if (stop.align === "r")
        target = stop.pos - fieldWidth;
    else if (stop.align === "ctr")
        target = stop.pos - fieldWidth / 2;
    else if (stop.align === "dec")
        target = stop.pos - decWidth;
    return Math.max(1, target - x);
}
function decimalPrefixWidth(text, fullWidth, measure) {
    const i = text.search(/[.,]/);
    if (i < 0)
        return fullWidth;
    return measure(text.slice(0, i));
}
// 浏览器 canvas 在 measureText 里对 \t 的处理不一致。含 Tab 时按制表位展开。
function measureTextWithWhitespace(ctx, text, startX = 0, para) {
    if (!text.includes("\t"))
        return ctx.measureText(text).width;
    if (!para) {
        const spaceW = ctx.measureText(" ").width;
        let x = startX;
        let buf = "";
        for (const ch of text) {
            if (ch === "\t") {
                if (buf) {
                    x += ctx.measureText(buf).width;
                    buf = "";
                }
                x += spaceW * 4;
            }
            else {
                buf += ch;
            }
        }
        if (buf)
            x += ctx.measureText(buf).width;
        return x - startX;
    }
    const parts = text.split("\t");
    let x = startX;
    for (let i = 0; i < parts.length; i++) {
        const field = parts[i];
        if (i > 0) {
            const fw = ctx.measureText(field).width;
            const dw = decimalPrefixWidth(field, fw, (s) => ctx.measureText(s).width);
            x += tabAlignedAdvance(x, para, fw, dw);
        }
        if (field)
            x += ctx.measureText(field).width;
    }
    return x - startX;
}
function setMeasureFontFor(ctx, run, fs) {
    const it = run.italic ? "italic " : "";
    const fw = run.fontWeight ?? "normal";
    const fa = (0, font_stack_1.withFontFallback)(run.fontFamily);
    ctx.font = `${it}${fw} ${fs}px ${fa}`;
}
// 把一个段落根据 maxWidth 贪心打包成多行 visual line；保证返回至少一行。
// firstLineMaxWidth 用来描述"首行可用宽度"（通常等于 maxWidth；若有 first-line indent
// 则减去 indent；hanging-indent 不影响 firstLineMaxWidth）。
// noWrap=true 时整段返回单行（OOXML wrap="none"）。
function wrapParagraphIntoLines(p, maxWidth, fallbackFs, ctx, firstLineMaxWidth, noWrap, fieldCtx, compatLnSpc) {
    const lineHFactor = (0, text_shared_1.lineHeightFactor)(p, compatLnSpc);
    const lines = [];
    let cur = { segments: [], width: 0, maxFs: 0, hang: 0 };
    const flush = () => {
        lines.push(cur);
        cur = { segments: [], width: 0, maxFs: 0, hang: 0 };
    };
    const append = (run, text, width, fs) => {
        if (!text && width <= 0)
            return;
        const last = cur.segments[cur.segments.length - 1];
        if (text && last && last.run === run && last.text) {
            last.text += text;
            last.width += width;
        }
        else {
            cur.segments.push({ run, text, width });
        }
        cur.width += width;
        if (fs > cur.maxFs)
            cur.maxFs = fs;
    };
    const limit = () => (lines.length === 0 ? firstLineMaxWidth : maxWidth);
    const measureRunText = (run, text) => {
        const fs = run.fontSize ?? fallbackFs;
        setMeasureFontFor(ctx, run, fs);
        const ls = run.letterSpacing ?? 0;
        return ctx.measureText(text).width + ls * Array.from(text).length;
    };
    const fieldMetrics = (runIdx, restThisRun, closedInRun) => {
        const chunks = [{ run: p.runs[runIdx], text: restThisRun }];
        if (!closedInRun) {
            for (let i = runIdx + 1; i < p.runs.length; i++) {
                const run = p.runs[i];
                const t = fieldCtx ? (0, core_1.runDisplayText)(run, fieldCtx) : run.text;
                const k = t.indexOf("\t");
                chunks.push({ run, text: k >= 0 ? t.slice(0, k) : t });
                if (k >= 0)
                    break;
            }
        }
        let width = 0;
        let joined = "";
        for (const c of chunks) {
            width += measureRunText(c.run, c.text);
            joined += c.text;
        }
        const decWidth = decimalPrefixWidth(joined, width, (s) => {
            const first = chunks[0]?.run;
            return first ? measureRunText(first, s) : ctx.measureText(s).width;
        });
        return { width, decWidth };
    };
    for (let ri = 0; ri < p.runs.length; ri++) {
        const run = p.runs[ri];
        const runText = fieldCtx ? (0, core_1.runDisplayText)(run, fieldCtx) : run.text;
        const fs = run.fontSize ?? fallbackFs;
        setMeasureFontFor(ctx, run, fs);
        const ls = run.letterSpacing ?? 0;
        if (noWrap) {
            if (runText.includes("\t")) {
                let x = cur.width;
                let buf = "";
                const flushBuf = () => {
                    if (!buf)
                        return;
                    const w = ctx.measureText(buf).width + ls * Array.from(buf).length;
                    append(run, buf, w, fs);
                    x += w;
                    buf = "";
                };
                const chars = Array.from(runText);
                for (let ci = 0; ci < chars.length; ci++) {
                    if (chars[ci] === "\t") {
                        flushBuf();
                        const rest = chars.slice(ci + 1).join("");
                        const closed = rest.includes("\t");
                        const restField = closed ? rest.slice(0, rest.indexOf("\t")) : rest;
                        const { width, decWidth } = fieldMetrics(ri, restField, closed);
                        const adv = tabAlignedAdvance(x, p, width, decWidth);
                        append(run, "", adv, fs);
                        x += adv;
                    }
                    else {
                        buf += chars[ci];
                    }
                }
                flushBuf();
            }
            else {
                const w = measureTextWithWhitespace(ctx, runText, cur.width, p) + ls * Array.from(runText).length;
                append(run, runText, w, fs);
            }
            continue;
        }
        const tokens = tokenizeText(runText, p.eaLnBrk);
        for (let ti = 0; ti < tokens.length; ti++) {
            const tok = tokens[ti];
            if (tok.kind === "tab") {
                let rest = "";
                let closed = false;
                for (let k = ti + 1; k < tokens.length; k++) {
                    if (tokens[k].kind === "tab") {
                        closed = true;
                        break;
                    }
                    rest += tokens[k].text;
                }
                const { width, decWidth } = fieldMetrics(ri, rest, closed);
                const adv = tabAlignedAdvance(cur.width, p, width, decWidth);
                append(run, "", adv, fs);
                continue;
            }
            const chars = Array.from(tok.text).length;
            const tw = measureTextWithWhitespace(ctx, tok.text, cur.width, p) + ls * chars;
            const lim = limit();
            const splitWord = p.latinLnBrk === true && tok.kind === "word";
            const keepWhole = (p.eaLnBrk === false && tok.kind === "cjk") ||
                (tok.kind === "word" && p.latinLnBrk !== true);
            if (p.hangingPunct && tok.kind !== "ws") {
                const hung = splitHangingSuffix(tok.text);
                if (hung.hang) {
                    const hangW = measureRunText(run, hung.hang);
                    const bodyW = Math.max(0, tw - hangW);
                    const bodyFits = cur.width + bodyW <= lim + 0.5;
                    const onlyHang = hung.body.length === 0 && cur.segments.length > 0;
                    if ((hung.body.length > 0 && bodyFits) || onlyHang) {
                        append(run, tok.text, tw, fs);
                        cur.hang += hangW;
                        continue;
                    }
                }
            }
            const wouldOverflow = cur.width + tw > lim && cur.segments.length > 0;
            if (wouldOverflow && !splitWord) {
                flush();
                if (tok.kind === "ws")
                    continue;
            }
            const lineW = limit();
            if (!keepWhole && tok.kind !== "ws" && lineW > 0 && cur.width + tw > lineW) {
                for (const ch of Array.from(tok.text)) {
                    const cw = measureTextWithWhitespace(ctx, ch) + ls;
                    const L = limit();
                    if (cur.width + cw > L && cur.segments.length > 0)
                        flush();
                    append(run, ch, cw, fs);
                }
                continue;
            }
            append(run, tok.text, tw, fs);
        }
    }
    flush();
    if (lines.length === 0)
        lines.push({ segments: [], width: 0, hang: 0, maxFs: fallbackFs });
    return lines.map((l) => {
        const fs = l.maxFs || fallbackFs;
        let height = p.lineHeightPx ?? fs * lineHFactor;
        if (compatLnSpc && p.lineHeightPx === undefined && p.lineHeight === undefined) {
            const m = ctx.measureText("Hg");
            const a = m.actualBoundingBoxAscent;
            const d = m.actualBoundingBoxDescent;
            if (a && d)
                height = a + d;
            else
                height = fs;
        }
        return {
            segments: l.segments,
            width: l.width,
            hang: l.hang,
            height,
            ascent: height - fs * 0.25,
            maxFs: fs,
        };
    });
}
