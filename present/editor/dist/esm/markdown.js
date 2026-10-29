// 备注面板用的极简 Markdown → HTML 渲染器。
// ----------------------------------------------------------------------------
// 目标：覆盖演讲备注最常用的基础语法（标题 / 粗斜体 / 行内代码 / 列表 / 引用 /
// 链接 / 分隔线 / 段落换行），并且**先转义 HTML 再套语法**，避免备注里写的尖括号
// 被当成标签注入（备注是用户自己的文本，风险低，但仍按 XSS 安全处理）。
//
// 不追求完整 CommonMark：不做嵌套列表 / 表格 / 代码块围栏的复杂场景，够用即可。
function escapeHtml(s) {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
// 行内语法：在已转义的文本上套用。顺序：代码 → 链接 → 粗 → 斜。
// 行内代码先抽出占位，避免其内部的 * _ 被误解析。
function renderInline(escaped) {
    const codes = [];
    let s = escaped.replace(/`([^`]+?)`/g, (_m, code) => {
        codes.push(code);
        return `\u0000${codes.length - 1}\u0000`;
    });
    // 链接 [text](url) —— 仅允许 http(s) / mailto，其余丢弃 href 防注入。
    s = s.replace(/\[([^\]]+?)\]\(([^)\s]+?)\)/g, (_m, text, url) => {
        const safe = /^(https?:\/\/|mailto:)/i.test(url) ? url : "#";
        return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    });
    s = s.replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/__([^_]+?)__/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*])\*([^*]+?)\*(?!\*)/g, "$1<em>$2</em>");
    s = s.replace(/(^|[^_])_([^_]+?)_(?!_)/g, "$1<em>$2</em>");
    // 还原行内代码占位。
    s = s.replace(/\u0000(\d+)\u0000/g, (_m, i) => `<code>${codes[Number(i)] ?? ""}</code>`);
    return s;
}
export function renderMarkdown(src) {
    const lines = src.replace(/\r\n?/g, "\n").split("\n");
    const out = [];
    let listKind = null;
    let paragraph = [];
    const closeList = () => {
        if (listKind) {
            out.push(`</${listKind}>`);
            listKind = null;
        }
    };
    const flushParagraph = () => {
        if (paragraph.length > 0) {
            out.push(`<p>${paragraph.join("<br>")}</p>`);
            paragraph = [];
        }
    };
    for (const rawLine of lines) {
        const line = rawLine;
        const trimmed = line.trim();
        if (trimmed === "") {
            flushParagraph();
            closeList();
            continue;
        }
        // 分隔线
        if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
            flushParagraph();
            closeList();
            out.push("<hr>");
            continue;
        }
        // 标题
        const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
        if (heading) {
            flushParagraph();
            closeList();
            const level = heading[1].length;
            out.push(`<h${level}>${renderInline(escapeHtml(heading[2]))}</h${level}>`);
            continue;
        }
        // 引用
        const quote = /^>\s?(.*)$/.exec(trimmed);
        if (quote) {
            flushParagraph();
            closeList();
            out.push(`<blockquote>${renderInline(escapeHtml(quote[1]))}</blockquote>`);
            continue;
        }
        // 有序列表
        const ol = /^\d+\.\s+(.*)$/.exec(trimmed);
        if (ol) {
            flushParagraph();
            if (listKind !== "ol") {
                closeList();
                out.push("<ol>");
                listKind = "ol";
            }
            out.push(`<li>${renderInline(escapeHtml(ol[1]))}</li>`);
            continue;
        }
        // 无序列表
        const ul = /^[-*+]\s+(.*)$/.exec(trimmed);
        if (ul) {
            flushParagraph();
            if (listKind !== "ul") {
                closeList();
                out.push("<ul>");
                listKind = "ul";
            }
            out.push(`<li>${renderInline(escapeHtml(ul[1]))}</li>`);
            continue;
        }
        // 普通段落（连续非空行合并，行内用 <br>）
        closeList();
        paragraph.push(renderInline(escapeHtml(trimmed)));
    }
    flushParagraph();
    closeList();
    return out.join("\n");
}
