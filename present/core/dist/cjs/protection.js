"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnprotectFailedError = exports.EditingBlockedError = exports.PROTECTION_META_TAG = exports.PROTECTION_META_KEY = void 0;
exports.getPresentationProtection = getPresentationProtection;
exports.setPresentationProtectionMeta = setPresentationProtectionMeta;
exports.isPresentationEditingBlocked = isPresentationEditingBlocked;
exports.isProtectionCommandLabel = isProtectionCommandLabel;
exports.canApplyEditCommand = canApplyEditCommand;
exports.isEditingBlockedError = isEditingBlockedError;
exports.isUnprotectFailedError = isUnprotectFailedError;
exports.assertCanUnprotect = assertCanUnprotect;
exports.hashProtectionPassword = hashProtectionPassword;
exports.verifyProtectionPassword = verifyProtectionPassword;
exports.protectionRequiresPassword = protectionRequiresPassword;
exports.buildProtectionMeta = buildProtectionMeta;
exports.applyProtectionMeta = applyProtectionMeta;
const office_password_1 = require("./office-password");
exports.PROTECTION_META_KEY = "protection";
/** presentation tags part 中 SlimPPT 保护元数据键名。 */
exports.PROTECTION_META_TAG = "SlimPPT.Protection.v1";
function getPresentationProtection(pres) {
    const raw = pres.meta?.[exports.PROTECTION_META_KEY];
    if (!raw || typeof raw !== "object")
        return undefined;
    const o = raw;
    if (o.kind !== "final" && o.kind !== "restricted")
        return undefined;
    if (typeof o.setAt !== "number")
        return undefined;
    return {
        kind: o.kind,
        setAt: o.setAt,
        passwordHash: typeof o.passwordHash === "string" ? o.passwordHash : undefined,
    };
}
function setPresentationProtectionMeta(pres, protection) {
    if (!protection) {
        if (!pres.meta)
            return;
        const next = { ...pres.meta };
        delete next[exports.PROTECTION_META_KEY];
        pres.meta = Object.keys(next).length ? next : undefined;
        return;
    }
    pres.meta = { ...pres.meta, [exports.PROTECTION_META_KEY]: protection };
}
/** 是否应阻止新的编辑命令（final / restricted 均只读）。 */
function isPresentationEditingBlocked(pres) {
    return getPresentationProtection(pres) !== undefined;
}
function isProtectionCommandLabel(label) {
    return label === "Protect presentation" || label === "Unprotect presentation";
}
/** 当前演示文稿是否允许执行该编辑命令（保护态下仅保护命令可通过）。 */
function canApplyEditCommand(pres, cmd) {
    if (!isPresentationEditingBlocked(pres))
        return true;
    return isProtectionCommandLabel(cmd.label);
}
/** `CommandStack.execute` / 编辑器包装在保护态下拒绝 mutation 时抛出。 */
class EditingBlockedError extends Error {
    code = "EDITING_BLOCKED";
    constructor(message = "Presentation is protected; unprotect before editing.") {
        super(message);
        this.name = "EditingBlockedError";
    }
}
exports.EditingBlockedError = EditingBlockedError;
function isEditingBlockedError(e) {
    return e instanceof EditingBlockedError || (typeof e === "object" && e !== null && e.name === "EditingBlockedError");
}
/** 取消保护失败（未保护 / 缺密码 / 密码错误）。与 EditingBlockedError 一样可供 UI 与 AI 分支处理。 */
class UnprotectFailedError extends Error {
    reason;
    code = "UNPROTECT_FAILED";
    constructor(reason, message) {
        super(message ??
            (reason === "not_protected"
                ? "Presentation is not protected."
                : reason === "password_required"
                    ? "A password is required to unprotect. Pass password from the user; do not guess."
                    : "Incorrect password."));
        this.reason = reason;
        this.name = "UnprotectFailedError";
    }
}
exports.UnprotectFailedError = UnprotectFailedError;
function isUnprotectFailedError(e) {
    return (e instanceof UnprotectFailedError ||
        (typeof e === "object" && e !== null && e.name === "UnprotectFailedError"));
}
/** 取消保护前的共用校验：缺密码或密码错误时抛 UnprotectFailedError。 */
async function assertCanUnprotect(pres, password) {
    const current = getPresentationProtection(pres);
    if (!current)
        throw new UnprotectFailedError("not_protected");
    if (!protectionRequiresPassword(current, pres.modifyVerifier))
        return;
    const supplied = password ?? "";
    if (!supplied.trim())
        throw new UnprotectFailedError("password_required");
    const ok = await verifyProtectionPassword(current, supplied, pres.modifyVerifier);
    if (!ok)
        throw new UnprotectFailedError("incorrect_password");
}
async function hashProtectionPassword(password) {
    const data = new TextEncoder().encode(password);
    if (typeof globalThis.crypto?.subtle?.digest === "function") {
        const buf = await crypto.subtle.digest("SHA-256", data);
        return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
    }
    // 非浏览器环境（回归脚本）简易回退。
    let h = 0;
    for (const c of password)
        h = (Math.imul(31, h) + c.charCodeAt(0)) | 0;
    return `fallback_${(h >>> 0).toString(16)}`;
}
async function verifyProtectionPassword(protection, password, modifyVerifier) {
    if (protection.passwordHash) {
        const hash = await hashProtectionPassword(password);
        return hash === protection.passwordHash;
    }
    if (modifyVerifier && (0, office_password_1.isOfficePasswordVerifier)(modifyVerifier)) {
        return (0, office_password_1.verifyOfficeModifyVerifierPassword)(modifyVerifier, password);
    }
    return true;
}
/** Whether the user must supply a password to clear protection. */
function protectionRequiresPassword(protection, modifyVerifier) {
    if (protection.passwordHash)
        return true;
    return (0, office_password_1.isOfficePasswordVerifier)(modifyVerifier);
}
/** 序列化保护状态（非 OOXML 原生字段，经 tags 侧车 round-trip）。 */
function buildProtectionMeta(pres) {
    const p = getPresentationProtection(pres);
    if (!p)
        return undefined;
    const payload = { v: 1, kind: p.kind, setAt: p.setAt };
    if (p.passwordHash)
        payload.passwordHash = p.passwordHash;
    return JSON.stringify(payload);
}
function applyProtectionMeta(pres, raw) {
    if (!raw?.trim())
        return;
    try {
        const o = JSON.parse(raw);
        if (o.v !== 1)
            return;
        if (o.kind !== "final" && o.kind !== "restricted")
            return;
        if (typeof o.setAt !== "number")
            return;
        setPresentationProtectionMeta(pres, {
            kind: o.kind,
            setAt: o.setAt,
            passwordHash: typeof o.passwordHash === "string" ? o.passwordHash : undefined,
        });
    }
    catch {
        // ignore malformed sidecar
    }
}
