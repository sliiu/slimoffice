"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openProtectDialog = openProtectDialog;
const dialog_1 = require("./dialog");
const core_1 = require("@sliiu/present-core");
const i18n_1 = require("./i18n");
const insert_meta_1 = require("./insert-meta");
const review_export_1 = require("./review-export");
const ui_style_1 = require("./ui-style");
function openProtectDialog(doc, pres, onApply) {
    const current = (0, core_1.getPresentationProtection)(pres);
    const overlay = doc.createElement("div");
    overlay.className = "local-picker-overlay";
    overlay.style.cssText =
        ui_style_1.DIALOG_OVERLAY_CSS;
    const modal = doc.createElement("div");
    modal.style.cssText =
        "background:var(--popover);color:var(--popover-foreground);border:1px solid var(--border);border-radius:var(--radius-modal,12px);box-shadow:var(--shadow-lg);padding:16px 18px;width:min(440px,92vw);display:flex;flex-direction:column;gap:12px";
    const title = doc.createElement("h3");
    title.style.margin = "0";
    title.textContent = (0, i18n_1.t)("protect.title");
    modal.appendChild(title);
    const hint = doc.createElement("p");
    hint.style.cssText = "margin:0;font-size:12px;color:var(--muted-foreground,#a1a1aa);line-height:1.45";
    hint.textContent = (0, i18n_1.t)("protect.hint");
    modal.appendChild(hint);
    const officeSummary = (0, core_1.summarizeOfficeModifyVerifier)(pres.modifyVerifier);
    if (officeSummary) {
        const officeBanner = doc.createElement("div");
        officeBanner.style.cssText =
            "font-size:12px;line-height:1.45;padding:8px 10px;border-radius:var(--radius-sm,6px);background:color-mix(in srgb, var(--primary) 12%, transparent);border:1px solid color-mix(in srgb, var(--primary) 35%, transparent);color:var(--foreground)";
        officeBanner.textContent = (0, i18n_1.t)("protect.officeNativeBanner", {
            algorithm: officeSummary.algorithm,
            spin: officeSummary.spinCount,
        });
        modal.appendChild(officeBanner);
    }
    const status = doc.createElement("div");
    status.style.cssText = "font-size:12px;color:var(--destructive);min-height:1em";
    modal.appendChild(status);
    const readinessLine = doc.createElement("div");
    readinessLine.style.cssText = "font-size:11px;color:var(--muted-foreground,#a1a1aa);line-height:1.35";
    readinessLine.textContent = (0, review_export_1.formatProtectionReadinessLine)(pres);
    modal.appendChild(readinessLine);
    let modalDismiss;
    const close = () => {
        modalDismiss?.release();
        overlay.remove();
    };
    if (current) {
        const curLabel = doc.createElement("div");
        curLabel.style.fontSize = "13px";
        curLabel.textContent =
            current.kind === "final"
                ? (0, i18n_1.t)("protect.statusFinal")
                : (0, i18n_1.t)("protect.statusRestricted");
        modal.appendChild(curLabel);
        if (current.setAt) {
            const when = doc.createElement("div");
            when.style.cssText = "font-size:12px;color:var(--muted-foreground,#a1a1aa)";
            when.textContent = (0, i18n_1.t)("protect.protectedSince", {
                date: new Date(current.setAt).toLocaleString(),
            });
            modal.appendChild(when);
        }
        const needsPassword = (0, core_1.protectionRequiresPassword)(current, pres.modifyVerifier);
        if (needsPassword) {
            const pwHint = doc.createElement("div");
            pwHint.style.cssText = "font-size:12px;color:var(--warning)";
            pwHint.textContent = (0, i18n_1.t)("protect.passwordRequired");
            modal.appendChild(pwHint);
        }
        const pw = doc.createElement("input");
        pw.type = "password";
        pw.placeholder = (0, i18n_1.t)("protect.passwordPlaceholder");
        pw.style.cssText =
            "width:100%;box-sizing:border-box;background:var(--background);color:inherit;border:1px solid var(--border);border-radius:4px;padding:8px;font:inherit";
        if (!needsPassword)
            pw.style.display = "none";
        else
            modal.appendChild(pw);
        const row = doc.createElement("div");
        row.style.cssText = "display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap";
        const dumpCopy = async (text) => {
            if (!(await (0, insert_meta_1.copyTextToClipboard)(text)))
                throw new Error("copy failed");
        };
        const dumpMenu = (0, ui_style_1.createDevOnlyActionSelect)(doc, (0, i18n_1.t)("developer.dumpMenu"), [
            { label: (0, i18n_1.t)("protect.copyStatus"), run: () => dumpCopy((0, review_export_1.exportProtectionStatusText)(pres)) },
            { label: (0, i18n_1.t)("protect.copyCompact"), run: () => dumpCopy((0, review_export_1.exportProtectionCompactText)(pres)) },
            { label: (0, i18n_1.t)("protect.copyReadiness"), run: () => dumpCopy((0, review_export_1.exportProtectionReadinessText)(pres)) },
        ]);
        const unlockBtn = doc.createElement("button");
        unlockBtn.type = "button";
        unlockBtn.textContent = (0, i18n_1.t)("protect.unprotect");
        unlockBtn.style.cssText =
            "background:var(--primary);color:var(--primary-foreground);border:none;border-radius:4px;padding:8px 14px;cursor:pointer;font:inherit";
        unlockBtn.addEventListener("click", () => {
            void (async () => {
                try {
                    await (0, core_1.assertCanUnprotect)(pres, needsPassword ? pw.value : undefined);
                }
                catch (e) {
                    if ((0, core_1.isUnprotectFailedError)(e)) {
                        status.textContent =
                            e.reason === "incorrect_password" ? (0, i18n_1.t)("protect.badPassword") : (0, i18n_1.t)("protect.passwordRequired");
                        return;
                    }
                    throw e;
                }
                onApply(undefined);
                close();
            })();
        });
        const cancel = doc.createElement("button");
        cancel.type = "button";
        cancel.textContent = (0, i18n_1.t)("protect.close");
        cancel.style.cssText =
            "background:transparent;color:inherit;border:1px solid var(--border);border-radius:4px;padding:8px 14px;cursor:pointer;font:inherit";
        cancel.addEventListener("click", close);
        row.append(dumpMenu, unlockBtn, cancel);
        modal.appendChild(row);
    }
    else {
        let kind = "final";
        const kindRow = doc.createElement("div");
        kindRow.style.cssText = "display:flex;flex-direction:column;gap:6px;font-size:13px";
        const mkRadio = (value, label) => {
            const lab = doc.createElement("label");
            lab.style.cssText = "display:flex;align-items:flex-start;gap:8px;cursor:pointer";
            const rb = doc.createElement("input");
            rb.type = "radio";
            rb.name = "protect-kind";
            rb.checked = value === kind;
            rb.addEventListener("change", () => {
                if (rb.checked) {
                    kind = value;
                    pwRow.style.display = kind === "restricted" ? "block" : "none";
                }
            });
            const span = doc.createElement("span");
            span.textContent = label;
            lab.append(rb, span);
            return lab;
        };
        kindRow.append(mkRadio("final", (0, i18n_1.t)("protect.markFinal")), mkRadio("restricted", (0, i18n_1.t)("protect.restrictEditing")));
        modal.appendChild(kindRow);
        const pwRow = doc.createElement("div");
        pwRow.style.display = "none";
        const pwLabel = doc.createElement("label");
        pwLabel.style.fontSize = "12px";
        pwLabel.textContent = (0, i18n_1.t)("protect.optionalPassword");
        const pw = doc.createElement("input");
        pw.type = "password";
        pw.placeholder = (0, i18n_1.t)("protect.passwordPlaceholder");
        pw.style.cssText =
            "width:100%;box-sizing:border-box;margin-top:4px;background:var(--background);color:inherit;border:1px solid var(--border);border-radius:4px;padding:8px;font:inherit";
        pwRow.append(pwLabel, pw);
        modal.appendChild(pwRow);
        const row = doc.createElement("div");
        row.style.cssText = "display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap";
        const dumpCopy = async (text) => {
            if (!(await (0, insert_meta_1.copyTextToClipboard)(text)))
                throw new Error("copy failed");
        };
        const dumpMenu = (0, ui_style_1.createDevOnlyActionSelect)(doc, (0, i18n_1.t)("developer.dumpMenu"), [
            { label: (0, i18n_1.t)("protect.copyStatus"), run: () => dumpCopy((0, review_export_1.exportProtectionStatusText)(pres)) },
            { label: (0, i18n_1.t)("protect.copyCompact"), run: () => dumpCopy((0, review_export_1.exportProtectionCompactText)(pres)) },
            { label: (0, i18n_1.t)("protect.copyReadiness"), run: () => dumpCopy((0, review_export_1.exportProtectionReadinessText)(pres)) },
        ]);
        const applyBtn = doc.createElement("button");
        applyBtn.type = "button";
        applyBtn.textContent = (0, i18n_1.t)("protect.apply");
        applyBtn.style.cssText =
            "background:var(--primary);color:var(--primary-foreground);border:none;border-radius:4px;padding:8px 14px;cursor:pointer;font:inherit";
        applyBtn.addEventListener("click", () => {
            void (async () => {
                const trimmed = pw.value.trim();
                let officeModifyVerifier;
                if (kind === "restricted" && trimmed) {
                    officeModifyVerifier = await (0, core_1.buildOfficeModifyVerifier)(trimmed);
                }
                onApply({
                    kind,
                    setAt: Date.now(),
                }, officeModifyVerifier);
                close();
            })();
        });
        const cancel = doc.createElement("button");
        cancel.type = "button";
        cancel.textContent = (0, i18n_1.t)("protect.close");
        cancel.style.cssText =
            "background:transparent;color:inherit;border:1px solid var(--border);border-radius:4px;padding:8px 14px;cursor:pointer;font:inherit";
        cancel.addEventListener("click", close);
        row.append(dumpMenu, applyBtn, cancel);
        modal.appendChild(row);
    }
    overlay.appendChild(modal);
    modalDismiss = (0, dialog_1.bindEditorModal)({ doc, overlay, panel: modal, onCancel: close });
    doc.body.appendChild(overlay);
}
