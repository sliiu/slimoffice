// 新建批注贴在落点旁边，不盖住画布，点中的元素写在输入框上面。
import { t } from "./i18n/index.js";
import { bindCommentMentionField } from "./comment-mention.js";
import { DIALOG_INPUT_CSS, Z_MODAL } from "./ui-style.js";
import { bindEditorModal } from "./dialog.js";
const GAP = 12;
const MARGIN = 8;
export function placeCommentPopover(anchor, size, viewport) {
    let left = anchor.x + GAP;
    if (left + size.width > viewport.width - MARGIN) {
        left = anchor.x - GAP - size.width;
    }
    const maxLeft = Math.max(MARGIN, viewport.width - size.width - MARGIN);
    left = Math.min(Math.max(left, MARGIN), maxLeft);
    let top = anchor.y - MARGIN;
    const maxTop = Math.max(MARGIN, viewport.height - size.height - MARGIN);
    top = Math.min(Math.max(top, MARGIN), maxTop);
    return { left, top };
}
export function openAnchoredCommentDialog(doc, opts) {
    return new Promise((resolve) => {
        const overlay = doc.createElement("div");
        overlay.dataset.pptDialog = "1";
        overlay.style.cssText = [
            "position:fixed",
            "inset:0",
            "background:transparent",
            `z-index:${Z_MODAL}`,
        ].join(";");
        const panel = doc.createElement("div");
        panel.dataset.commentComposer = "1";
        panel.style.cssText = [
            "position:fixed",
            "left:0",
            "top:0",
            "visibility:hidden",
            "width:280px",
            "max-width:calc(100vw - 16px)",
            "background:var(--popover)",
            "color:var(--popover-foreground)",
            "border:1px solid var(--border)",
            "border-radius:var(--radius-modal, 12px)",
            "box-shadow:var(--shadow-lg)",
            "display:flex",
            "flex-direction:column",
            "overflow:hidden",
            "font:12px system-ui,sans-serif",
        ].join(";");
        const header = doc.createElement("div");
        header.style.cssText = [
            "padding:10px 14px",
            "border-bottom:1px solid var(--border)",
            "font-size:13px",
            "font-weight:600",
        ].join(";");
        header.textContent = t("comments.new");
        const body = doc.createElement("div");
        body.style.cssText = "display:flex;flex-direction:column;gap:8px;padding:12px 14px;";
        if (opts.targetLabel) {
            const chip = doc.createElement("div");
            chip.className = "ppt-comment-target";
            chip.style.cursor = "default";
            chip.title = t("comments.onShape", { name: opts.targetLabel });
            const text = doc.createElement("span");
            text.className = "ppt-comment-target__text";
            text.textContent = opts.targetLabel;
            chip.appendChild(text);
            body.appendChild(chip);
        }
        const area = doc.createElement("textarea");
        area.rows = 3;
        area.placeholder = t("comments.writeReply");
        area.style.cssText = `${DIALOG_INPUT_CSS};resize:vertical;width:100%;box-sizing:border-box;`;
        const footer = doc.createElement("div");
        footer.style.cssText = "display:flex;justify-content:flex-end;gap:8px;padding:0 14px 12px;";
        const cancelBtn = doc.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.textContent = t("dialog.cancel");
        cancelBtn.style.cssText = btnStyle(false);
        const okBtn = doc.createElement("button");
        okBtn.type = "button";
        okBtn.textContent = t("dialog.ok");
        okBtn.style.cssText = btnStyle(true);
        const syncOk = () => {
            const on = area.value.trim().length > 0;
            okBtn.disabled = !on;
            okBtn.style.opacity = on ? "1" : "0.4";
        };
        syncOk();
        area.addEventListener("input", syncOk);
        let closed = false;
        let release = () => { };
        const finish = (value) => {
            if (closed)
                return;
            closed = true;
            release();
            overlay.remove();
            resolve(value);
        };
        const submit = () => {
            const text = area.value.trim();
            if (!text)
                return false;
            finish(text);
            return true;
        };
        area.addEventListener("keydown", (e) => {
            if (e.key !== "Enter" || e.isComposing)
                return;
            if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey)
                return;
            e.preventDefault();
            e.stopPropagation();
            submit();
        });
        cancelBtn.addEventListener("click", () => finish(null));
        okBtn.addEventListener("click", () => submit());
        body.appendChild(area);
        bindCommentMentionField(area, { names: () => opts.participants ?? [] });
        footer.append(cancelBtn, okBtn);
        panel.append(header, body, footer);
        overlay.appendChild(panel);
        release = bindEditorModal({
            doc,
            overlay,
            onCancel: () => finish(null),
            closeButton: false,
        }).release;
        doc.body.appendChild(overlay);
        const rect = panel.getBoundingClientRect();
        const view = doc.documentElement;
        const pos = placeCommentPopover(opts.anchor, { width: rect.width || 280, height: rect.height || 160 }, { width: view.clientWidth || 1280, height: view.clientHeight || 800 });
        panel.style.left = `${pos.left}px`;
        panel.style.top = `${pos.top}px`;
        panel.style.visibility = "visible";
        area.focus();
    });
}
function btnStyle(primary) {
    return [
        primary ? "background:var(--primary)" : "background:transparent",
        primary ? "color:var(--primary-foreground)" : "color:var(--foreground)",
        primary ? "border:1px solid var(--primary)" : "border:1px solid var(--border)",
        "border-radius:var(--radius-md, 8px)",
        "padding:6px 14px",
        "cursor:pointer",
        "font:inherit",
        "font-size:12px",
    ].join(";");
}
