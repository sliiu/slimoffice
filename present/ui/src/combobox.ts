import { ensureUiStyles } from "./styles.js";

export interface ComboboxItem {
  value: string;
  label?: string;
}

export interface BindComboboxOptions {
  options?: Array<string | ComboboxItem>;
  onChange?: (value: string) => void;
  optionStyle?: (item: ComboboxItem) => string | undefined;
  allowCustom?: boolean;
}

export interface ComboboxHandle {
  el: HTMLElement;
  input: HTMLInputElement;
  setOptions: (options: Array<string | ComboboxItem>) => void;
  setValue: (value: string) => void;
  destroy: () => void;
}

function normalizeOptions(list: Array<string | ComboboxItem>): ComboboxItem[] {
  return list.map((o) => (typeof o === "string" ? { value: o } : o));
}

function displayOf(item: ComboboxItem): string {
  return item.label ?? item.value;
}

export function bindCombobox(input: HTMLInputElement, opts: BindComboboxOptions = {}): ComboboxHandle {
  const doc = input.ownerDocument;
  ensureUiStyles(doc);
  const allowCustom = opts.allowCustom ?? true;

  input.type = "text";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");

  const wrap = doc.createElement("span");
  wrap.className = "ui-combobox";
  const chevron = doc.createElement("span");
  chevron.className = "ui-combobox-chevron";
  chevron.setAttribute("aria-hidden", "true");
  if (input.parentNode) input.replaceWith(wrap);
  wrap.append(input, chevron);

  const menu = doc.createElement("div");
  menu.className = "ui-combobox-menu";
  menu.setAttribute("role", "listbox");
  menu.id = `ui-combobox-${Math.random().toString(36).slice(2, 10)}`;
  menu.hidden = true;
  input.setAttribute("aria-controls", menu.id);

  let options = normalizeOptions(opts.options ?? []);
  let activeIdx = 0;
  let opened = false;
  let filtering = false;
  let committed = input.value;
  let destroyed = false;
  let suppressOpen = false;
  let emitting = false;

  const GAP = 4;
  const SAFE = 8;
  const MAX_H = 240;

  function itemByValue(value: string): ComboboxItem | undefined {
    return options.find((o) => o.value === value);
  }

  function resolve(text: string): ComboboxItem | undefined {
    const q = text.trim();
    if (!q) return undefined;
    const lower = q.toLowerCase();
    return (
      options.find((o) => o.value === q) ??
      options.find((o) => displayOf(o) === q) ??
      options.find((o) => o.value.toLowerCase() === lower) ??
      options.find((o) => displayOf(o).toLowerCase() === lower)
    );
  }

  function visible(): ComboboxItem[] {
    if (!filtering) return options;
    const q = input.value.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.value.toLowerCase().includes(q) || displayOf(o).toLowerCase().includes(q));
  }

  function showDisplay(value: string): void {
    const hit = itemByValue(value);
    input.value = hit ? displayOf(hit) : value;
  }

  function positionMenu(): void {
    const rect = wrap.getBoundingClientRect();
    const view = doc.defaultView ?? window;
    menu.style.left = `${rect.left}px`;
    menu.style.width = `${Math.max(rect.width, 120)}px`;
    const below = view.innerHeight - rect.bottom - SAFE - GAP;
    const above = rect.top - SAFE - GAP;
    if (below >= 120 || below >= above) {
      menu.style.bottom = "";
      menu.style.top = `${rect.bottom + GAP}px`;
      menu.style.maxHeight = `${Math.max(80, Math.min(MAX_H, below))}px`;
    } else {
      menu.style.top = "";
      menu.style.bottom = `${view.innerHeight - rect.top + GAP}px`;
      menu.style.maxHeight = `${Math.max(80, Math.min(MAX_H, above))}px`;
    }
  }

  function syncActive(): void {
    const rows = menu.querySelectorAll<HTMLElement>("[role=option]");
    rows.forEach((row, idx) => {
      const on = idx === activeIdx;
      row.classList.toggle("is-active", on);
      row.setAttribute("aria-selected", on ? "true" : "false");
    });
    rows[activeIdx]?.scrollIntoView({ block: "nearest" });
  }

  function render(): void {
    menu.replaceChildren();
    const items = visible();
    if (!items.length) {
      if (!(filtering && allowCustom)) {
        opened = false;
        input.setAttribute("aria-expanded", "false");
      }
      menu.hidden = true;
      return;
    }
    if (activeIdx >= items.length) activeIdx = 0;
    items.forEach((item, idx) => {
      const row = doc.createElement("div");
      row.className = "ui-combobox-item" + (idx === activeIdx ? " is-active" : "");
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", idx === activeIdx ? "true" : "false");
      row.textContent = displayOf(item);
      const extra = opts.optionStyle?.(item);
      if (extra) row.style.cssText = extra;
      row.addEventListener("mousedown", (e) => {
        e.preventDefault();
        pick(item.value);
      });
      row.addEventListener("mousemove", () => {
        if (activeIdx === idx) return;
        activeIdx = idx;
        syncActive();
      });
      menu.appendChild(row);
    });
  }

  function ensureMenuHost(): void {
    if (!menu.isConnected) (doc.body ?? doc.documentElement).appendChild(menu);
  }

  function open(): void {
    if (destroyed || suppressOpen) return;
    if (!wrap.isConnected) {
      destroy();
      return;
    }
    if (!options.length && !allowCustom) return;
    ensureMenuHost();
    opened = true;
    input.setAttribute("aria-expanded", "true");
    menu.hidden = false;
    positionMenu();
    render();
  }

  function close(): void {
    opened = false;
    filtering = false;
    input.setAttribute("aria-expanded", "false");
    menu.hidden = true;
  }

  function emit(value: string): void {
    committed = value;
    emitting = true;
    showDisplay(value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    emitting = false;
    opts.onChange?.(value);
  }

  function pick(value: string): void {
    if (value !== committed) emit(value);
    else showDisplay(value);
    if (!destroyed) close();
  }

  function commitTyped(): void {
    const typed = input.value.trim();
    const hit = resolve(typed);
    if (hit) {
      pick(hit.value);
      return;
    }
    if (allowCustom) {
      pick(typed);
      return;
    }
    showDisplay(committed);
    close();
  }

  function onFocus(): void {
    if (destroyed || suppressOpen) return;
    filtering = false;
    const hit = resolve(input.value) ?? itemByValue(committed);
    const idx = hit ? options.findIndex((o) => o.value === hit.value) : -1;
    activeIdx = idx >= 0 ? idx : 0;
    open();
  }

  function onClick(): void {
    if (!opened) {
      filtering = false;
      open();
    }
  }

  function onInput(): void {
    if (emitting || suppressOpen) return;
    filtering = true;
    activeIdx = 0;
    open();
  }

  function onKeydown(e: KeyboardEvent): void {
    const items = visible();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!opened) {
        open();
        return;
      }
      if (!items.length) return;
      activeIdx = (activeIdx + 1) % items.length;
      syncActive();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!opened) {
        open();
        return;
      }
      if (!items.length) return;
      activeIdx = (activeIdx - 1 + items.length) % items.length;
      syncActive();
    } else if (e.key === "Enter") {
      if (opened && items[activeIdx]) {
        e.preventDefault();
        pick(items[activeIdx]!.value);
      } else if (opened) {
        e.preventDefault();
        commitTyped();
      }
    } else if (e.key === "Escape") {
      if (opened) {
        e.preventDefault();
        showDisplay(committed);
        close();
      }
    } else if (e.key === "Tab") {
      if (opened) commitTyped();
    }
  }

  function onBlur(): void {
    if (destroyed) return;
    commitTyped();
  }

  function onViewport(): void {
    if (opened) positionMenu();
  }

  const view = doc.defaultView;
  input.addEventListener("focus", onFocus);
  input.addEventListener("click", onClick);
  input.addEventListener("input", onInput);
  input.addEventListener("keydown", onKeydown);
  input.addEventListener("blur", onBlur);
  view?.addEventListener("resize", onViewport, { passive: true });
  view?.addEventListener("scroll", onViewport, { capture: true, passive: true });

  const disconnectMo = new MutationObserver(() => {
    if (!wrap.isConnected) destroy();
  });
  const moRoot = doc.body ?? doc.documentElement;
  disconnectMo.observe(moRoot, { childList: true });
  showDisplay(committed);

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    close();
    menu.remove();
    disconnectMo.disconnect();
    input.removeEventListener("focus", onFocus);
    input.removeEventListener("click", onClick);
    input.removeEventListener("input", onInput);
    input.removeEventListener("keydown", onKeydown);
    input.removeEventListener("blur", onBlur);
    view?.removeEventListener("resize", onViewport);
    view?.removeEventListener("scroll", onViewport, { capture: true } as EventListenerOptions);
    if (wrap.isConnected) wrap.replaceWith(input);
    else wrap.remove();
  }

  return {
    el: wrap,
    input,
    setOptions(next) {
      options = normalizeOptions(next);
      if (!opened) return;
      if (!options.length && !allowCustom) close();
      else render();
    },
    setValue(value) {
      suppressOpen = true;
      committed = value;
      showDisplay(value);
      suppressOpen = false;
    },
    destroy,
  };
}
