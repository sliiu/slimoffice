// ECMA-376 Part 1 §22.1 Office Math (OMML).
// PowerPoint / WPS 插入公式时写 `<a14:m>` / `<m:oMath>`；老客户端读 `<mc:Fallback>` 里的栅格图。
import { attr, findByLocalName, orderedChildren, stripNs } from "./xml.js";
export function inspectMathMarkup(node) {
    const flags = { hasOmml: false, hasPlainText: false, hasPicture: false };
    if (node)
        walkFlags(node, false, flags);
    return flags;
}
function walkFlags(node, insideMath, flags) {
    for (const ref of orderedChildren(node)) {
        const local = stripNs(ref.tag);
        const mathHere = insideMath ||
            local === "oMath" ||
            local === "oMathPara" ||
            (local === "m" && !insideMath && hasOmmlChild(ref.node));
        if (mathHere && !insideMath)
            flags.hasOmml = true;
        if (local === "blipFill" || local === "blip" || local === "pic")
            flags.hasPicture = true;
        if (!mathHere && local === "t") {
            const text = nodeText(ref.node);
            if (text.trim())
                flags.hasPlainText = true;
        }
        walkFlags(ref.node, mathHere, flags);
    }
}
function hasOmmlChild(node) {
    return Boolean(findByLocalName(node, "oMath") || findByLocalName(node, "oMathPara"));
}
export function extractOmmlFrom(node) {
    if (!node)
        return null;
    const maths = [];
    collectOMath(node, maths);
    if (maths.length === 0 && looksLikeOmmlBody(node))
        maths.push(node);
    if (maths.length === 0)
        return null;
    const latex = maths.map((n) => convertChildren(n, "latex")).filter(Boolean).join(" ");
    const plain = maths.map((n) => convertChildren(n, "plain")).filter(Boolean).join(" ");
    if (!latex && !plain)
        return null;
    return { latex, plain };
}
function collectOMath(node, out) {
    for (const ref of orderedChildren(node)) {
        const local = stripNs(ref.tag);
        if (local === "oMath") {
            out.push(ref.node);
            continue;
        }
        if (local === "oMathPara") {
            const inner = findByLocalName(ref.node, "oMath");
            if (inner)
                out.push(inner);
            else
                collectOMath(ref.node, out);
            continue;
        }
        collectOMath(ref.node, out);
    }
}
function looksLikeOmmlBody(node) {
    for (const ref of orderedChildren(node)) {
        const local = stripNs(ref.tag);
        if (local === "r" ||
            local === "f" ||
            local === "nary" ||
            local === "d" ||
            local === "sSub" ||
            local === "sSup" ||
            local === "sSubSup" ||
            local === "rad" ||
            local === "func" ||
            local === "acc" ||
            local === "bar") {
            return true;
        }
    }
    return false;
}
export function ommlToLatex(node) {
    return extractOmmlFrom(node)?.latex ?? "";
}
export function ommlToPlain(node) {
    return extractOmmlFrom(node)?.plain ?? "";
}
/** 把 OMML 容器（a14:m / oMathPara / oMath）变成一个 text run。 */
export function ommlToTextRun(node, runProps = {}) {
    const markup = extractOmmlFrom(node);
    if (!markup)
        return null;
    const text = markup.plain || markup.latex;
    if (!text.trim())
        return null;
    return { ...runProps, text, math: markup };
}
function convertChildren(node, mode) {
    if (!node)
        return "";
    let out = "";
    for (const ref of orderedChildren(node))
        out += convertEl(stripNs(ref.tag), ref.node, mode);
    return out;
}
function convertEl(local, node, mode) {
    switch (local) {
        case "oMath":
        case "oMathPara":
        case "e":
        case "num":
        case "den":
        case "sub":
        case "sup":
        case "deg":
        case "fName":
        case "lim":
            return convertChildren(node, mode);
        case "r":
            return convertRun(node, mode);
        case "t":
            return convertText(nodeText(node), mode);
        case "f":
            return convertFrac(node, mode);
        case "sSub":
            return wrapScript(convertNamed(node, "e", mode), convertNamed(node, "sub", mode), undefined, mode);
        case "sSup":
            return wrapScript(convertNamed(node, "e", mode), undefined, convertNamed(node, "sup", mode), mode);
        case "sSubSup":
            return wrapScript(convertNamed(node, "e", mode), convertNamed(node, "sub", mode), convertNamed(node, "sup", mode), mode);
        case "sPre":
            return convertPreScript(node, mode);
        case "d":
            return convertDelim(node, mode);
        case "nary":
            return convertNary(node, mode);
        case "func":
            return convertFunc(node, mode);
        case "rad":
            return convertRad(node, mode);
        case "acc":
            return convertAcc(node, mode);
        case "bar":
            return convertBar(node, mode);
        case "groupChr":
            return convertGroupChr(node, mode);
        case "limLow":
            return convertLim(node, "low", mode);
        case "limUpp":
            return convertLim(node, "upp", mode);
        case "eqArr":
            return convertEqArr(node, mode);
        case "m":
            if (hasOmmlChild(node))
                return convertChildren(node, mode);
            return convertMatrix(node, mode);
        case "box":
        case "borderBox":
        case "phant":
            return convertChildren(node, mode);
        default:
            if (local.endsWith("Pr"))
                return "";
            return convertChildren(node, mode);
    }
}
function convertNamed(node, name, mode) {
    return convertChildren(findByLocalName(node, name), mode);
}
function convertRun(node, mode) {
    const t = findByLocalName(node, "t");
    if (t)
        return convertText(nodeText(t), mode);
    return convertChildren(node, mode);
}
function convertFrac(node, mode) {
    const num = convertNamed(node, "num", mode);
    const den = convertNamed(node, "den", mode);
    if (mode === "plain")
        return `(${num})/(${den})`;
    return `\\frac{${num}}{${den}}`;
}
function wrapScript(base, sub, sup, mode) {
    if (mode === "plain") {
        let s = base;
        if (sub)
            s += `_${sub}`;
        if (sup)
            s += `^${sup}`;
        return s;
    }
    let s = `{${base}}`;
    if (sub)
        s += `_{${sub}}`;
    if (sup)
        s += `^{${sup}}`;
    return s;
}
function convertPreScript(node, mode) {
    const sub = convertNamed(node, "sub", mode);
    const sup = convertNamed(node, "sup", mode);
    const e = convertNamed(node, "e", mode);
    if (mode === "plain")
        return `${sub}${sup}${e}`;
    return `{}_{${sub}}^{${sup}}{${e}}`;
}
function convertDelim(node, mode) {
    const pr = findByLocalName(node, "dPr");
    const beg = mathVal(findByLocalName(pr, "begChr")) ?? "(";
    const end = mathVal(findByLocalName(pr, "endChr")) ?? ")";
    const sep = mathVal(findByLocalName(pr, "sepChr"));
    const parts = [];
    for (const e of findAllLocal(node, "e"))
        parts.push(convertChildren(e, mode));
    const inner = parts.join(sep ?? "");
    if (mode === "plain")
        return `${beg}${inner}${end}`;
    return `\\left${latexDelim(beg)}${inner}\\right${latexDelim(end)}`;
}
function latexDelim(ch) {
    if (ch === "(" || ch === ")" || ch === "[" || ch === "]" || ch === "|" || ch === ".")
        return ch;
    if (ch === "{")
        return "\\{";
    if (ch === "}")
        return "\\}";
    if (ch === "‖")
        return "\\|";
    if (ch === "⟨")
        return "\\langle ";
    if (ch === "⟩")
        return "\\rangle ";
    return ch;
}
function convertNary(node, mode) {
    const pr = findByLocalName(node, "naryPr");
    const chr = mathVal(findByLocalName(pr, "chr")) ?? "∫";
    const subHide = isOn(mathVal(findByLocalName(pr, "subHide")));
    const supHide = isOn(mathVal(findByLocalName(pr, "supHide")));
    const sub = subHide ? "" : convertNamed(node, "sub", mode);
    const sup = supHide ? "" : convertNamed(node, "sup", mode);
    const e = convertNamed(node, "e", mode);
    const op = mode === "latex" ? naryLatex(chr) : chr;
    return wrapScript(op, sub || undefined, sup || undefined, mode) + e;
}
function naryLatex(chr) {
    if (chr === "∑" || chr === "Σ")
        return "\\sum";
    if (chr === "∏" || chr === "Π")
        return "\\prod";
    if (chr === "∫")
        return "\\int";
    if (chr === "∬")
        return "\\iint";
    if (chr === "∭")
        return "\\iiint";
    if (chr === "∮")
        return "\\oint";
    if (chr === "⋃")
        return "\\bigcup";
    if (chr === "⋂")
        return "\\bigcap";
    return chr;
}
function convertFunc(node, mode) {
    const name = convertNamed(node, "fName", mode).trim();
    const arg = convertNamed(node, "e", mode);
    if (mode === "plain")
        return `${name} ${arg}`;
    const cmd = LATEX_FUNCS.has(name) ? `\\${name}` : name;
    return `${cmd}{${arg}}`;
}
function convertRad(node, mode) {
    const deg = convertNamed(node, "deg", mode);
    const e = convertNamed(node, "e", mode);
    if (mode === "plain")
        return deg ? `root[${deg}](${e})` : `√(${e})`;
    return deg ? `\\sqrt[${deg}]{${e}}` : `\\sqrt{${e}}`;
}
function convertAcc(node, mode) {
    const chr = mathVal(findByLocalName(findByLocalName(node, "accPr"), "chr")) ?? "\u0302";
    const e = convertNamed(node, "e", mode);
    if (mode === "plain")
        return `${e}${chr}`;
    const cmd = ACCENT_LATEX[chr] ?? "\\hat";
    return `${cmd}{${e}}`;
}
function convertBar(node, mode) {
    const pos = mathVal(findByLocalName(findByLocalName(node, "barPr"), "pos"));
    const e = convertNamed(node, "e", mode);
    if (mode === "plain")
        return e;
    return pos === "bot" ? `\\underline{${e}}` : `\\overline{${e}}`;
}
function convertGroupChr(node, mode) {
    const pos = mathVal(findByLocalName(findByLocalName(node, "groupChrPr"), "pos"));
    const e = convertNamed(node, "e", mode);
    if (mode === "plain")
        return e;
    return pos === "bot" ? `\\underbrace{${e}}` : `\\overbrace{${e}}`;
}
function convertLim(node, which, mode) {
    const e = convertNamed(node, "e", mode);
    const lim = convertNamed(node, "lim", mode);
    if (mode === "plain")
        return which === "low" ? `${e}_${lim}` : `${e}^${lim}`;
    return which === "low" ? `\\underset{${lim}}{${e}}` : `\\overset{${lim}}{${e}}`;
}
function convertEqArr(node, mode) {
    const rows = [];
    for (const e of findAllLocal(node, "e"))
        rows.push(convertChildren(e, mode));
    if (mode === "plain")
        return rows.join("; ");
    return `\\begin{aligned}${rows.join("\\\\")}\\end{aligned}`;
}
function convertMatrix(node, mode) {
    const rows = [];
    for (const mr of findAllLocal(node, "mr")) {
        const cells = [];
        for (const e of findAllLocal(mr, "e"))
            cells.push(convertChildren(e, mode));
        rows.push(cells.join(mode === "plain" ? ", " : " & "));
    }
    if (mode === "plain")
        return `[${rows.join("; ")}]`;
    return `\\begin{matrix}${rows.join("\\\\")}\\end{matrix}`;
}
function convertText(raw, mode) {
    const ascii = demathItalic(raw);
    if (mode === "plain")
        return ascii;
    let out = "";
    for (const ch of ascii) {
        const mapped = SYMBOL_LATEX[ch];
        if (mapped)
            out += mapped;
        else if (ch === "{" || ch === "}" || ch === "_" || ch === "^" || ch === "%" || ch === "&" || ch === "#") {
            out += `\\${ch}`;
        }
        else {
            out += ch;
        }
    }
    return out;
}
function nodeText(node) {
    if (!node)
        return "";
    if (typeof node === "string")
        return node;
    const t = node["#text"];
    return typeof t === "string" ? t : "";
}
function mathVal(node) {
    if (!node)
        return undefined;
    const direct = attr(node, "m:val") ?? attr(node, "val");
    if (direct !== undefined)
        return direct;
    for (const k of Object.keys(node)) {
        if (k === "@_val" || k.endsWith(":val")) {
            const v = node[k];
            if (v !== undefined && v !== null && v !== "")
                return String(v);
        }
    }
    return undefined;
}
function isOn(v) {
    return v === "1" || v === "on" || v === "true";
}
function findAllLocal(node, localName) {
    if (!node)
        return [];
    const out = [];
    for (const ref of orderedChildren(node)) {
        if (stripNs(ref.tag) === localName)
            out.push(ref.node);
    }
    return out;
}
function findFirstMathRPr(node) {
    if (!node)
        return undefined;
    const direct = findByLocalName(node, "rPr");
    if (direct)
        return direct;
    for (const ref of orderedChildren(node)) {
        const local = stripNs(ref.tag);
        if (local === "ctrlPr") {
            const rPr = findByLocalName(ref.node, "rPr");
            if (rPr)
                return rPr;
        }
        const nested = findFirstMathRPr(ref.node);
        if (nested)
            return nested;
    }
    return undefined;
}
export function firstMathRunProps(node) {
    return findFirstMathRPr(node);
}
/** Mathematical Alphanumeric Symbols → ASCII，便于转 LaTeX。 */
function demathItalic(s) {
    let out = "";
    for (const ch of s) {
        const cp = ch.codePointAt(0);
        if (cp >= 0x1d400 && cp <= 0x1d419)
            out += String.fromCharCode(65 + (cp - 0x1d400));
        else if (cp >= 0x1d41a && cp <= 0x1d433)
            out += String.fromCharCode(97 + (cp - 0x1d41a));
        else if (cp >= 0x1d434 && cp <= 0x1d44d)
            out += String.fromCharCode(65 + (cp - 0x1d434));
        else if (cp >= 0x1d44e && cp <= 0x1d467) {
            const i = cp - 0x1d44e;
            out += i === 7 ? "h" : String.fromCharCode(97 + i);
        }
        else if (cp === 0x210e)
            out += "h";
        else if (cp >= 0x1d6e2 && cp <= 0x1d6fa) {
            const i = cp - 0x1d6e2;
            out += String.fromCodePoint(0x0391 + i + (i >= 17 ? 1 : 0));
        }
        else if (cp >= 0x1d6fc && cp <= 0x1d714) {
            out += String.fromCodePoint(0x03b1 + (cp - 0x1d6fc));
        }
        else if (cp >= 0x1d468 && cp <= 0x1d481)
            out += String.fromCharCode(65 + (cp - 0x1d468));
        else if (cp >= 0x1d482 && cp <= 0x1d49b)
            out += String.fromCharCode(97 + (cp - 0x1d482));
        else if (cp >= 0x1d49c && cp <= 0x1d4b5)
            out += String.fromCharCode(65 + Math.min(cp - 0x1d49c, 25));
        else if (cp >= 0x1d4b6 && cp <= 0x1d4cf)
            out += String.fromCharCode(97 + Math.min(cp - 0x1d4b6, 25));
        else
            out += ch;
    }
    return out;
}
const LATEX_FUNCS = new Set([
    "sin",
    "cos",
    "tan",
    "cot",
    "sec",
    "csc",
    "log",
    "ln",
    "exp",
    "lim",
    "max",
    "min",
    "det",
    "gcd",
    "sinh",
    "cosh",
    "tanh",
    "arcsin",
    "arccos",
    "arctan",
]);
const ACCENT_LATEX = {
    "\u0302": "\\hat",
    "^": "\\hat",
    "\u0303": "\\tilde",
    "~": "\\tilde",
    "\u0304": "\\bar",
    "\u0307": "\\dot",
    "\u0308": "\\ddot",
    "\u0301": "\\acute",
    "\u0300": "\\grave",
    "\u20d7": "\\vec",
};
const SYMBOL_LATEX = {
    "π": "\\pi ",
    "𝜋": "\\pi ",
    "∞": "\\infty ",
    "∑": "\\sum ",
    "∏": "\\prod ",
    "∫": "\\int ",
    "α": "\\alpha ",
    "β": "\\beta ",
    "γ": "\\gamma ",
    "δ": "\\delta ",
    "ε": "\\varepsilon ",
    "θ": "\\theta ",
    "λ": "\\lambda ",
    "μ": "\\mu ",
    "σ": "\\sigma ",
    "φ": "\\varphi ",
    "ω": "\\omega ",
    "Δ": "\\Delta ",
    "Σ": "\\Sigma ",
    "Ω": "\\Omega ",
    "±": "\\pm ",
    "∓": "\\mp ",
    "×": "\\times ",
    "÷": "\\div ",
    "·": "\\cdot ",
    "≤": "\\leq ",
    "≥": "\\geq ",
    "≠": "\\neq ",
    "≈": "\\approx ",
    "≡": "\\equiv ",
    "∈": "\\in ",
    "∉": "\\notin ",
    "⊂": "\\subset ",
    "→": "\\rightarrow ",
    "⇒": "\\Rightarrow ",
    "↔": "\\leftrightarrow ",
    "…": "\\ldots ",
    "∂": "\\partial ",
    "∇": "\\nabla ",
};
