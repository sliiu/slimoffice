import { showDialog } from "./dialog";
import { t } from "./i18n";
import {
  probeImageSize,
  searchStockImages,
  stockImageToDataUrl,
  type StockImageHit,
} from "./stock-image-search";

export interface StockImagePickerResult {
  dataUrl: string;
  natural: { w: number; h: number };
  attribution?: string;
}

export interface StockImagePickerOptions {
  keys: { unsplashKey?: string; pexelsKey?: string };
  onMissingKeys?: () => void;
}

/** Insert → Online Pictures：Unsplash / Pexels 搜索并插入。 */
export function openStockImagePickerDialog(
  doc: Document,
  opts: StockImagePickerOptions,
): Promise<StockImagePickerResult | null> {
  const hasKeys = !!(opts.keys.unsplashKey?.trim() || opts.keys.pexelsKey?.trim());
  if (!hasKeys) {
    opts.onMissingKeys?.();
    return Promise.resolve(null);
  }

  return showDialog<StockImagePickerResult>(doc, {
    title: t("dialog.stock.title"),
    width: 640,
    okLabel: "",
    buildBody: (body, ctx) => {
      const searchRow = doc.createElement("div");
      searchRow.style.cssText = "display:flex;gap:8px;margin-bottom:10px";
      const search = doc.createElement("input");
      search.type = "search";
      search.placeholder = t("dialog.stock.search");
      search.style.cssText =
        "flex:1;box-sizing:border-box;background:var(--background);color:var(--foreground);border:1px solid var(--border);border-radius:4px;padding:8px 10px;font:inherit";
      const searchBtn = doc.createElement("button");
      searchBtn.type = "button";
      searchBtn.textContent = t("dialog.stock.searchBtn");
      searchBtn.style.cssText =
        "padding:8px 14px;border:1px solid var(--border);border-radius:4px;background:var(--secondary);color:var(--foreground);cursor:pointer;font:inherit";
      searchRow.append(search, searchBtn);
      body.appendChild(searchRow);

      const status = doc.createElement("p");
      status.style.cssText = "margin:0 0 8px;font-size:12px;color:var(--muted-foreground);min-height:18px";
      body.appendChild(status);

      const gridWrap = doc.createElement("div");
      gridWrap.className = "ppt-scroll";
      gridWrap.style.cssText =
        "max-height:420px;overflow:auto;border:1px solid var(--border);border-radius:6px;padding:8px;min-height:120px";
      body.appendChild(gridWrap);

      let abort: AbortController | null = null;

      const renderHits = (hits: StockImageHit[]): void => {
        gridWrap.replaceChildren();
        if (!hits.length) {
          const empty = doc.createElement("p");
          empty.textContent = t("dialog.stock.noResults");
          empty.style.cssText = "margin:24px 0;text-align:center;color:var(--muted-foreground);font-size:13px";
          gridWrap.appendChild(empty);
          return;
        }
        const grid = doc.createElement("div");
        grid.style.cssText = "display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px";
        for (const hit of hits) {
          const btn = doc.createElement("button");
          btn.type = "button";
          btn.title = hit.alt ?? hit.authorName ?? hit.url;
          btn.style.cssText =
            "display:block;border:1px solid var(--border);border-radius:6px;overflow:hidden;padding:0;background:var(--card);cursor:pointer;aspect-ratio:16/10";
          const img = doc.createElement("img");
          img.src = hit.thumb;
          img.alt = hit.alt ?? "";
          img.style.cssText = "display:block;width:100%;height:100%;object-fit:cover";
          btn.appendChild(img);
          btn.addEventListener("click", () => {
            void (async () => {
              status.textContent = t("dialog.stock.loading");
              try {
                const dataUrl = await stockImageToDataUrl(hit.url);
                const natural = await probeImageSize(dataUrl);
                const attribution =
                  hit.authorName && hit.authorUrl
                    ? `${hit.authorName} (${hit.source})`
                    : hit.authorName
                      ? `${hit.authorName} (${hit.source})`
                      : hit.source;
                ctx.close({ dataUrl, natural, attribution });
              } catch (e) {
                status.textContent = (e as Error).message || t("dialog.stock.failed");
              }
            })();
          });
          grid.appendChild(btn);
        }
        gridWrap.appendChild(grid);
      };

      const runSearch = (): void => {
        const q = search.value.trim();
        if (!q) return;
        abort?.abort();
        abort = new AbortController();
        status.textContent = t("dialog.stock.loading");
        void searchStockImages(q, opts.keys, abort.signal)
          .then((hits) => {
            status.textContent = hits.length ? "" : t("dialog.stock.noResults");
            renderHits(hits);
          })
          .catch((e) => {
            if ((e as Error).name === "AbortError") return;
            status.textContent = (e as Error).message || t("dialog.stock.failed");
            renderHits([]);
          });
      };

      searchBtn.addEventListener("click", runSearch);
      search.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          runSearch();
        }
      });

      renderHits([]);
    },
  });
}
