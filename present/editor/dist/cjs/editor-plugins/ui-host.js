"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEditorPluginUIHost = createEditorPluginUIHost;
exports.removeEditorPluginLayers = removeEditorPluginLayers;
function createEditorPluginUIHost(doc, root, pluginId) {
    let panelLayer = root.querySelector("[data-ppt-editor-plugin-panels]");
    if (!panelLayer) {
        panelLayer = doc.createElement("div");
        panelLayer.dataset.pptEditorPluginPanels = "1";
        panelLayer.style.cssText = [
            "position:absolute",
            "left:8px",
            "bottom:52px",
            "z-index:40",
            "display:flex",
            "flex-direction:column",
            "gap:8px",
            "max-width:min(320px,calc(100% - 16px))",
            "pointer-events:none",
        ].join(";");
        root.appendChild(panelLayer);
    }
    let ribbonLayer = root.querySelector("[data-ppt-editor-plugin-ribbon]");
    if (!ribbonLayer) {
        ribbonLayer = doc.createElement("div");
        ribbonLayer.dataset.pptEditorPluginRibbon = "1";
        ribbonLayer.style.cssText = [
            "position:absolute",
            "top:8px",
            "right:308px",
            "z-index:35",
            "display:flex",
            "gap:6px",
            "flex-wrap:wrap",
            "pointer-events:none",
        ].join(";");
        root.appendChild(ribbonLayer);
    }
    const handles = new Set();
    const track = (handle) => {
        handles.add(handle);
        return {
            remove: () => {
                handle.remove();
                handles.delete(handle);
            },
        };
    };
    return {
        addPanel(opts) {
            const shell = doc.createElement("div");
            shell.dataset.pptEditorPluginPanel = opts.id ?? `${pluginId}:panel`;
            shell.style.cssText = [
                "pointer-events:auto",
                "background:var(--popover)",
                "border:1px solid var(--border)",
                "border-radius:8px",
                "box-shadow:var(--shadow-lg,0 8px 24px rgba(0,0,0,.12))",
                "min-width:200px",
                "max-width:320px",
                "overflow:hidden",
                "font:12px ui-sans-serif,system-ui,sans-serif",
                "color:var(--foreground)",
            ].join(";");
            const head = doc.createElement("button");
            head.type = "button";
            head.style.cssText = [
                "display:flex",
                "width:100%",
                "align-items:center",
                "justify-content:space-between",
                "gap:8px",
                "padding:8px 10px",
                "border:none",
                "background:var(--accent)",
                "color:inherit",
                "cursor:pointer",
                "font:inherit",
                "font-weight:600",
            ].join(";");
            head.textContent = opts.title;
            const body = doc.createElement("div");
            body.style.cssText = "padding:8px 10px 10px;display:none";
            let open = opts.initialOpen !== false;
            const sync = () => {
                body.style.display = open ? "block" : "none";
            };
            head.addEventListener("click", () => {
                open = !open;
                sync();
            });
            sync();
            opts.render(body);
            shell.append(head, body);
            panelLayer.appendChild(shell);
            return track({
                remove: () => shell.remove(),
            });
        },
        addRibbonButton(opts) {
            const btn = doc.createElement("button");
            btn.type = "button";
            btn.textContent = opts.label;
            btn.title = opts.tooltip ?? opts.label;
            btn.style.cssText = [
                "pointer-events:auto",
                "padding:4px 10px",
                "border:1px solid var(--border)",
                "border-radius:6px",
                "background:var(--editor-control,var(--secondary))",
                "color:var(--foreground)",
                "font:11px ui-sans-serif,system-ui,sans-serif",
                "cursor:pointer",
            ].join(";");
            btn.addEventListener("click", (e) => opts.onClick(e));
            ribbonLayer.appendChild(btn);
            return track({ remove: () => btn.remove() });
        },
        mount(node) {
            node.style.pointerEvents = "auto";
            root.appendChild(node);
            return track({ remove: () => node.remove() });
        },
    };
}
function removeEditorPluginLayers(root) {
    root.querySelectorAll("[data-ppt-editor-plugin-panels],[data-ppt-editor-plugin-ribbon]").forEach((n) => n.remove());
}
