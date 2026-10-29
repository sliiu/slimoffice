"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.appendPluginChooser = appendPluginChooser;
function heading(doc, text) {
    const el = doc.createElement("div");
    el.textContent = text;
    el.style.cssText =
        "font-size:11px;color:var(--muted-foreground);letter-spacing:.2px;padding:8px 6px 4px";
    return el;
}
function appendRow(panel, entry, opts) {
    const doc = panel.ownerDocument;
    const row = doc.createElement("div");
    row.dataset.pluginId = entry.id;
    row.style.cssText = [
        "display:flex",
        "align-items:flex-start",
        "gap:8px",
        "padding:8px 6px",
        "border-radius:4px",
    ].join(";");
    row.addEventListener("mouseenter", () => (row.style.background = "var(--accent)"));
    row.addEventListener("mouseleave", () => (row.style.background = "transparent"));
    const label = doc.createElement("label");
    label.style.cssText = "flex:1;display:flex;align-items:flex-start;gap:8px;cursor:pointer";
    const cb = doc.createElement("input");
    cb.type = "checkbox";
    cb.checked = opts.enabled.has(entry.id);
    cb.style.cssText = "margin-top:2px;accent-color:var(--primary)";
    cb.addEventListener("change", () => {
        const next = new Set(opts.enabled);
        if (cb.checked)
            next.add(entry.id);
        else
            next.delete(entry.id);
        opts.enabled = next;
        opts.onChange(next);
    });
    const body = doc.createElement("div");
    body.style.cssText = "flex:1;display:flex;flex-direction:column;gap:2px";
    const name = doc.createElement("div");
    name.textContent = entry.name;
    name.style.cssText = "font-weight:600;color:var(--foreground)";
    body.appendChild(name);
    if (entry.description) {
        const desc = doc.createElement("div");
        desc.textContent = entry.description;
        desc.style.cssText = "color:var(--muted-foreground);font-size:11px;line-height:1.45";
        body.appendChild(desc);
    }
    label.append(cb, body);
    row.appendChild(label);
    if (entry.origin === "imported" && opts.onDelete && opts.labels) {
        const del = doc.createElement("button");
        del.type = "button";
        del.textContent = opts.labels.delete;
        del.style.cssText = [
            "border:0",
            "background:transparent",
            "color:var(--muted-foreground)",
            "cursor:pointer",
            "font:11px var(--font-sans, ui-sans-serif, system-ui, sans-serif)",
            "padding:2px 4px",
        ].join(";");
        del.addEventListener("click", (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            del.disabled = true;
            void Promise.resolve(opts.onDelete?.(entry.id)).then((ok) => {
                if (ok === false) {
                    del.disabled = false;
                    return;
                }
                opts.enabled.delete(entry.id);
                opts.onChange(new Set(opts.enabled));
                row.remove();
            });
        });
        row.appendChild(del);
    }
    panel.appendChild(row);
}
function appendPluginChooser(panel, opts) {
    const doc = panel.ownerDocument;
    const grouped = Boolean(opts.labels);
    if (!grouped) {
        if (opts.entries.length === 0 && opts.labels) {
            const empty = doc.createElement("div");
            empty.textContent = opts.labels.empty;
            empty.style.cssText = "padding:8px 6px;color:var(--muted-foreground);font-style:italic";
            panel.appendChild(empty);
            return;
        }
        if (opts.entries.length === 0)
            return;
        for (const entry of opts.entries)
            appendRow(panel, entry, opts);
        return;
    }
    const labels = opts.labels;
    const official = opts.entries.filter((e) => e.origin !== "imported");
    const imported = opts.entries.filter((e) => e.origin === "imported");
    panel.appendChild(heading(doc, labels.official));
    if (official.length === 0) {
        const empty = doc.createElement("div");
        empty.textContent = labels.empty;
        empty.style.cssText = "padding:4px 6px 8px;color:var(--muted-foreground);font-style:italic";
        panel.appendChild(empty);
    }
    else {
        for (const entry of official)
            appendRow(panel, { ...entry, origin: "official" }, opts);
    }
    panel.appendChild(heading(doc, labels.imported));
    const note = doc.createElement("div");
    note.textContent = labels.privateNote;
    note.style.cssText = "padding:0 6px 6px;color:var(--muted-foreground);font-size:11px;line-height:1.45";
    panel.appendChild(note);
    for (const entry of imported)
        appendRow(panel, { ...entry, origin: "imported" }, opts);
    if (opts.onImport) {
        const btn = doc.createElement("button");
        btn.type = "button";
        btn.textContent = labels.import;
        btn.style.cssText = [
            "display:block",
            "width:100%",
            "margin-top:6px",
            "padding:6px 8px",
            "border:1px solid var(--border)",
            "border-radius:4px",
            "background:transparent",
            "color:var(--foreground)",
            "cursor:pointer",
            "font:12px var(--font-sans, ui-sans-serif, system-ui, sans-serif)",
        ].join(";");
        btn.addEventListener("click", () => {
            btn.disabled = true;
            void Promise.resolve(opts.onImport?.()).then((entry) => {
                btn.disabled = false;
                if (!entry)
                    return;
                appendRow(panel, { ...entry, origin: "imported" }, opts);
                panel.insertBefore(panel.lastElementChild, btn);
            });
        });
        panel.appendChild(btn);
    }
}
