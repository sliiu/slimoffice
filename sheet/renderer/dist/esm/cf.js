import { evaluate } from "@sliiu/sheet-formula";
/** Resolve conditional-format look for one cell. Later rules override earlier ones for fill/color. */
export function cfLook(sheet, row, column, cell) {
    const rules = sheet.conditionalFormats ?? [];
    const look = {};
    for (const rule of rules) {
        if (row < rule.r1 || row > rule.r2 || column < rule.c1 || column > rule.c2)
            continue;
        const value = Number(cell?.value ?? "");
        const hit = matchRule(rule, sheet, row, column, cell, value);
        if (!hit)
            continue;
        if (hit.fill)
            look.fill = hit.fill;
        if (hit.color)
            look.color = hit.color;
        if (hit.bar != null)
            look.bar = hit.bar;
        if (hit.icon)
            look.icon = hit.icon;
    }
    return look;
}
function matchRule(cf, sheet, row, column, cell, value) {
    const rule = cf.rule;
    if (rule.type === "cellValue") {
        const a = Number(rule.formula1);
        const b = rule.formula2 != null ? Number(rule.formula2) : NaN;
        const ok = rule.op === "gt" ? value > a :
            rule.op === "gte" ? value >= a :
                rule.op === "lt" ? value < a :
                    rule.op === "lte" ? value <= a :
                        rule.op === "eq" ? cell?.value === rule.formula1 || value === a :
                            rule.op === "neq" ? cell?.value !== rule.formula1 && value !== a :
                                value >= Math.min(a, b) && value <= Math.max(a, b);
        return ok ? { fill: rule.fill, color: rule.color } : null;
    }
    if (rule.type === "expression") {
        // The formula is evaluated against the sheet, so AND, OR, and cell references all work.
        const formula = rule.formula.startsWith("=") ? rule.formula : `=${rule.formula}`;
        const result = evaluate(formula, { workbook: { sheets: [sheet] }, sheetIndex: 0, row, col: column });
        const ok = result === true || (typeof result === "number" && result !== 0);
        return ok ? { fill: rule.fill, color: rule.color } : null;
    }
    if (rule.type === "colorScale") {
        if (!Number.isFinite(value))
            return null;
        const stats = rangeStats(sheet, cf);
        if (stats.max === stats.min)
            return { fill: rule.colors[0] };
        const t = (value - stats.min) / (stats.max - stats.min);
        return { fill: mix(rule.colors[0], rule.colors[rule.colors.length - 1], t) };
    }
    if (rule.type === "dataBar") {
        if (!Number.isFinite(value))
            return null;
        const stats = rangeStats(sheet, cf);
        const span = stats.max - stats.min || 1;
        return { bar: Math.max(0, Math.min(1, (value - stats.min) / span)), fill: rule.color };
    }
    if (rule.type === "iconSet") {
        if (!Number.isFinite(value))
            return null;
        const stats = rangeStats(sheet, cf);
        const t = stats.max === stats.min ? 1 : (value - stats.min) / (stats.max - stats.min);
        const icons = rule.set === "3Arrows" ? ["↓", "→", "↑"] : rule.set === "3Symbols" ? ["✗", "•", "✓"] : ["🔴", "🟡", "🟢"];
        return { icon: icons[t < 1 / 3 ? 0 : t < 2 / 3 ? 1 : 2] };
    }
    if (rule.type === "duplicate" || rule.type === "unique" || rule.type === "containsText") {
        return textRule(rule, sheet, cf, cell) ? { fill: rule.fill, color: rule.color } : null;
    }
    if (rule.type === "top10")
        return topRule(rule, sheet, cf, value) ? { fill: rule.fill, color: rule.color } : null;
    if (rule.type === "aboveAverage")
        return averageRule(rule, sheet, cf, value) ? { fill: rule.fill, color: rule.color } : null;
    return null;
}
/** A blank is neither a duplicate nor unique. Text compares without case. */
function textRule(rule, sheet, cf, cell) {
    const text = cell?.value ?? "";
    if (rule.type === "containsText") {
        const hay = text.toLowerCase();
        const needle = rule.text.toLowerCase();
        if (rule.op === "notContains")
            return !hay.includes(needle);
        if (!needle)
            return false;
        if (rule.op === "beginsWith")
            return hay.startsWith(needle);
        if (rule.op === "endsWith")
            return hay.endsWith(needle);
        return hay.includes(needle);
    }
    if (text === "")
        return false;
    let count = 0;
    eachCell(sheet, cf, (item) => {
        if (item?.value === text)
            count += 1;
    });
    return rule.type === "duplicate" ? count > 1 : count === 1;
}
/** Top or bottom N, or a percent of the range. Ties at the cutoff stay in. */
function topRule(rule, sheet, cf, value) {
    if (!Number.isFinite(value))
        return false;
    const nums = rangeNumbers(sheet, cf);
    if (!nums.length)
        return false;
    const sorted = [...nums].sort((a, b) => (rule.bottom ? a - b : b - a));
    const count = rule.percent ? Math.max(1, Math.round((nums.length * rule.rank) / 100)) : rule.rank;
    const cutoff = sorted[Math.min(count, sorted.length) - 1];
    if (cutoff == null)
        return false;
    return rule.bottom ? value <= cutoff : value >= cutoff;
}
/** Above or below the mean of the range. Equal to the mean only counts when the rule says so. */
function averageRule(rule, sheet, cf, value) {
    const nums = rangeNumbers(sheet, cf);
    if (!Number.isFinite(value) || !nums.length)
        return false;
    const mean = nums.reduce((sum, item) => sum + item, 0) / nums.length;
    if (value === mean)
        return rule.equal === true;
    return rule.above === false ? value < mean : value > mean;
}
function rangeNumbers(sheet, cf) {
    const nums = [];
    eachCell(sheet, cf, (cell) => {
        const n = Number(cell?.value ?? "");
        if (Number.isFinite(n))
            nums.push(n);
    });
    return nums;
}
function eachCell(sheet, cf, visit) {
    for (let r = cf.r1; r <= cf.r2; r += 1) {
        for (let c = cf.c1; c <= cf.c2; c += 1)
            visit(sheet.cells[r]?.[c]);
    }
}
function rangeStats(sheet, cf) {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (let r = cf.r1; r <= cf.r2; r += 1) {
        for (let c = cf.c1; c <= cf.c2; c += 1) {
            const n = Number(sheet.cells[r]?.[c]?.value ?? "");
            if (!Number.isFinite(n))
                continue;
            min = Math.min(min, n);
            max = Math.max(max, n);
        }
    }
    if (!Number.isFinite(min))
        return { min: 0, max: 0 };
    return { min, max };
}
function mix(a, b, t) {
    const left = hex(a);
    const right = hex(b);
    const ch = (i) => Math.round(left[i] + (right[i] - left[i]) * t);
    return `#${[ch(0), ch(1), ch(2)].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}
function hex(value) {
    const raw = value.replace("#", "");
    const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw.padEnd(6, "0");
    return [parseInt(full.slice(0, 2), 16) || 0, parseInt(full.slice(2, 4), 16) || 0, parseInt(full.slice(4, 6), 16) || 0];
}
