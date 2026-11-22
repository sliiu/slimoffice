"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatNumber = formatNumber;
const EXCEL_EPOCH = Date.UTC(1899, 11, 30) / 86400000;
/** Renders a number with an Excel format code. Sections split on `;`: positive, negative, zero, text. */
function formatNumber(value, code) {
    const sections = splitSections(code);
    if (value < 0 && sections[1])
        return paint(Math.abs(value), sections[1]);
    if (value === 0 && sections[2])
        return paint(0, sections[2]);
    return paint(value, sections[0] ?? "General");
}
function splitSections(code) {
    const out = [];
    let current = "";
    let quoted = false;
    for (let i = 0; i < code.length; i += 1) {
        const char = code[i];
        if (char === "\"")
            quoted = !quoted;
        if (char === ";" && !quoted) {
            out.push(current);
            current = "";
        }
        else
            current += char;
    }
    out.push(current);
    return out;
}
function paint(value, section) {
    const body = section.replace(/\[[^\]]*\]/g, "").trim();
    if (!body || /^general$/i.test(body))
        return String(value);
    if (/^@+$/.test(body))
        return String(value);
    if (/[ymdhs]/i.test(body) && !/[0#]/.test(body))
        return formatDate(value, body);
    if (/%/.test(body))
        return formatPercent(value, body);
    if (/e[+-]0/i.test(body))
        return formatScientific(value, body);
    return formatDecimal(value, body);
}
function formatPercent(value, body) {
    const digits = decimals(body);
    return `${(value * 100).toFixed(digits)}%`;
}
function formatScientific(value, body) {
    const digits = decimals(body);
    return value.toExponential(digits).replace(/e([+-])(\d)$/, "E$10$2").toUpperCase();
}
function formatDecimal(value, body) {
    const grouped = /#,##/.test(body);
    const digits = decimals(body);
    const text = value.toLocaleString("en-US", {
        useGrouping: grouped,
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    });
    const literal = body.replace(/[#0?,.]+/g, "\0").replace(/"([^"]*)"/g, "$1").replace(/\\(.)/g, "$1");
    if (!literal.includes("\0"))
        return text;
    return literal.replace("\0", text);
}
function formatDate(serial, body) {
    const date = new Date(Math.round((serial + EXCEL_EPOCH) * 86400000));
    const hours = date.getUTCHours();
    const map = {
        yyyy: String(date.getUTCFullYear()),
        yy: String(date.getUTCFullYear()).slice(-2),
        mmmm: date.toLocaleString("en-US", { month: "long", timeZone: "UTC" }),
        mmm: date.toLocaleString("en-US", { month: "short", timeZone: "UTC" }),
        mm: String(date.getUTCMonth() + 1).padStart(2, "0"),
        m: String(date.getUTCMonth() + 1),
        dd: String(date.getUTCDate()).padStart(2, "0"),
        d: String(date.getUTCDate()),
        hh: String(hours).padStart(2, "0"),
        h: String(hours % 12 || 12),
        ss: String(date.getUTCSeconds()).padStart(2, "0"),
        "am/pm": hours < 12 ? "AM" : "PM",
    };
    let text = body;
    for (const token of ["yyyy", "yy", "mmmm", "mmm", "mm", "dd", "hh", "ss", "am/pm", "m", "d", "h"]) {
        text = text.replace(new RegExp(token, "gi"), map[token.toLowerCase()] ?? "");
    }
    return text;
}
function decimals(body) {
    const dot = body.indexOf(".");
    if (dot < 0)
        return 0;
    const tail = body.slice(dot + 1);
    return tail.match(/0/g)?.length ?? 0;
}
