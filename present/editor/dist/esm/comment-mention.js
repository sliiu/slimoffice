// 批注里的 @。@ai 标成交办提及；本文档里写过批注的人可以点名。
import { t } from "./i18n/index.js";
const AI_MENTION = /@ai(?![A-Za-z0-9_])/i;
/** 本文档里写过批注的人。同名只留第一次出现的写法，助手作者 AI 不算人。 */
export function commentParticipants(authors) {
    const out = [];
    const seen = new Set();
    for (const raw of authors) {
        const name = raw.trim();
        if (!name || /^ai$/i.test(name))
            continue;
        const key = name.toLowerCase();
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push(name);
    }
    return out;
}
/** `@` 后面正在输入的那段。邮箱里的 @ 不算。 */
export function commentMentionQuery(value, caret) {
    const before = value.slice(0, caret);
    const at = before.lastIndexOf("@");
    if (at < 0)
        return null;
    if (at > 0 && /[A-Za-z0-9_]/.test(before[at - 1]))
        return null;
    const query = before.slice(at + 1);
    if (query.includes("\n"))
        return null;
    return { start: at, query };
}
export function commentMentionOptions(query, authors) {
    const people = commentParticipants(authors);
    const all = [
        { kind: "ai", token: "ai" },
        ...people.map((name) => ({ kind: "person", token: name })),
    ];
    const q = query.toLowerCase();
    if (!q)
        return all;
    return all.filter((item) => item.token.toLowerCase().startsWith(q));
}
function boundaryAfter(text, end) {
    if (end >= text.length)
        return true;
    return /[\s,.;:!?，。！？、）)」』"]/u.test(text[end]);
}
/** 把正文拆成普通文字和提及。人名按本文档的参与者来认，长名字优先。 */
export function splitCommentMentions(text, authors = []) {
    const names = commentParticipants(authors).slice().sort((a, b) => b.length - a.length);
    const out = [];
    let last = 0;
    let i = 0;
    while (i < text.length) {
        if (text[i] !== "@") {
            i += 1;
            continue;
        }
        if (i > 0 && /[A-Za-z0-9_]/.test(text[i - 1])) {
            i += 1;
            continue;
        }
        const rest = text.slice(i);
        const ai = AI_MENTION.exec(rest);
        AI_MENTION.lastIndex = 0;
        if (ai && ai.index === 0) {
            if (i > last)
                out.push({ kind: "text", text: text.slice(last, i) });
            out.push({ kind: "mention", who: "ai", text: rest.slice(0, ai[0].length) });
            i += ai[0].length;
            last = i;
            continue;
        }
        const person = names.find((name) => rest.startsWith(`@${name}`) && boundaryAfter(rest, name.length + 1));
        if (person) {
            if (i > last)
                out.push({ kind: "text", text: text.slice(last, i) });
            const token = `@${person}`;
            out.push({ kind: "mention", who: "person", text: token });
            i += token.length;
            last = i;
            continue;
        }
        i += 1;
    }
    if (last < text.length)
        out.push({ kind: "text", text: text.slice(last) });
    if (out.length === 0 && text)
        out.push({ kind: "text", text });
    return out;
}
export function commentMentionsAi(text) {
    return splitCommentMentions(text).some((part) => part.who === "ai");
}
export function appendCommentText(parent, text, authors = []) {
    const doc = parent.ownerDocument;
    for (const part of splitCommentMentions(text, authors)) {
        if (part.kind === "mention") {
            const chip = doc.createElement("span");
            chip.className = part.who === "person" ? "ppt-comment-mention ppt-comment-mention-person" : "ppt-comment-mention";
            chip.dataset.mention = part.who ?? "ai";
            chip.textContent = part.text;
            chip.title = part.who === "person"
                ? t("comments.mentionPerson", { name: part.text.slice(1) })
                : t("comments.mentionAi");
            parent.appendChild(chip);
        }
        else {
            parent.appendChild(doc.createTextNode(part.text));
        }
    }
}
const fieldsByDoc = new WeakMap();
const hookedDocs = new WeakSet();
function fieldsOf(doc) {
    let set = fieldsByDoc.get(doc);
    if (!set) {
        set = new Set();
        fieldsByDoc.set(doc, set);
    }
    return set;
}
function ensureDocHooks(doc) {
    if (hookedDocs.has(doc))
        return;
    hookedDocs.add(doc);
    doc.addEventListener("keydown", (e) => {
        const set = fieldsOf(doc);
        for (const field of [...set]) {
            if (!field.textarea.isConnected) {
                closeMentionMenu(field);
                set.delete(field);
            }
        }
        if (e.key !== "Escape")
            return;
        const field = [...set].find((item) => item.open && item.textarea === doc.activeElement);
        if (!field)
            return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        closeMentionMenu(field);
    }, true);
}
function closeMentionMenu(field) {
    field.open = false;
    field.menu?.remove();
    field.menu = null;
}
function placeMentionMenu(field) {
    const menu = field.menu;
    const textarea = field.textarea;
    if (!menu)
        return;
    const rect = textarea.getBoundingClientRect();
    const doc = textarea.ownerDocument;
    const viewH = doc.documentElement.clientHeight || 800;
    menu.style.left = `${rect.left}px`;
    menu.style.width = `${Math.max(rect.width, 180)}px`;
    const height = menu.offsetHeight;
    const below = rect.bottom + 4;
    if (below + height > viewH - 8 && rect.top - height - 4 > 8) {
        menu.style.top = `${rect.top - height - 4}px`;
    }
    else {
        menu.style.top = `${below}px`;
    }
}
function chooseMention(field, option) {
    const textarea = field.textarea;
    const caret = textarea.selectionStart ?? textarea.value.length;
    const query = commentMentionQuery(textarea.value, caret);
    if (!query)
        return;
    const insert = `@${option.token} `;
    textarea.value = textarea.value.slice(0, query.start) + insert + textarea.value.slice(caret);
    const pos = query.start + insert.length;
    textarea.setSelectionRange(pos, pos);
    closeMentionMenu(field);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.focus();
}
function syncMentionMenu(field) {
    const textarea = field.textarea;
    const caret = textarea.selectionStart ?? textarea.value.length;
    const query = commentMentionQuery(textarea.value, caret);
    const options = query ? commentMentionOptions(query.query, field.names()) : [];
    if (!query || options.length === 0) {
        closeMentionMenu(field);
        return;
    }
    const doc = textarea.ownerDocument;
    if (!field.menu) {
        const menu = doc.createElement("div");
        menu.className = "ppt-comment-mention-menu";
        menu.setAttribute("role", "listbox");
        menu.addEventListener("mousedown", (e) => e.preventDefault());
        doc.body.appendChild(menu);
        field.menu = menu;
    }
    field.open = true;
    if (field.active >= options.length)
        field.active = 0;
    const menu = field.menu;
    menu.replaceChildren();
    options.forEach((option, index) => {
        const row = doc.createElement("button");
        row.type = "button";
        row.className = "ppt-comment-mention-option" + (index === field.active ? " is-active" : "");
        row.setAttribute("role", "option");
        row.setAttribute("aria-selected", index === field.active ? "true" : "false");
        const chip = doc.createElement("span");
        chip.className = option.kind === "person" ? "ppt-comment-mention ppt-comment-mention-person" : "ppt-comment-mention";
        chip.textContent = `@${option.token}`;
        row.appendChild(chip);
        if (option.kind === "ai") {
            const hint = doc.createElement("span");
            hint.className = "ppt-comment-mention-hint";
            hint.textContent = t("comments.mentionAi");
            row.appendChild(hint);
        }
        row.addEventListener("mouseenter", () => {
            if (field.active === index)
                return;
            field.active = index;
            [...menu.children].forEach((el, i) => {
                el.classList.toggle("is-active", i === index);
                el.setAttribute("aria-selected", i === index ? "true" : "false");
            });
        });
        row.addEventListener("click", () => chooseMention(field, option));
        menu.appendChild(row);
    });
    placeMentionMenu(field);
}
/** 输入框背后铺一层同样的文字。输入 `@` 时在光标旁列出 AI 和本文档的批注参与者。 */
export function bindCommentMentionField(textarea, opts) {
    const doc = textarea.ownerDocument;
    const wrap = doc.createElement("div");
    wrap.className = "ppt-comment-field";
    const back = doc.createElement("div");
    back.className = "ppt-comment-field-back";
    back.setAttribute("aria-hidden", "true");
    textarea.classList.add("ppt-comment-field-input");
    textarea.style.color = "transparent";
    textarea.style.caretColor = "var(--foreground)";
    textarea.style.background = "transparent";
    textarea.style.border = "none";
    textarea.style.font = "inherit";
    textarea.parentNode?.insertBefore(wrap, textarea);
    wrap.append(back, textarea);
    const field = {
        textarea,
        names: opts?.names ?? (() => []),
        menu: null,
        active: 0,
        open: false,
    };
    fieldsOf(doc).add(field);
    ensureDocHooks(doc);
    const paint = () => {
        back.replaceChildren();
        appendCommentText(back, textarea.value, field.names());
        back.scrollTop = textarea.scrollTop;
        syncMentionMenu(field);
    };
    textarea.addEventListener("input", paint);
    textarea.addEventListener("keyup", paint);
    textarea.addEventListener("click", paint);
    textarea.addEventListener("scroll", () => {
        back.scrollTop = textarea.scrollTop;
        if (field.open)
            placeMentionMenu(field);
    });
    textarea.addEventListener("blur", () => closeMentionMenu(field));
    textarea.addEventListener("keydown", (e) => {
        if (!field.open || !field.menu)
            return;
        const count = field.menu.children.length;
        if (e.key === "ArrowDown") {
            e.preventDefault();
            field.active = (field.active + 1) % count;
            syncMentionMenu(field);
            return;
        }
        if (e.key === "ArrowUp") {
            e.preventDefault();
            field.active = (field.active - 1 + count) % count;
            syncMentionMenu(field);
            return;
        }
        if (e.key === "Enter" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.isComposing) {
            const option = commentMentionOptions(commentMentionQuery(textarea.value, textarea.selectionStart ?? textarea.value.length)?.query ?? "", field.names())[field.active];
            if (!option)
                return;
            e.preventDefault();
            e.stopPropagation();
            chooseMention(field, option);
        }
    });
    paint();
}
