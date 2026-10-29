// @sliiu/present-ui vanilla DOM primitives — framework-free builders that emit the
// shadcn-flavoured classes from styles.ts. The editor/playground swap their
// ad-hoc cssText buttons/modals for these.
import { bindModalDismiss } from "./modal-session.js";
import { ensureUiStyles } from "./styles.js";
function ownerDoc(opts) {
    return opts?.doc ?? document;
}
export function mkButton(label, opts = {}) {
    const doc = ownerDoc(opts);
    ensureUiStyles(doc);
    const b = doc.createElement("button");
    b.className = "ui-btn";
    b.dataset.variant = opts.variant ?? "default";
    b.dataset.size = opts.size ?? "default";
    b.type = opts.type ?? "button";
    if (opts.title)
        b.title = opts.title;
    if (opts.disabled)
        b.disabled = true;
    if (label)
        b.textContent = label;
    if (opts.onClick)
        b.addEventListener("click", opts.onClick);
    return b;
}
export function mkField(opts = {}) {
    const doc = ownerDoc(opts);
    ensureUiStyles(doc);
    const field = doc.createElement("div");
    field.className = "ui-field";
    if (opts.label) {
        const label = doc.createElement("label");
        label.className = "ui-label";
        label.textContent = opts.label;
        field.appendChild(label);
    }
    const input = opts.options
        ? doc.createElement("select")
        : opts.multiline
            ? doc.createElement("textarea")
            : doc.createElement("input");
    input.className = "ui-input";
    if (input instanceof HTMLSelectElement && opts.options) {
        for (const opt of opts.options) {
            const option = doc.createElement("option");
            option.value = opt.value;
            option.textContent = opt.label ?? opt.value;
            input.appendChild(option);
        }
    }
    else if (!opts.multiline && input instanceof HTMLInputElement) {
        input.type = opts.type ?? "text";
    }
    if (opts.placeholder && !(input instanceof HTMLSelectElement))
        input.placeholder = opts.placeholder;
    if (opts.value != null)
        input.value = opts.value;
    field.appendChild(input);
    if (opts.hint) {
        const hint = doc.createElement("div");
        hint.className = "ui-hint";
        hint.textContent = opts.hint;
        field.appendChild(hint);
    }
    return { field, input };
}
export function mkPanel(opts = {}) {
    const doc = ownerDoc(opts);
    ensureUiStyles(doc);
    const el = doc.createElement("div");
    el.className = opts.card ? "ui-card" : "ui-panel";
    return el;
}
export function mkModal(opts = {}) {
    const doc = ownerDoc(opts);
    ensureUiStyles(doc);
    const dismissable = opts.dismissable ?? true;
    const overlay = doc.createElement("div");
    overlay.className = "ui-overlay";
    const modal = doc.createElement("div");
    modal.className = "ui-modal";
    overlay.appendChild(modal);
    if (opts.title) {
        const head = doc.createElement("div");
        head.className = "ui-modal__head";
        head.textContent = opts.title;
        modal.appendChild(head);
    }
    const body = doc.createElement("div");
    body.className = "ui-modal__body";
    modal.appendChild(body);
    const foot = doc.createElement("div");
    foot.className = "ui-modal__foot";
    modal.appendChild(foot);
    let closed = false;
    let release = () => { };
    const close = () => {
        if (closed)
            return;
        closed = true;
        release();
        overlay.remove();
        opts.onClose?.();
    };
    const open = (host) => {
        (host ?? doc.body).appendChild(overlay);
        if (!closed) {
            release = bindModalDismiss({
                doc,
                overlay,
                panel: modal,
                onCancel: close,
                onSubmit: opts.onSubmit,
                layer: opts.layer ?? "task",
                closeLabel: opts.closeLabel,
                closeButton: dismissable,
                backdropDismiss: dismissable ? undefined : () => false,
                escapeDismiss: dismissable ? undefined : () => false,
            }).release;
        }
        return close;
    };
    return { overlay, modal, body, foot, open, close };
}
const TOAST_ID = "ppt-ui-toast";
/** Hide the current toast. With a token, a replacement toast is left alone. */
export function dismissToast(token, doc) {
    const resolved = doc ?? document;
    const el = resolved.getElementById(TOAST_ID);
    if (!el?.classList.contains("ui-toast--visible"))
        return;
    if (token && el.dataset.token !== token)
        return;
    const prev = Number(el.dataset.timer ?? 0);
    if (prev)
        resolved.defaultView?.clearTimeout(prev);
    delete el.dataset.timer;
    delete el.dataset.token;
    el.classList.remove("ui-toast--visible", "ui-toast--action");
    el.replaceChildren();
}
/** Lightweight status toast above modal overlays. Replaces the previous toast if still visible. */
export function showToast(message, opts = {}) {
    if (!message)
        return;
    const doc = ownerDoc(opts);
    ensureUiStyles(doc);
    let el = doc.getElementById(TOAST_ID);
    if (!el) {
        el = doc.createElement("div");
        el.id = TOAST_ID;
        el.className = "ui-toast";
        el.setAttribute("role", "status");
        el.setAttribute("aria-live", "polite");
        doc.body.appendChild(el);
    }
    const prev = Number(el.dataset.timer ?? 0);
    if (prev)
        doc.defaultView?.clearTimeout(prev);
    delete el.dataset.timer;
    const kind = opts.kind ?? "info";
    el.dataset.kind = kind;
    if (opts.token)
        el.dataset.token = opts.token;
    else
        delete el.dataset.token;
    el.replaceChildren();
    const text = doc.createElement("span");
    text.className = "ui-toast__text";
    text.textContent = message;
    el.appendChild(text);
    const action = opts.action;
    el.classList.toggle("ui-toast--action", Boolean(action));
    if (action) {
        const btn = doc.createElement("button");
        btn.type = "button";
        btn.className = "ui-toast__action";
        btn.textContent = action.label;
        btn.addEventListener("click", () => {
            action.onClick();
            dismissToast(opts.token, doc);
        });
        el.appendChild(btn);
    }
    el.classList.add("ui-toast--visible");
    const duration = opts.durationMs ?? (kind === "err" ? 4000 : 2200);
    if (duration <= 0)
        return;
    const timer = doc.defaultView?.setTimeout(() => {
        if (!el || el.dataset.timer !== String(timer))
            return;
        el.classList.remove("ui-toast--visible", "ui-toast--action");
        delete el.dataset.timer;
        delete el.dataset.token;
    }, duration);
    if (timer !== undefined)
        el.dataset.timer = String(timer);
}
