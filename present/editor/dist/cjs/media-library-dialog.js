"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openMediaLibraryDialog = openMediaLibraryDialog;
const core_1 = require("@sliiu/present-core");
const dialog_1 = require("./dialog");
const i18n_1 = require("./i18n");
const ACCEPT = "image/*,video/*,audio/*";
function btnCss(primary = false) {
    return [
        "padding:6px 10px",
        "border-radius:6px",
        primary ? "border:0" : "border:1px solid var(--border)",
        primary ? "background:var(--primary)" : "background:var(--secondary)",
        primary ? "color:var(--primary-foreground)" : "color:var(--foreground)",
        "cursor:pointer",
        "font:inherit",
        "font-size:12px",
    ].join(";");
}
function formatBytes(n) {
    if (n < 1024)
        return `${n} B`;
    if (n < 1024 * 1024)
        return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
function kindLabel(kind) {
    if (kind === "image")
        return (0, i18n_1.t)("library.kind.image");
    if (kind === "video")
        return (0, i18n_1.t)("library.kind.video");
    return (0, i18n_1.t)("library.kind.audio");
}
function openMediaLibraryDialog(doc, adapter) {
    return (0, dialog_1.showDialog)(doc, {
        title: (0, i18n_1.t)("library.title"),
        width: 780,
        okLabel: "",
        buildBody: (body, ctx) => {
            body.style.padding = "0";
            const root = doc.createElement("div");
            root.style.cssText = "display:flex;min-height:460px;max-height:70vh";
            const side = doc.createElement("div");
            side.style.cssText =
                "width:180px;flex:0 0 180px;border-right:1px solid var(--border);display:flex;flex-direction:column;background:var(--card)";
            const catList = doc.createElement("div");
            catList.className = "ppt-scroll";
            catList.style.cssText = "flex:1;overflow:auto;padding:8px";
            const catActions = doc.createElement("div");
            catActions.style.cssText = "padding:8px;display:flex;flex-direction:column;gap:6px;border-top:1px solid var(--border)";
            side.append(catList, catActions);
            const main = doc.createElement("div");
            main.style.cssText = "flex:1;min-width:0;display:flex;flex-direction:column";
            const toolbar = doc.createElement("div");
            toolbar.style.cssText =
                "display:flex;gap:8px;align-items:center;padding:10px 12px;border-bottom:1px solid var(--border)";
            const status = doc.createElement("p");
            status.style.cssText = "margin:0 12px;padding:6px 0 0;font-size:12px;color:var(--muted-foreground);min-height:18px";
            const gridWrap = doc.createElement("div");
            gridWrap.className = "ppt-scroll";
            gridWrap.style.cssText = "flex:1;overflow:auto;padding:12px";
            main.append(toolbar, status, gridWrap);
            root.append(side, main);
            body.appendChild(root);
            let categories = [];
            let items = [];
            let activeCat = "all";
            let query = "";
            const setStatus = (text, err = false) => {
                status.textContent = text;
                status.style.color = err ? "var(--destructive, #f87171)" : "var(--muted-foreground)";
            };
            const insertItem = async (item) => {
                setStatus((0, i18n_1.t)("library.inserting"));
                try {
                    const dataUrl = await adapter.getItemSrc(item.id);
                    ctx.close({
                        kind: item.kind,
                        dataUrl,
                        name: item.name,
                        mime: item.mime,
                        width: item.width,
                        height: item.height,
                        duration: item.duration,
                    });
                }
                catch {
                    setStatus((0, i18n_1.t)("library.insertFailed"), true);
                }
            };
            const renderCats = () => {
                catList.replaceChildren();
                const allBtn = doc.createElement("button");
                allBtn.type = "button";
                allBtn.textContent = (0, i18n_1.t)("library.all");
                allBtn.style.cssText = catBtnCss(activeCat === "all");
                allBtn.addEventListener("click", () => {
                    activeCat = "all";
                    void refreshItems();
                });
                catList.appendChild(allBtn);
                for (const cat of categories) {
                    const row = doc.createElement("div");
                    row.style.cssText = "display:flex;align-items:center;gap:4px;margin-top:4px";
                    const btn = doc.createElement("button");
                    btn.type = "button";
                    btn.textContent =
                        cat.id === core_1.MEDIA_LIBRARY_DEFAULT_CATEGORY_ID ? (0, i18n_1.t)("library.uncategorized") : cat.name;
                    btn.style.cssText = `${catBtnCss(activeCat === cat.id)};flex:1;text-align:left`;
                    btn.addEventListener("click", () => {
                        activeCat = cat.id;
                        void refreshItems();
                    });
                    row.appendChild(btn);
                    if (cat.id !== core_1.MEDIA_LIBRARY_DEFAULT_CATEGORY_ID) {
                        const del = doc.createElement("button");
                        del.type = "button";
                        del.textContent = "×";
                        del.title = (0, i18n_1.t)("library.deleteCategory");
                        del.style.cssText =
                            "border:0;background:transparent;color:var(--muted-foreground);cursor:pointer;padding:0 4px";
                        del.addEventListener("click", (e) => {
                            e.stopPropagation();
                            void (async () => {
                                await adapter.deleteCategory(cat.id);
                                if (activeCat === cat.id)
                                    activeCat = "all";
                                await refresh();
                            })();
                        });
                        row.appendChild(del);
                    }
                    catList.appendChild(row);
                }
            };
            const renderItems = () => {
                gridWrap.replaceChildren();
                const filtered = items.filter((it) => {
                    if (query && !it.name.toLowerCase().includes(query))
                        return false;
                    return true;
                });
                if (!filtered.length) {
                    const empty = doc.createElement("p");
                    empty.textContent = (0, i18n_1.t)("library.empty");
                    empty.style.cssText = "margin:32px 0;text-align:center;color:var(--muted-foreground);font-size:13px";
                    gridWrap.appendChild(empty);
                    return;
                }
                const grid = doc.createElement("div");
                grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px";
                for (const item of filtered) {
                    const card = doc.createElement("div");
                    card.style.cssText =
                        "border:1px solid var(--border);border-radius:8px;overflow:hidden;background:var(--card);display:flex;flex-direction:column";
                    const preview = doc.createElement("div");
                    preview.style.cssText =
                        "aspect-ratio:16/10;background:var(--muted);display:flex;align-items:center;justify-content:center;overflow:hidden;cursor:pointer";
                    preview.title = (0, i18n_1.t)("library.insertHint");
                    if (item.kind === "image") {
                        void adapter.getItemSrc(item.id).then((src) => {
                            const img = doc.createElement("img");
                            img.src = src;
                            img.alt = item.name;
                            img.style.cssText = "width:100%;height:100%;object-fit:cover";
                            preview.replaceChildren(img);
                        }).catch(() => {
                            preview.textContent = kindLabel(item.kind);
                        });
                    }
                    else {
                        preview.textContent = kindLabel(item.kind);
                        preview.style.fontSize = "12px";
                        preview.style.color = "var(--muted-foreground)";
                    }
                    preview.addEventListener("dblclick", () => void insertItem(item));
                    const meta = doc.createElement("div");
                    meta.style.cssText = "padding:8px;display:flex;flex-direction:column;gap:6px";
                    const name = doc.createElement("div");
                    name.textContent = item.name;
                    name.title = item.name;
                    name.style.cssText = "font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
                    const sub = doc.createElement("div");
                    sub.textContent = `${kindLabel(item.kind)} · ${formatBytes(item.bytes)}`;
                    sub.style.cssText = "font-size:11px;color:var(--muted-foreground)";
                    const actions = doc.createElement("div");
                    actions.style.cssText = "display:flex;flex-wrap:wrap;gap:4px";
                    const insertBtn = doc.createElement("button");
                    insertBtn.type = "button";
                    insertBtn.textContent = (0, i18n_1.t)("library.insert");
                    insertBtn.style.cssText = btnCss(true);
                    insertBtn.addEventListener("click", () => void insertItem(item));
                    const renameBtn = doc.createElement("button");
                    renameBtn.type = "button";
                    renameBtn.textContent = (0, i18n_1.t)("library.rename");
                    renameBtn.style.cssText = btnCss(false);
                    renameBtn.addEventListener("click", () => {
                        const next = window.prompt((0, i18n_1.t)("library.renamePrompt"), item.name);
                        if (!next?.trim())
                            return;
                        void adapter.renameItem(item.id, next).then(() => refreshItems());
                    });
                    const delBtn = doc.createElement("button");
                    delBtn.type = "button";
                    delBtn.textContent = (0, i18n_1.t)("library.delete");
                    delBtn.style.cssText = btnCss(false);
                    delBtn.addEventListener("click", () => {
                        if (!window.confirm((0, i18n_1.t)("library.deleteConfirm")))
                            return;
                        void adapter.deleteItem(item.id).then(() => refreshItems());
                    });
                    if (categories.length > 1) {
                        const move = doc.createElement("select");
                        move.title = (0, i18n_1.t)("library.move");
                        move.style.cssText =
                            "flex:1;min-width:0;font:inherit;font-size:11px;background:var(--background);color:var(--foreground);border:1px solid var(--border);border-radius:6px;padding:4px";
                        for (const cat of categories) {
                            const opt = doc.createElement("option");
                            opt.value = cat.id;
                            opt.textContent =
                                cat.id === core_1.MEDIA_LIBRARY_DEFAULT_CATEGORY_ID ? (0, i18n_1.t)("library.uncategorized") : cat.name;
                            if (cat.id === item.categoryId)
                                opt.selected = true;
                            move.appendChild(opt);
                        }
                        move.addEventListener("change", () => {
                            void adapter.moveItem(item.id, move.value).then(() => refreshItems());
                        });
                        actions.append(insertBtn, renameBtn, delBtn, move);
                    }
                    else {
                        actions.append(insertBtn, renameBtn, delBtn);
                    }
                    meta.append(name, sub, actions);
                    card.append(preview, meta);
                    grid.appendChild(card);
                }
                gridWrap.appendChild(grid);
            };
            const refreshItems = async () => {
                items = await adapter.listItems(activeCat === "all" ? undefined : activeCat);
                renderCats();
                renderItems();
                setStatus((0, i18n_1.t)("library.count", { n: items.length }));
            };
            const refresh = async () => {
                categories = await adapter.listCategories();
                await refreshItems();
            };
            const search = doc.createElement("input");
            search.type = "search";
            search.placeholder = (0, i18n_1.t)("library.search");
            search.style.cssText =
                "flex:1;box-sizing:border-box;background:var(--background);color:var(--foreground);border:1px solid var(--border);border-radius:6px;padding:7px 10px;font:inherit";
            search.addEventListener("input", () => {
                query = search.value.trim().toLowerCase();
                renderItems();
            });
            const uploadBtn = doc.createElement("button");
            uploadBtn.type = "button";
            uploadBtn.textContent = (0, i18n_1.t)("library.upload");
            uploadBtn.style.cssText = btnCss(true);
            uploadBtn.addEventListener("click", () => {
                const inp = doc.createElement("input");
                inp.type = "file";
                inp.accept = ACCEPT;
                inp.multiple = true;
                inp.addEventListener("change", () => {
                    const files = [...(inp.files ?? [])];
                    if (!files.length)
                        return;
                    const tooBig = files.find((f) => f.size > core_1.MEDIA_LIBRARY_MAX_ITEM_BYTES);
                    if (tooBig) {
                        setStatus((0, i18n_1.t)("library.tooLarge"), true);
                        return;
                    }
                    setStatus((0, i18n_1.t)("library.uploading"));
                    const dest = activeCat === "all" ? core_1.MEDIA_LIBRARY_DEFAULT_CATEGORY_ID : activeCat;
                    void adapter.addFiles(files, dest).then(refreshItems).catch((e) => {
                        setStatus(e instanceof Error && e.message === "ITEM_TOO_LARGE" ? (0, i18n_1.t)("library.tooLarge") : (0, i18n_1.t)("library.uploadFailed"), true);
                    });
                });
                inp.click();
            });
            toolbar.append(search, uploadBtn);
            const addCat = doc.createElement("button");
            addCat.type = "button";
            addCat.textContent = (0, i18n_1.t)("library.addCategory");
            addCat.style.cssText = btnCss(false);
            addCat.addEventListener("click", () => {
                const name = window.prompt((0, i18n_1.t)("library.categoryPrompt"), "");
                if (!name?.trim())
                    return;
                void adapter.createCategory(name).then(refresh);
            });
            catActions.appendChild(addCat);
            void refresh().catch(() => setStatus((0, i18n_1.t)("library.loadFailed"), true));
        },
    });
}
function catBtnCss(active) {
    return [
        "width:100%",
        "text-align:left",
        "padding:7px 8px",
        "border-radius:6px",
        "border:0",
        active ? "background:var(--accent)" : "background:transparent",
        "color:var(--foreground)",
        "cursor:pointer",
        "font:inherit",
        "font-size:12px",
    ].join(";");
}
