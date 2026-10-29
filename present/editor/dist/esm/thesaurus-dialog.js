import { bindEditorModal } from "./dialog.js";
import { t } from "./i18n/index.js";
import { DIALOG_OVERLAY_CSS } from "./ui-style.js";
const LOCAL_SYNONYMS = {
    good: ["great", "fine", "excellent"],
    bad: ["poor", "awful", "inferior"],
    big: ["large", "huge", "vast"],
    small: ["little", "tiny", "slight"],
    fast: ["quick", "rapid", "swift"],
    slow: ["sluggish", "gradual"],
    important: ["significant", "key", "crucial"],
    start: ["begin", "commence"],
    end: ["finish", "conclude"],
    increase: ["growth", "rise", "gain"],
    decrease: ["drop", "decline", "reduction"],
    好: ["优良", "不错", "出色"],
    重要: ["关键", "主要", "核心"],
    开始: ["启动", "着手"],
    结束: ["完成", "终止"],
    增长: ["上升", "提高", "增加"],
    下降: ["减少", "降低", "回落"],
    问题: ["议题", "困难", "挑战"],
    方案: ["办法", "思路", "对策"],
};
const LOCAL_ANTONYMS = {
    good: ["bad", "poor"],
    bad: ["good"],
    big: ["small"],
    small: ["big"],
    fast: ["slow"],
    slow: ["fast"],
    increase: ["decrease"],
    decrease: ["increase"],
    start: ["end"],
    end: ["start"],
    好: ["差"],
    增长: ["下降"],
    下降: ["增长"],
    开始: ["结束"],
    结束: ["开始"],
};
function localWords(table, word) {
    const q = word.trim();
    if (!q)
        return [];
    return table[q] ?? table[q.toLowerCase()] ?? [];
}
export async function fetchSynonyms(word) {
    const q = word.trim();
    if (!q)
        return [];
    const local = localWords(LOCAL_SYNONYMS, q);
    try {
        const url = `https://api.datamuse.com/words?rel_syn=${encodeURIComponent(q)}&max=20`;
        const res = await fetch(url);
        if (!res.ok)
            throw new Error(t("thesaurus.fetchFailed"));
        const data = (await res.json());
        const remote = data.map((d) => d.word).filter((w) => w.toLowerCase() !== q.toLowerCase());
        return remote.length ? remote : local;
    }
    catch (err) {
        if (local.length)
            return local;
        throw err instanceof Error ? err : new Error(t("thesaurus.fetchFailed"));
    }
}
export async function fetchRelatedWords(word) {
    const q = word.trim();
    if (!q)
        return [];
    const url = `https://api.datamuse.com/words?rel_trg=${encodeURIComponent(q)}&max=15`;
    const res = await fetch(url);
    if (!res.ok)
        return [];
    const data = (await res.json());
    return data.map((d) => d.word).filter((w) => w.toLowerCase() !== q.toLowerCase());
}
export async function fetchAntonyms(word) {
    const q = word.trim();
    if (!q)
        return [];
    const local = localWords(LOCAL_ANTONYMS, q);
    try {
        const url = `https://api.datamuse.com/words?rel_ant=${encodeURIComponent(q)}&max=12`;
        const res = await fetch(url);
        if (!res.ok)
            return local;
        const data = (await res.json());
        const remote = data.map((d) => d.word).filter((w) => w.toLowerCase() !== q.toLowerCase());
        return remote.length ? remote : local;
    }
    catch {
        return local;
    }
}
export function openThesaurusDialog(doc, initialWord, onPick) {
    const overlay = doc.createElement("div");
    overlay.className = "local-picker-overlay";
    overlay.style.cssText =
        DIALOG_OVERLAY_CSS;
    const modal = doc.createElement("div");
    modal.style.cssText =
        "background:var(--popover);color:var(--popover-foreground);border:1px solid var(--border);border-radius:var(--radius-modal,12px);box-shadow:var(--shadow-lg);padding:16px 18px;width:min(420px,92vw);display:flex;flex-direction:column;gap:10px";
    const title = doc.createElement("h3");
    title.style.margin = "0";
    title.textContent = t("thesaurus.title");
    modal.appendChild(title);
    const row = doc.createElement("div");
    row.style.cssText = "display:flex;gap:8px";
    const input = doc.createElement("input");
    input.type = "text";
    input.value = initialWord;
    input.style.cssText =
        "flex:1;background:var(--background);color:inherit;border:1px solid var(--border);border-radius:4px;padding:6px 8px;font:inherit";
    const lookupBtn = doc.createElement("button");
    lookupBtn.type = "button";
    lookupBtn.textContent = t("thesaurus.lookup");
    lookupBtn.style.cssText =
        "background:var(--primary);color:var(--primary-foreground);border:none;border-radius:4px;padding:6px 12px;cursor:pointer;font:inherit";
    row.append(input, lookupBtn);
    modal.appendChild(row);
    const status = doc.createElement("div");
    status.style.cssText = "font-size:12px;color:var(--muted-foreground,#a1a1aa)";
    modal.appendChild(status);
    const list = doc.createElement("div");
    list.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;max-height:200px;overflow:auto";
    modal.appendChild(list);
    let modalDismiss;
    const close = () => {
        modalDismiss?.release();
        overlay.remove();
    };
    const renderList = (words, related, antonyms) => {
        list.replaceChildren();
        if (!words.length && !related.length && !antonyms.length) {
            status.textContent = t("thesaurus.none");
            return;
        }
        status.textContent = t("thesaurus.hint");
        const addChip = (w) => {
            const b = doc.createElement("button");
            b.type = "button";
            b.textContent = w;
            b.style.cssText =
                "background:var(--secondary);border:1px solid var(--border);border-radius:4px;padding:4px 10px;cursor:pointer;font:inherit;font-size:12px";
            b.addEventListener("click", () => {
                onPick(w);
                close();
            });
            list.appendChild(b);
        };
        if (words.length) {
            const synHead = doc.createElement("div");
            synHead.style.cssText = "width:100%;font-size:11px;color:var(--muted-foreground);margin-bottom:2px";
            synHead.textContent = t("thesaurus.synonyms");
            list.appendChild(synHead);
            for (const w of words)
                addChip(w);
        }
        if (antonyms.length) {
            const antHead = doc.createElement("div");
            antHead.style.cssText = "width:100%;font-size:11px;color:var(--muted-foreground);margin:8px 0 2px";
            antHead.textContent = t("thesaurus.antonyms");
            list.appendChild(antHead);
            for (const w of antonyms)
                addChip(w);
        }
        if (related.length) {
            const relHead = doc.createElement("div");
            relHead.style.cssText = "width:100%;font-size:11px;color:var(--muted-foreground);margin:8px 0 2px";
            relHead.textContent = t("thesaurus.related");
            list.appendChild(relHead);
            for (const w of related)
                addChip(w);
        }
    };
    const runLookup = async () => {
        const w = input.value.trim();
        if (!w)
            return;
        status.textContent = t("thesaurus.loading");
        list.replaceChildren();
        try {
            const [synonyms, related, antonyms] = await Promise.all([
                fetchSynonyms(w),
                fetchRelatedWords(w),
                fetchAntonyms(w),
            ]);
            renderList(synonyms, related, antonyms);
        }
        catch (e) {
            status.textContent = e instanceof Error ? e.message : t("thesaurus.fetchFailed");
        }
    };
    lookupBtn.addEventListener("click", () => void runLookup());
    const footer = doc.createElement("div");
    footer.style.cssText = "display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap";
    const copyBtn = doc.createElement("button");
    copyBtn.type = "button";
    copyBtn.textContent = t("thesaurus.copyWord");
    copyBtn.style.cssText =
        "background:var(--secondary);color:var(--foreground);border:1px solid var(--border);border-radius:var(--radius-sm,6px);padding:6px 12px;cursor:pointer;font:inherit";
    copyBtn.addEventListener("click", async () => {
        const w = input.value.trim();
        if (!w)
            return;
        try {
            await navigator.clipboard.writeText(w);
            copyBtn.textContent = t("thesaurus.copied");
            setTimeout(() => {
                copyBtn.textContent = t("thesaurus.copyWord");
            }, 1500);
        }
        catch {
            copyBtn.textContent = t("thesaurus.copyFailed");
        }
    });
    footer.appendChild(copyBtn);
    const cancel = doc.createElement("button");
    cancel.type = "button";
    cancel.textContent = t("thesaurus.close");
    cancel.style.cssText =
        "background:var(--secondary);color:var(--foreground);border:1px solid var(--border);border-radius:var(--radius-sm,6px);padding:6px 12px;cursor:pointer;font:inherit";
    cancel.addEventListener("click", close);
    footer.appendChild(cancel);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    modalDismiss = bindEditorModal({
        doc,
        overlay,
        panel: modal,
        onCancel: close,
        onSubmit: () => {
            void runLookup();
        },
    });
    doc.body.appendChild(overlay);
    input.focus();
    if (initialWord.trim())
        void runLookup();
}
