import { bindEditorModal } from "./dialog";
import { t } from "./i18n";
import { fetchAntonyms, fetchSynonyms } from "./thesaurus-dialog";
import {
  DIALOG_BTN_PRIMARY_CSS,
  DIALOG_BTN_SECONDARY_CSS,
  DIALOG_INPUT_CSS,
  DIALOG_MODAL_BASE_CSS,
  DIALOG_OVERLAY_CSS,
} from "./ui-style";

export interface LookupMeaning {
  partOfSpeech: string;
  definition: string;
  example?: string;
}

export interface SmartLookupResult {
  word: string;
  phonetic?: string;
  meanings: LookupMeaning[];
  wiki?: { title: string; extract: string; url: string };
}

interface DictionaryApiEntry {
  word?: string;
  phonetic?: string;
  meanings?: Array<{
    partOfSpeech?: string;
    definitions?: Array<{ definition?: string; example?: string }>;
  }>;
}

async function fetchDictionaryEn(word: string): Promise<LookupMeaning[]> {
  const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = (await res.json()) as DictionaryApiEntry[];
  const out: LookupMeaning[] = [];
  for (const entry of data) {
    for (const m of entry.meanings ?? []) {
      for (const d of m.definitions ?? []) {
        const definition = d.definition?.trim();
        if (!definition) continue;
        out.push({
          partOfSpeech: m.partOfSpeech ?? "",
          definition,
          example: d.example?.trim(),
        });
        if (out.length >= 8) return out;
      }
    }
  }
  return out;
}

function wikiLangFromTag(langTag: string): string {
  const t = langTag.toLowerCase();
  if (t.startsWith("zh")) return "zh";
  if (t.startsWith("ja")) return "ja";
  if (t.startsWith("ko")) return "ko";
  if (t.startsWith("fr")) return "fr";
  if (t.startsWith("de")) return "de";
  if (t.startsWith("es")) return "es";
  if (t.startsWith("pt")) return "pt";
  return "en";
}

async function fetchWikiSummary(
  word: string,
  langTag: string,
): Promise<SmartLookupResult["wiki"] | undefined> {
  const lang = wikiLangFromTag(langTag);
  const title = encodeURIComponent(word.trim().replace(/\s+/g, "_"));
  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${title}`;
  const res = await fetch(url);
  if (!res.ok) return undefined;
  const data = (await res.json()) as {
    title?: string;
    extract?: string;
    content_urls?: { desktop?: { page?: string } };
  };
  const extract = data.extract?.trim();
  if (!extract) return undefined;
  return {
    title: data.title ?? word,
    extract,
    url: data.content_urls?.desktop?.page ?? `https://${lang}.wikipedia.org/wiki/${title}`,
  };
}

export async function fetchSmartLookup(word: string, langTag: string): Promise<SmartLookupResult> {
  const q = word.trim();
  if (!q) throw new Error(t("smartLookup.needWord"));
  const isEn = langTag.toLowerCase().startsWith("en");
  const [meanings, wiki] = await Promise.all([
    isEn ? fetchDictionaryEn(q) : Promise.resolve([]),
    fetchWikiSummary(q, langTag),
  ]);
  let phonetic: string | undefined;
  if (isEn) {
    try {
      const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(q)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = (await res.json()) as DictionaryApiEntry[];
        phonetic = data[0]?.phonetic;
      }
    } catch {
      // ignore
    }
  }
  if (!meanings.length && !wiki) throw new Error(t("smartLookup.none"));
  return { word: q, phonetic, meanings, wiki };
}

export function openSmartLookupDialog(
  doc: Document,
  initialWord: string,
  langTag: string,
): void {
  const overlay = doc.createElement("div");
  overlay.className = "local-picker-overlay";
  overlay.style.cssText = DIALOG_OVERLAY_CSS;

  const modal = doc.createElement("div");
  modal.style.cssText =
    DIALOG_MODAL_BASE_CSS +
    ";width:min(520px,92vw);max-height:min(80vh,640px)";

  const title = doc.createElement("h3");
  title.style.margin = "0";
  title.textContent = t("smartLookup.title");
  modal.appendChild(title);

  const row = doc.createElement("div");
  row.style.cssText = "display:flex;gap:8px";
  const input = doc.createElement("input");
  input.type = "text";
  input.value = initialWord;
  input.style.cssText = "flex:1;" + DIALOG_INPUT_CSS;
  const lookupBtn = doc.createElement("button");
  lookupBtn.type = "button";
  lookupBtn.textContent = t("smartLookup.lookup");
  lookupBtn.style.cssText = DIALOG_BTN_PRIMARY_CSS;
  row.append(input, lookupBtn);
  modal.appendChild(row);

  const status = doc.createElement("div");
  status.style.cssText = "font-size:12px;color:var(--muted-foreground,#a1a1aa)";
  modal.appendChild(status);

  const body = doc.createElement("div");
  body.style.cssText = "overflow:auto;max-height:min(50vh,400px);display:flex;flex-direction:column;gap:10px;font-size:13px;line-height:1.45";
  modal.appendChild(body);

  let modalDismiss: { release: () => void } | undefined;
  const close = (): void => {
    modalDismiss?.release();
    overlay.remove();
  };

  const render = (result: SmartLookupResult): void => {
    body.replaceChildren();
    if (result.phonetic) {
      const ph = doc.createElement("div");
      ph.style.color = "var(--muted-foreground,#a1a1aa)";
      ph.textContent = result.phonetic;
      body.appendChild(ph);
    }
    for (const m of result.meanings) {
      const block = doc.createElement("div");
      if (m.partOfSpeech) {
        const pos = doc.createElement("div");
        pos.style.cssText = "font-size:11px;text-transform:uppercase;color:var(--muted-foreground);margin-bottom:2px";
        pos.textContent = m.partOfSpeech;
        block.appendChild(pos);
      }
      const def = doc.createElement("div");
      def.textContent = m.definition;
      block.appendChild(def);
      if (m.example) {
        const ex = doc.createElement("div");
        ex.style.cssText = "font-size:12px;color:var(--muted-foreground);font-style:italic;margin-top:2px";
        ex.textContent = `"${m.example}"`;
        block.appendChild(ex);
      }
      body.appendChild(block);
    }
    if (result.wiki) {
      const wiki = doc.createElement("div");
      wiki.style.cssText = "border-top:1px solid var(--border);padding-top:8px";
      const h = doc.createElement("div");
      h.style.fontWeight = "600";
      h.textContent = result.wiki.title;
      wiki.appendChild(h);
      const p = doc.createElement("p");
      p.style.margin = "4px 0";
      p.textContent = result.wiki.extract;
      wiki.appendChild(p);
      const link = doc.createElement("a");
      link.href = result.wiki.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = t("smartLookup.openWiki");
      link.style.color = "var(--primary,#3b82f6)";
      wiki.appendChild(link);
      body.appendChild(wiki);
    }
    const search = doc.createElement("a");
    search.href = `https://www.google.com/search?q=${encodeURIComponent(`define ${result.word}`)}`;
    search.target = "_blank";
    search.rel = "noopener noreferrer";
    search.textContent = t("smartLookup.webSearch");
    search.style.cssText = "font-size:12px;color:var(--primary,#3b82f6)";
    body.appendChild(search);
    status.textContent = "";
    void appendSynonyms(result.word);
    void appendAntonyms(result.word);
  };

  const appendAntonyms = async (word: string): Promise<void> => {
    if (!langTag.toLowerCase().startsWith("en")) return;
    try {
      const ants = await fetchAntonyms(word);
      if (!ants.length) return;
      const block = doc.createElement("div");
      block.style.cssText = "border-top:1px solid var(--border);padding-top:8px;margin-top:4px";
      const h = doc.createElement("div");
      h.style.cssText = "font-size:11px;color:var(--muted-foreground);margin-bottom:4px";
      h.textContent = t("smartLookup.antonyms");
      block.appendChild(h);
      const row = doc.createElement("div");
      row.style.cssText = "display:flex;flex-wrap:wrap;gap:6px";
      for (const s of ants.slice(0, 8)) {
        const chip = doc.createElement("span");
        chip.textContent = s;
        chip.style.cssText =
          "font-size:12px;background:var(--secondary);border:1px solid var(--border);border-radius:4px;padding:2px 8px";
        row.appendChild(chip);
      }
      block.appendChild(row);
      body.appendChild(block);
    } catch {
      // optional enrichment
    }
  };

  const appendSynonyms = async (word: string): Promise<void> => {
    if (!langTag.toLowerCase().startsWith("en")) return;
    try {
      const syns = await fetchSynonyms(word);
      if (!syns.length) return;
      const block = doc.createElement("div");
      block.style.cssText = "border-top:1px solid var(--border);padding-top:8px;margin-top:4px";
      const h = doc.createElement("div");
      h.style.cssText = "font-size:11px;color:var(--muted-foreground);margin-bottom:4px";
      h.textContent = t("smartLookup.synonyms");
      block.appendChild(h);
      const row = doc.createElement("div");
      row.style.cssText = "display:flex;flex-wrap:wrap;gap:6px";
      for (const s of syns.slice(0, 8)) {
        const chip = doc.createElement("span");
        chip.textContent = s;
        chip.style.cssText =
          "font-size:12px;background:var(--secondary);border:1px solid var(--border);border-radius:4px;padding:2px 8px";
        row.appendChild(chip);
      }
      block.appendChild(row);
      body.appendChild(block);
    } catch {
      // optional enrichment
    }
  };

  const runLookup = async (): Promise<void> => {
    const w = input.value.trim();
    if (!w) return;
    status.textContent = t("smartLookup.loading");
    body.replaceChildren();
    try {
      render(await fetchSmartLookup(w, langTag));
    } catch (e) {
      status.textContent = e instanceof Error ? e.message : t("smartLookup.fetchFailed");
    }
  };

  lookupBtn.addEventListener("click", () => void runLookup());

  const footer = doc.createElement("div");
  footer.style.cssText = "display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap";
  const cancel = doc.createElement("button");
  cancel.type = "button";
  cancel.textContent = t("smartLookup.close");
  cancel.style.cssText = DIALOG_BTN_SECONDARY_CSS;
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
  if (initialWord.trim()) void runLookup();
}
