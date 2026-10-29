const CSS = `
.ppt-chrome-blank{position:absolute;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;font:13px ui-sans-serif,system-ui,sans-serif;letter-spacing:.04em;}
.ppt-chrome-blank.is-black{background:#000;color:rgba(255,255,255,.28);}
.ppt-chrome-blank.is-white{background:#fff;color:rgba(0,0,0,.28);}
.ppt-chrome-grid{position:absolute;inset:0;z-index:85;background:rgba(8,10,14,.92);overflow:auto;padding:28px 24px 48px;box-sizing:border-box;}
.ppt-chrome-grid-inner{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:16px;max-width:1200px;margin:0 auto;}
.ppt-chrome-thumb{cursor:pointer;border:2px solid transparent;border-radius:8px;overflow:hidden;background:#111;color:inherit;padding:0;text-align:left;box-shadow:0 0 0 1px rgba(255,255,255,.08);}
.ppt-chrome-thumb:hover,.ppt-chrome-thumb.is-current{border-color:#3b82f6;}
.ppt-chrome-thumb-stage{display:block;width:100%;aspect-ratio:16/9;background:#000;overflow:hidden;}
.ppt-chrome-thumb-stage svg,.ppt-chrome-thumb-stage img{display:block;width:100%;height:100%;object-fit:contain;pointer-events:none;}
.ppt-chrome-thumb-stage iframe,.ppt-chrome-thumb-stage video,.ppt-chrome-thumb-stage audio{pointer-events:none!important;}
.ppt-chrome-thumb-n{font:12px ui-sans-serif,system-ui,sans-serif;color:#94a3b8;padding:6px 8px;}
.ppt-chrome-help{position:absolute;inset:0;z-index:90;background:rgba(8,10,14,.82);display:flex;align-items:center;justify-content:center;padding:24px;}
.ppt-chrome-help-card{background:rgba(28,31,38,.96);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:22px 26px;max-width:520px;width:100%;color:#e5e7eb;font:13px ui-sans-serif,system-ui,sans-serif;box-shadow:0 16px 40px rgba(0,0,0,.45);}
.ppt-chrome-help-card h2{margin:0 0 14px;font-size:16px;font-weight:600;}
.ppt-chrome-help-row{display:flex;justify-content:space-between;gap:16px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.06);}
.ppt-chrome-help-row:last-child{border-bottom:0;}
.ppt-chrome-help-k{color:#93c5fd;font-variant-numeric:tabular-nums;white-space:nowrap;}
.ppt-chrome-help-v{color:#d1d5db;}
.ppt-chrome-end{position:absolute;inset:0;z-index:88;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:#9ca3af;font:15px ui-sans-serif,system-ui,sans-serif;cursor:pointer;}
.ppt-chrome-end.is-share,.ppt-chrome-end.is-quiet{cursor:default;}
.ppt-chrome-end strong{color:#e5e7eb;font-size:22px;font-weight:600;}
.ppt-chrome-end-actions{display:flex;align-items:center;gap:10px;}
.ppt-chrome-end-replay,.ppt-chrome-end-home{cursor:pointer;font:14px ui-sans-serif,system-ui,sans-serif;border-radius:8px;padding:8px 16px;line-height:1.2;text-decoration:none;}
.ppt-chrome-end-replay{background:#f8fafc;color:#0f172a;border:0;font-weight:600;}
.ppt-chrome-end-replay:hover{background:#fff;}
.ppt-chrome-end-home{background:transparent;color:#e5e7eb;border:1px solid rgba(255,255,255,.35);}
.ppt-chrome-end-home:hover{color:#fff;border-color:#fff;}
.ppt-chrome-hint{position:absolute;right:18px;bottom:18px;z-index:70;background:rgba(15,18,24,.82);color:#e5e7eb;padding:6px 10px;border-radius:6px;font:13px ui-sans-serif,system-ui,sans-serif;letter-spacing:.06em;pointer-events:none;}
.ppt-chrome-paused{position:absolute;left:18px;bottom:18px;z-index:70;background:rgba(15,18,24,.7);color:#e5e7eb;padding:4px 8px;border-radius:4px;font:12px ui-sans-serif,system-ui,sans-serif;pointer-events:none;}
.ppt-host.ppt-has-controls .ppt-chrome-hint,.ppt-host.ppt-has-controls .ppt-chrome-paused{bottom:48px;}
.ppt-host.ppt-idle-cursor,.ppt-host.ppt-idle-cursor *{cursor:none !important;}
`;
const HELP_ROWS = [
    { keys: "→  Space  Enter", label: "help.next" },
    { keys: "←  ↑", label: "help.prev" },
    { keys: "1–9  Enter", label: "help.jump" },
    { keys: "B  .", label: "help.black" },
    { keys: ",", label: "help.white" },
    { keys: "G", label: "help.grid" },
    { keys: "L", label: "help.laser" },
    { keys: "W", label: "help.ink" },
    { keys: "F", label: "help.full" },
    { keys: "P", label: "help.pause" },
    { keys: "F1  ?", label: "help.help" },
    { keys: "Esc", label: "help.end" },
];
export function createShowChrome(opts) {
    const { host, tr } = opts;
    const doc = host.ownerDocument;
    injectChromeCss(doc);
    let blank = null;
    let blankKind = null;
    let grid = null;
    let help = null;
    let endEl = null;
    let endKind = null;
    let jumpHint = null;
    let pausedEl = null;
    let idleTimer;
    let endHandler = null;
    const thumbHandles = [];
    const clearIdle = () => {
        if (idleTimer !== undefined)
            clearTimeout(idleTimer);
        idleTimer = undefined;
        host.classList.remove("ppt-idle-cursor");
    };
    const armIdle = () => {
        clearIdle();
        idleTimer = setTimeout(() => {
            if (grid || help || endEl)
                return;
            host.classList.add("ppt-idle-cursor");
        }, 2000);
    };
    const removeBlank = () => {
        blank?.remove();
        blank = null;
        blankKind = null;
    };
    const removeGrid = () => {
        while (thumbHandles.length)
            thumbHandles.pop()?.destroy();
        grid?.remove();
        grid = null;
    };
    const removeHelp = () => {
        help?.remove();
        help = null;
    };
    const removeEnd = () => {
        endEl?.remove();
        endEl = null;
        endKind = null;
        endHandler = null;
    };
    const showBlank = (kind) => {
        removeEnd();
        removeGrid();
        removeHelp();
        if (blank && blankKind === kind) {
            removeBlank();
            return;
        }
        removeBlank();
        blank = doc.createElement("div");
        blank.className = `ppt-chrome-blank is-${kind}`;
        blank.textContent = kind === "black" ? tr("chrome.blackHint") : tr("chrome.whiteHint");
        host.appendChild(blank);
        blankKind = kind;
    };
    const showGrid = () => {
        removeEnd();
        removeBlank();
        removeHelp();
        if (grid) {
            removeGrid();
            return;
        }
        grid = doc.createElement("div");
        grid.className = "ppt-chrome-grid";
        const inner = doc.createElement("div");
        inner.className = "ppt-chrome-grid-inner";
        const total = opts.visibleTotal();
        const current = opts.currentSlot();
        for (let slot = 0; slot < total; slot++) {
            const cell = doc.createElement("button");
            cell.type = "button";
            cell.className = "ppt-chrome-thumb" + (slot === current ? " is-current" : "");
            const n = doc.createElement("div");
            n.className = "ppt-chrome-thumb-n";
            n.textContent = String(slot + 1);
            const stage = doc.createElement("div");
            stage.className = "ppt-chrome-thumb-stage";
            cell.append(n, stage);
            const captured = slot;
            cell.addEventListener("click", (e) => {
                e.stopPropagation();
                opts.gotoSlot(captured);
                removeGrid();
            });
            inner.appendChild(cell);
            if (opts.thumbnail) {
                try {
                    thumbHandles.push(opts.thumbnail.mount(stage, { absoluteIndex: opts.toAbsIndex(slot) }));
                }
                catch {
                    stage.textContent = "—";
                }
            }
        }
        grid.appendChild(inner);
        grid.addEventListener("click", (e) => {
            if (e.target === grid)
                removeGrid();
        });
        host.appendChild(grid);
    };
    const showHelp = () => {
        removeEnd();
        removeBlank();
        removeGrid();
        if (help) {
            removeHelp();
            return;
        }
        help = doc.createElement("div");
        help.className = "ppt-chrome-help";
        const card = doc.createElement("div");
        card.className = "ppt-chrome-help-card";
        const h = doc.createElement("h2");
        h.textContent = tr("help.title");
        card.appendChild(h);
        for (const row of HELP_ROWS) {
            const r = doc.createElement("div");
            r.className = "ppt-chrome-help-row";
            const k = doc.createElement("span");
            k.className = "ppt-chrome-help-k";
            k.textContent = row.keys;
            const v = doc.createElement("span");
            v.className = "ppt-chrome-help-v";
            v.textContent = tr(row.label);
            r.append(k, v);
            card.appendChild(r);
        }
        help.appendChild(card);
        help.addEventListener("click", () => removeHelp());
        host.appendChild(help);
    };
    host.addEventListener("pointermove", armIdle);
    return {
        isBlank: () => blankKind !== null,
        toggleBlank: (kind) => showBlank(kind),
        dismissBlank: () => {
            if (!blank)
                return false;
            removeBlank();
            return true;
        },
        isGrid: () => Boolean(grid),
        toggleGrid: () => showGrid(),
        dismissGrid: () => {
            if (!grid)
                return false;
            removeGrid();
            return true;
        },
        isHelp: () => Boolean(help),
        toggleHelp: () => showHelp(),
        dismissHelp: () => {
            if (!help)
                return false;
            removeHelp();
            return true;
        },
        isEnd: () => Boolean(endEl),
        endKind: () => endKind,
        showEnd: (spec) => {
            removeBlank();
            removeGrid();
            removeHelp();
            if (endEl)
                return;
            endKind = spec.kind;
            endHandler = spec.kind === "exit" ? spec.onExit : null;
            endEl = doc.createElement("div");
            endEl.className = spec.kind === "exit" ? "ppt-chrome-end" : `ppt-chrome-end is-${spec.kind}`;
            const title = doc.createElement("strong");
            title.textContent = tr("chrome.endTitle");
            endEl.append(title);
            if (spec.kind === "exit") {
                const hint = doc.createElement("span");
                hint.textContent = tr("chrome.endHint");
                endEl.append(hint);
                let suppressEndClick = false;
                endEl.addEventListener("pointerdown", () => {
                    // 右键菜单开着时，这次左键是在关菜单，不要当成「单击退出」。
                    if (host.querySelector(".ppt-ctx-menu"))
                        suppressEndClick = true;
                });
                endEl.addEventListener("click", () => {
                    if (suppressEndClick) {
                        suppressEndClick = false;
                        return;
                    }
                    spec.onExit();
                });
            }
            else if (spec.kind === "share") {
                const row = doc.createElement("div");
                row.className = "ppt-chrome-end-actions";
                const replay = doc.createElement("button");
                replay.type = "button";
                replay.className = "ppt-chrome-end-replay";
                replay.textContent = spec.replayLabel;
                replay.addEventListener("click", (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    spec.onReplay();
                });
                row.append(replay);
                if (spec.homeHref) {
                    const home = doc.createElement("a");
                    home.className = "ppt-chrome-end-home";
                    home.href = spec.homeHref;
                    home.textContent = spec.homeLabel;
                    home.addEventListener("click", (e) => e.stopPropagation());
                    row.append(home);
                }
                endEl.append(row);
            }
            endEl.addEventListener("contextmenu", (e) => {
                e.preventDefault();
                e.stopPropagation();
                spec.onContextMenu?.(e);
            });
            host.appendChild(endEl);
        },
        dismissEnd: () => {
            if (!endEl)
                return false;
            removeEnd();
            return true;
        },
        dismissTransient: () => {
            let any = false;
            if (blank) {
                removeBlank();
                any = true;
            }
            if (grid) {
                removeGrid();
                any = true;
            }
            if (help) {
                removeHelp();
                any = true;
            }
            return any;
        },
        pointerOnOverlay: (e) => {
            const t = e.target;
            if (endEl && t && endEl.contains(t)) {
                if (endKind === "exit")
                    endHandler?.();
                return true;
            }
            if (blank && t && blank.contains(t)) {
                removeBlank();
                return true;
            }
            if (help && t && help.contains(t)) {
                removeHelp();
                return true;
            }
            if (grid && t && grid.contains(t))
                return true;
            return false;
        },
        setJumpHint: (text) => {
            if (!text) {
                jumpHint?.remove();
                jumpHint = null;
                return;
            }
            if (!jumpHint) {
                jumpHint = doc.createElement("div");
                jumpHint.className = "ppt-chrome-hint";
                host.appendChild(jumpHint);
            }
            jumpHint.textContent = text;
        },
        setPaused: (on) => {
            if (!on) {
                pausedEl?.remove();
                pausedEl = null;
                return;
            }
            if (!pausedEl) {
                pausedEl = doc.createElement("div");
                pausedEl.className = "ppt-chrome-paused";
                pausedEl.textContent = tr("chrome.paused");
                host.appendChild(pausedEl);
            }
        },
        armIdleCursor: armIdle,
        destroy: () => {
            clearIdle();
            host.removeEventListener("pointermove", armIdle);
            removeBlank();
            removeGrid();
            removeHelp();
            removeEnd();
            jumpHint?.remove();
            pausedEl?.remove();
        },
    };
}
let cssInjected = false;
function injectChromeCss(doc) {
    if (cssInjected || doc.getElementById("ppt-show-chrome-css")) {
        cssInjected = true;
        return;
    }
    const el = doc.createElement("style");
    el.id = "ppt-show-chrome-css";
    el.textContent = CSS;
    doc.head.appendChild(el);
    cssInjected = true;
}
