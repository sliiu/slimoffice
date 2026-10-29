// LaTeX → OMML（ECMA-376 Part 1 §22.1）。插入公式 / from-scratch 导出时写 Choice 用。
// 覆盖 KaTeX 对话框的常用子集；解析失败时返回空串，调用方退回纯图片。
import { esc } from "./xml-util.js";
export function latexToOmmlInner(latex) {
    const src = latex.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
    if (!src)
        return "";
    const p = new Parser(src);
    const ast = p.parseExpr();
    if (p.failed)
        return "";
    return astToOmml(ast);
}
export function latexToOMathPara(latex) {
    const inner = latexToOmmlInner(latex);
    if (!inner)
        return "";
    return `<m:oMathPara xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><m:oMathParaPr><m:jc m:val="centerGroup"/></m:oMathParaPr><m:oMath>${inner}</m:oMath></m:oMathPara>`;
}
class Parser {
    s;
    i = 0;
    failed = false;
    constructor(s) {
        this.s = s;
    }
    peek() {
        return this.s[this.i] ?? "";
    }
    rest() {
        return this.s.slice(this.i);
    }
    eat(ch) {
        if (this.s.startsWith(ch, this.i)) {
            this.i += ch.length;
            return true;
        }
        return false;
    }
    skipSpace() {
        while (this.i < this.s.length && /\s/.test(this.s[this.i]))
            this.i++;
    }
    parseExpr() {
        const kids = [];
        this.skipSpace();
        while (this.i < this.s.length && this.peek() !== "}" && !this.rest().startsWith("\\right")) {
            kids.push(this.parsePostfix());
            this.skipSpace();
        }
        if (kids.length === 0)
            return { kind: "text", text: "" };
        if (kids.length === 1)
            return kids[0];
        return { kind: "row", kids };
    }
    parsePostfix() {
        let atom = this.parseAtom();
        let sub;
        let sup;
        for (;;) {
            this.skipSpace();
            if (this.eat("_"))
                sub = this.parseGroupOrAtom();
            else if (this.eat("^"))
                sup = this.parseGroupOrAtom();
            else
                break;
        }
        if (atom.kind === "nary") {
            const empty = { kind: "text", text: "" };
            const body = this.i < this.s.length && this.peek() !== "}" && !this.rest().startsWith("\\right")
                ? this.parsePostfix()
                : empty;
            return { kind: "nary", chr: atom.chr, sub: sub ?? atom.sub, sup: sup ?? atom.sup, body };
        }
        if (sub && sup)
            return { kind: "subsup", base: atom, sub, sup };
        if (sub)
            return { kind: "sub", base: atom, sub };
        if (sup)
            return { kind: "sup", base: atom, sup };
        return atom;
    }
    parseGroupOrAtom() {
        this.skipSpace();
        if (this.eat("{")) {
            const e = this.parseExpr();
            if (!this.eat("}"))
                this.failed = true;
            return e;
        }
        return this.parseAtom();
    }
    parseAtom() {
        this.skipSpace();
        if (this.eat("{")) {
            const e = this.parseExpr();
            if (!this.eat("}"))
                this.failed = true;
            return e;
        }
        if (this.eat("\\left")) {
            const beg = this.parseDelimToken();
            const body = this.parseExpr();
            if (!this.eat("\\right"))
                this.failed = true;
            const end = this.parseDelimToken();
            return { kind: "delim", beg, end, body };
        }
        if (this.peek() === "\\") {
            const cmd = this.parseCommand();
            return this.commandAtom(cmd);
        }
        const ch = this.peek();
        if (!ch) {
            this.failed = true;
            return { kind: "text", text: "" };
        }
        this.i++;
        return { kind: "text", text: ch, italic: /[A-Za-z]/.test(ch) };
    }
    parseCommand() {
        this.eat("\\");
        if (/[^A-Za-z]/.test(this.peek())) {
            const ch = this.peek();
            this.i++;
            return ch;
        }
        let cmd = "";
        while (/[A-Za-z]/.test(this.peek())) {
            cmd += this.peek();
            this.i++;
        }
        this.skipSpace();
        return cmd;
    }
    parseDelimToken() {
        this.skipSpace();
        if (this.eat("\\")) {
            if (/[^A-Za-z]/.test(this.peek())) {
                const ch = this.peek();
                this.i++;
                return ch;
            }
            const cmd = this.parseCommand();
            if (cmd === "langle")
                return "⟨";
            if (cmd === "rangle")
                return "⟩";
            if (cmd === "lvert" || cmd === "rvert" || cmd === "vert")
                return "|";
            if (cmd === "lVert" || cmd === "rVert" || cmd === "Vert")
                return "‖";
            return cmd;
        }
        if (this.eat("."))
            return ".";
        const ch = this.peek();
        this.i++;
        return ch || ".";
    }
    commandAtom(cmd) {
        if (cmd === "frac") {
            return { kind: "frac", num: this.parseGroupOrAtom(), den: this.parseGroupOrAtom() };
        }
        if (cmd === "sqrt") {
            let deg;
            this.skipSpace();
            if (this.eat("[")) {
                const d = this.parseExpr();
                if (!this.eat("]"))
                    this.failed = true;
                deg = d;
            }
            return { kind: "sqrt", deg, body: this.parseGroupOrAtom() };
        }
        if (cmd === "sum" || cmd === "prod" || cmd === "int" || cmd === "iint" || cmd === "oint") {
            return { kind: "nary", chr: NARY_CHR[cmd] ?? "∫", body: { kind: "text", text: "" } };
        }
        if (cmd === "text" || cmd === "mathrm" || cmd === "textrm" || cmd === "operatorname") {
            const inner = this.parseGroupOrAtom();
            return { kind: "text", text: astPlain(inner), italic: false };
        }
        if (LATEX_FUNCS.has(cmd)) {
            return { kind: "func", name: cmd, arg: this.parseGroupOrAtom() };
        }
        if (cmd === "," || cmd === ";" || cmd === "!" || cmd === " " || cmd === "quad" || cmd === "qquad") {
            return { kind: "text", text: cmd === "quad" || cmd === "qquad" ? " " : "" };
        }
        const sym = SYMBOLS[cmd];
        if (sym)
            return { kind: "text", text: sym, italic: false };
        if (cmd.length === 1)
            return { kind: "text", text: cmd, italic: false };
        return { kind: "text", text: cmd, italic: true };
    }
}
function astPlain(n) {
    switch (n.kind) {
        case "row":
            return n.kids.map(astPlain).join("");
        case "text":
            return n.text;
        default:
            return "";
    }
}
const NARY_CHR = {
    sum: "∑",
    prod: "∏",
    int: "∫",
    iint: "∬",
    oint: "∮",
};
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
const SYMBOLS = {
    pi: "π",
    infty: "∞",
    alpha: "α",
    beta: "β",
    gamma: "γ",
    delta: "δ",
    epsilon: "ε",
    theta: "θ",
    lambda: "λ",
    mu: "μ",
    sigma: "σ",
    phi: "φ",
    omega: "ω",
    Delta: "Δ",
    Sigma: "Σ",
    Omega: "Ω",
    pm: "±",
    mp: "∓",
    times: "×",
    div: "÷",
    cdot: "·",
    leq: "≤",
    geq: "≥",
    neq: "≠",
    approx: "≈",
    equiv: "≡",
    in: "∈",
    notin: "∉",
    subset: "⊂",
    to: "→",
    rightarrow: "→",
    Leftarrow: "⇐",
    Rightarrow: "⇒",
    leftrightarrow: "↔",
    ldots: "…",
    cdots: "⋯",
    partial: "∂",
    nabla: "∇",
    ell: "ℓ",
};
const MATH_RPR = `<a:rPr lang="en-US" i="1"><a:latin typeface="Cambria Math" charset="0"/></a:rPr>`;
const TEXT_RPR = `<a:rPr lang="en-US"><a:latin typeface="Cambria Math" charset="0"/></a:rPr>`;
function run(text, italic = true) {
    if (!text)
        return "";
    return `<m:r>${italic ? MATH_RPR : TEXT_RPR}<m:t xml:space="preserve">${esc(text)}</m:t></m:r>`;
}
function astToOmml(n) {
    switch (n.kind) {
        case "row":
            return n.kids.map(astToOmml).join("");
        case "text":
            return run(n.text, n.italic !== false);
        case "frac":
            return `<m:f><m:num>${astToOmml(n.num)}</m:num><m:den>${astToOmml(n.den)}</m:den></m:f>`;
        case "sub":
            return `<m:sSub><m:e>${astToOmml(n.base)}</m:e><m:sub>${astToOmml(n.sub)}</m:sub></m:sSub>`;
        case "sup":
            return `<m:sSup><m:e>${astToOmml(n.base)}</m:e><m:sup>${astToOmml(n.sup)}</m:sup></m:sSup>`;
        case "subsup":
            return `<m:sSubSup><m:e>${astToOmml(n.base)}</m:e><m:sub>${astToOmml(n.sub)}</m:sub><m:sup>${astToOmml(n.sup)}</m:sup></m:sSubSup>`;
        case "nary": {
            const sub = n.sub ? `<m:sub>${astToOmml(n.sub)}</m:sub>` : "<m:sub/>";
            const sup = n.sup ? `<m:sup>${astToOmml(n.sup)}</m:sup>` : "<m:sup/>";
            return `<m:nary><m:naryPr><m:chr m:val="${esc(n.chr)}"/><m:limLoc m:val="undOvr"/></m:naryPr>${sub}${sup}<m:e>${astToOmml(n.body)}</m:e></m:nary>`;
        }
        case "sqrt":
            return n.deg
                ? `<m:rad><m:deg>${astToOmml(n.deg)}</m:deg><m:e>${astToOmml(n.body)}</m:e></m:rad>`
                : `<m:rad><m:deg/><m:e>${astToOmml(n.body)}</m:e></m:rad>`;
        case "delim":
            return `<m:d><m:dPr><m:begChr m:val="${esc(n.beg)}"/><m:endChr m:val="${esc(n.end)}"/></m:dPr><m:e>${astToOmml(n.body)}</m:e></m:d>`;
        case "func":
            return `<m:func><m:fName>${run(n.name, false)}</m:fName><m:e>${astToOmml(n.arg)}</m:e></m:func>`;
    }
}
